import { describe, expect, it } from "vitest";
import { calendarDate, timestamp } from "../utils/date";
import type { Period } from "../cycle/types";
import { PeriodService } from "./service";
import type { PeriodInput, PeriodRepository } from "./types";

class MemoryPeriods implements PeriodRepository {
  periods: Period[] = [];
  async list(): Promise<Period[]> { return this.periods; }
  async create(period: Period): Promise<void> { this.periods.push(period); }
  async update(coupleId: string, periodId: string, input: PeriodInput, expectedRevision: number, updatedBy: string): Promise<Period> {
    const current = this.periods.find((period) => period.coupleId === coupleId && period.id === periodId);
    if (!current || current.revision !== expectedRevision) throw new Error("conflict");
    const next = { ...current, ...input, updatedBy, revision: current.revision + 1, updatedAt: timestamp(2) };
    this.periods = this.periods.map((period) => period.id === periodId ? next : period);
    return next;
  }
  async remove(coupleId: string, periodId: string): Promise<void> { this.periods = this.periods.filter((period) => period.coupleId !== coupleId || period.id !== periodId); }
}

describe("PeriodService", () => {
  it("creates a UUID period and restores the same id for Undo", async () => {
    const repository = new MemoryPeriods();
    const service = new PeriodService(repository);
    const created = await service.create("couple", "user", { startDate: calendarDate("2026-09-09"), endDate: calendarDate("2026-09-13") }, []);
    expect(created.period.id).toMatch(/^[0-9a-f-]{36}$/iu);
    await service.remove(created.period);
    expect(repository.periods).toHaveLength(0);
    await service.restore(created.period);
    expect(repository.periods[0]?.id).toBe(created.period.id);
  });
});
