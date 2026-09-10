import type { Period } from "../cycle/types";
import { timestamp } from "../utils/date";
import { hasPeriodErrors, validatePeriodInput } from "../periods/validation";
import { PeriodValidationError } from "../periods/service";
import type { PeriodInput, PeriodMutationResult, PeriodRepository } from "../periods/types";
import type { SyncOperation, SyncState } from "./types";

export interface OfflinePeriodStore {
  listPeriods(coupleId: string): Promise<Period[]>;
  savePeriod(period: Period): Promise<void>;
  removePeriod(id: string): Promise<void>;
  listOperations(coupleId: string): Promise<SyncOperation[]>;
  saveOperation(operation: SyncOperation): Promise<void>;
  removeOperation(id: string): Promise<void>;
  /** Must commit the local entity mutation and its outbox operation together. */
  persistMutation(period: Period | undefined, removedPeriodId: string | undefined, operation: SyncOperation): Promise<void>;
}

export interface OfflinePeriodServiceOptions {
  store: OfflinePeriodStore;
  remote?: PeriodRepository;
  isOnline?: () => boolean;
  now?: () => number;
  onChange?: (periods: readonly Period[], state: SyncState, operations: readonly SyncOperation[]) => void;
}

const MAX_RETRIES = 5;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

function newId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") throw new Error("crypto.randomUUID is required.");
  return crypto.randomUUID();
}

function order(left: SyncOperation, right: SyncOperation): number {
  return Number(left.createdAt) - Number(right.createdAt) || left.id.localeCompare(right.id);
}

function operationId(periodId: string, action: SyncOperation["action"], revision: number): string {
  // It is derived exclusively from durable entity identity and revision, so retries never create a new operation.
  return `period:${periodId}:${action}:${revision}`;
}

export class OfflinePeriodService {
  private periods: Period[] = [];
  private operations: SyncOperation[] = [];
  private state: SyncState = "synced";
  private replaying = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor(private readonly options: OfflinePeriodServiceOptions) {}

  async restore(coupleId: string): Promise<Period[]> {
    this.periods = (await this.options.store.listPeriods(coupleId)).sort(sortPeriods);
    const restored = (await this.options.store.listOperations(coupleId)).filter((operation) => operation.status !== "completed");
    // A tab can close after marking an operation processing but before the server response.
    // Its deterministic operation id makes retrying this state safe.
    const recovered = restored.map((operation) => operation.status === "processing"
      ? { ...operation, status: "pending" as const, updatedAt: timestamp(this.now()), error: undefined, nextRetryAt: undefined }
      : operation);
    await Promise.all(recovered.filter((operation, index) => operation !== restored[index]).map((operation) => this.options.store.saveOperation(operation)));
    this.operations = recovered.sort(order);
    this.refreshState();
    this.emit();
    return this.periods;
  }

  snapshot(): { periods: readonly Period[]; state: SyncState; operations: readonly SyncOperation[] } {
    return { periods: this.periods, state: this.state, operations: this.operations };
  }

  async create(coupleId: string, uid: string, input: PeriodInput, current: readonly Period[] = this.periods): Promise<PeriodMutationResult> {
    const issues = validatePeriodInput(input, current);
    if (hasPeriodErrors(issues)) throw new PeriodValidationError(issues);
    const now = timestamp(this.now());
    const period: Period = { id: newId(), coupleId, ...input, createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid, revision: 1 };
    await this.queue(period, undefined, uid, "create", period.revision, undefined);
    return { period, warnings: issues };
  }

  async update(period: Period, uid: string, input: PeriodInput, current: readonly Period[] = this.periods): Promise<PeriodMutationResult> {
    const issues = validatePeriodInput(input, current, period.id);
    if (hasPeriodErrors(issues)) throw new PeriodValidationError(issues);
    const updated: Period = { ...period, ...input, updatedAt: timestamp(this.now()), updatedBy: uid, revision: period.revision + 1 };
    await this.queue(updated, undefined, uid, "update", updated.revision, period.revision);
    return { period: updated, warnings: issues };
  }

  async remove(period: Period): Promise<void> {
    await this.queue(undefined, period.id, period.updatedBy, "delete", period.revision, period.revision, period);
  }

  async restoreDeleted(period: Period): Promise<void> {
    // Undo is another local mutation, retaining the original stable period id.
    await this.queue({ ...period, updatedAt: timestamp(this.now()), revision: period.revision }, undefined, period.updatedBy, "create", period.revision, undefined);
  }

  async replay(): Promise<void> {
    if (this.replaying || !this.options.remote || !this.online()) { this.refreshState(); this.emit(); return; }
    this.replaying = true;
    const replayGeneration = this.generation;
    this.state = "syncing";
    this.emit();
    try {
      while (true) {
        if (replayGeneration !== this.generation) break;
        const operation = this.operations.filter((item) => item.status === "pending" || item.status === "failed").sort(order)[0];
        if (!operation || !this.online()) break;
        if (operation.nextRetryAt && Number(operation.nextRetryAt) > this.now()) { this.scheduleRetry(Number(operation.nextRetryAt) - this.now()); break; }
        try {
          await this.apply(operation);
        } catch {
          break;
        }
      }
    } finally {
      this.replaying = false;
      this.refreshState();
      this.emit();
    }
  }

