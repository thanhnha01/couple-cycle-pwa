import { describe, expect, it, vi } from "vitest";
import { calendarDate, timestamp } from "../utils/date";
import type { Period } from "../cycle/types";
import type { PeriodInput, PeriodRepository } from "../periods/types";
import { OfflinePeriodService, type OfflinePeriodStore } from "./offlinePeriodService";
import type { SyncOperation } from "./types";

class MemoryStore implements OfflinePeriodStore {
  periods: Period[] = [];
  operations: SyncOperation[] = [];
  async listPeriods(coupleId: string): Promise<Period[]> { return this.periods.filter((period) => period.coupleId === coupleId); }
  async savePeriod(period: Period): Promise<void> { this.periods = [...this.periods.filter((item) => item.id !== period.id), period]; }
  async removePeriod(id: string): Promise<void> { this.periods = this.periods.filter((item) => item.id !== id); }
  async listOperations(coupleId: string): Promise<SyncOperation[]> { return this.operations.filter((operation) => operation.coupleId === coupleId); }
  async saveOperation(operation: SyncOperation): Promise<void> { this.operations = [...this.operations.filter((item) => item.id !== operation.id), operation]; }
  async removeOperation(id: string): Promise<void> { this.operations = this.operations.filter((item) => item.id !== id); }
  async persistMutation(period: Period | undefined, removedId: string | undefined, operation: SyncOperation): Promise<void> {
    if (period) await this.savePeriod(period);
    if (removedId) await this.removePeriod(removedId);
    await this.saveOperation(operation);
  }
}

class Remote implements PeriodRepository {
  periods = new Map<string, Period>();
  creates: string[] = [];
  updates: string[] = [];
  async list(): Promise<Period[]> { return [...this.periods.values()]; }
  async create(period: Period, operationId?: string): Promise<void> { this.creates.push(operationId ?? ""); if (this.periods.has(period.id)) throw new Error("conflict"); this.periods.set(period.id, period); }
  async update(coupleId: string, periodId: string, input: PeriodInput, expectedRevision: number, updatedBy: string, operationId?: string): Promise<Period> {
    this.updates.push(operationId ?? ""); const current = this.periods.get(periodId); if (!current || current.coupleId !== coupleId || current.revision !== expectedRevision) throw new Error("conflict");
    const next = { ...current, ...input, revision: current.revision + 1, updatedBy, updatedAt: timestamp(10) }; this.periods.set(periodId, next); return next;
  }
  async remove(coupleId: string, periodId: string, expectedRevision?: number): Promise<void> { const current = this.periods.get(periodId); if (current && (current.coupleId !== coupleId || (expectedRevision !== undefined && current.revision !== expectedRevision))) throw new Error("conflict"); this.periods.delete(periodId); }
}

const input = { startDate: calendarDate("2026-09-01"), endDate: calendarDate("2026-09-05") };

describe("OfflinePeriodService", () => {
  it("restores cache, persists offline mutations, then replays stable operations in order", async () => {
    const store = new MemoryStore(); const remote = new Remote(); let online = false;
    const service = new OfflinePeriodService({ store, remote, isOnline: () => online, now: () => 1 });
    await service.restore("c");
    const created = await service.create("c", "u", input, []);
    await service.update(created.period, "u", { ...input, endDate: calendarDate("2026-09-06") });
    expect(store.periods[0]?.endDate).toBe("2026-09-06");
    expect(store.operations.map((operation) => operation.id)).toEqual([`period:${created.period.id}:create:1`, `period:${created.period.id}:update:2`]);
    expect(service.snapshot().state).toBe("offline");
    online = true; await service.replay();
    expect(remote.creates).toHaveLength(1); expect(remote.updates).toHaveLength(1);
    expect(store.operations).toHaveLength(0); expect(service.snapshot().state).toBe("synced");
  });

  it("keeps conflict operations for recovery without overwriting the remote record", async () => {
    const store = new MemoryStore(); const remote = new Remote();
    const service = new OfflinePeriodService({ store, remote, isOnline: () => false, now: () => 1 });
    const created = await service.create("c", "u", input, []);
    await service.restore("c");
    await remote.create({ ...created.period, revision: 2 });
    const onlineService = new OfflinePeriodService({ store, remote, isOnline: () => true, now: () => 2 });
    await onlineService.restore("c"); await onlineService.replay();
    expect(onlineService.snapshot().operations[0]?.status).toBe("conflict");
    expect(onlineService.snapshot().state).toBe("error");
    expect(remote.periods.get(created.period.id)?.revision).toBe(2);
  });

  it("uses bounded backoff and leaves a failed operation durable", async () => {
    const store = new MemoryStore(); const remote = new Remote();
    remote.create = vi.fn(async () => { throw new Error("network unavailable"); });
    const service = new OfflinePeriodService({ store, remote, isOnline: () => true, now: () => 1 });
    await service.restore("c"); await service.create("c", "u", input, []);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.operations[0]?.status).toBe("failed");
    expect(Number(store.operations[0]?.nextRetryAt)).toBe(1001);
    service.dispose();
  });
});