  /** Applies server listener data without clobbering local work that still needs replay. */
  async applyRemote(periods: Period[]): Promise<void> {
    const pendingEntityIds = new Set(this.operations.filter((operation) => operation.status !== "completed").map((operation) => operation.entityId));
    const localOnly = this.periods.filter((period) => pendingEntityIds.has(period.id));
    const remoteSafe = periods.filter((period) => !pendingEntityIds.has(period.id));
    const removedRemoteIds = this.periods
      .filter((period) => !pendingEntityIds.has(period.id) && !remoteSafe.some((remote) => remote.id === period.id))
      .map((period) => period.id);
    this.periods = [...remoteSafe, ...localOnly].sort(sortPeriods);
    await Promise.all([...remoteSafe.map((period) => this.options.store.savePeriod(period)), ...removedRemoteIds.map((id) => this.options.store.removePeriod(id))]);
    this.emit();
  }

  /** Removes another account's in-memory projection before auth state can render it. Durable records remain partitioned by couple. */
  reset(): void {
    this.dispose();
    this.generation += 1;
    this.periods = [];
    this.operations = [];
    this.replaying = false;
    this.state = this.online() ? "synced" : "offline";
    this.emit();
  }

  dispose(): void {
    if (this.retryTimer !== undefined) globalThis.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  private async queue(period: Period | undefined, removedPeriodId: string | undefined, uid: string, action: SyncOperation["action"], revision: number, expectedRevision?: number, deleted?: Period): Promise<void> {
    const now = timestamp(this.now());
    const entity = period ?? deleted;
    if (!entity) throw new Error("A period mutation needs an entity.");
    const operation: SyncOperation = {
      id: operationId(entity.id, action, revision), coupleId: entity.coupleId, uid, entityType: "period", entityId: entity.id, action,
      payload: action === "delete" ? deleted : period, expectedRevision, status: "pending", attempts: 0, createdAt: now, updatedAt: now,
    };
    // Never update the UI before this resolves: this is the durable-local-success boundary.
    await this.options.store.persistMutation(period, removedPeriodId, operation);
    this.periods = period ? replace(this.periods, period) : this.periods.filter((item) => item.id !== removedPeriodId);
    this.operations = replaceOperation(this.operations, operation);
    this.refreshState();
    this.emit();
    void this.replay();
  }

  private async apply(operation: SyncOperation): Promise<void> {
    const remote = this.options.remote!;
    const inFlight = { ...operation, status: "processing" as const, attempts: operation.attempts + 1, updatedAt: timestamp(this.now()), error: undefined, nextRetryAt: undefined };
    await this.options.store.saveOperation(inFlight);
    this.operations = replaceOperation(this.operations, inFlight);
    try {
      const period = operation.payload as Period;
      if (operation.action === "create") await remote.create(period, operation.id);
      if (operation.action === "update") await remote.update(period.coupleId, period.id, { startDate: period.startDate, endDate: period.endDate! }, operation.expectedRevision ?? 0, operation.uid, operation.id);
      if (operation.action === "delete") await remote.remove(period.coupleId, period.id, operation.expectedRevision, operation.id);
      await this.options.store.removeOperation(operation.id);
      this.operations = this.operations.filter((item) => item.id !== operation.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Đồng bộ chưa thành công.";
      const conflict = /changed on another device|conflict|stale/i.test(message);
      const attempts = inFlight.attempts;
      const failed: SyncOperation = {
        ...inFlight,
        status: conflict ? "conflict" : "failed",
        error: message,
        nextRetryAt: conflict || attempts >= MAX_RETRIES ? undefined : timestamp(this.now() + BACKOFF_MS[attempts - 1]!),
        updatedAt: timestamp(this.now()),
      };
      await this.options.store.saveOperation(failed);
      this.operations = replaceOperation(this.operations, failed);
      if (failed.nextRetryAt) this.scheduleRetry(Number(failed.nextRetryAt) - this.now());
      // Global operation order is intentional: a later mutation must never overtake a failed earlier mutation.
      throw error;
    }
  }

  private scheduleRetry(delay: number): void {
    if (this.retryTimer !== undefined) return;
    this.retryTimer = globalThis.setTimeout(() => { this.retryTimer = undefined; void this.replay(); }, Math.max(0, delay));
  }

  private online(): boolean { return this.options.isOnline?.() ?? (typeof navigator === "undefined" || navigator.onLine); }
  private now(): number { return this.options.now?.() ?? Date.now(); }
  private refreshState(): void {
    if (!this.online()) this.state = "offline";
    else if (this.replaying) this.state = "syncing";
    else if (this.operations.some((operation) => operation.status === "conflict" || (operation.status === "failed" && operation.attempts >= MAX_RETRIES))) this.state = "error";
    else if (this.operations.length) this.state = "pending";
    else this.state = "synced";
  }
  private emit(): void { this.options.onChange?.(this.periods, this.state, this.operations); }
}

function replace(items: Period[], period: Period): Period[] { return [...items.filter((item) => item.id !== period.id), period].sort(sortPeriods); }
function replaceOperation(items: SyncOperation[], operation: SyncOperation): SyncOperation[] { return [...items.filter((item) => item.id !== operation.id), operation].sort(order); }
function sortPeriods(left: Period, right: Period): number { return right.startDate.localeCompare(left.startDate) || right.id.localeCompare(left.id); }
