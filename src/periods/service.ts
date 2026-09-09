import type { Period } from "../cycle/types";
import { timestamp } from "../utils/date";
import { hasPeriodErrors, validatePeriodInput } from "./validation";
import type { PeriodInput, PeriodMutationResult, PeriodRepository, PeriodValidationIssue } from "./types";

function createPeriodId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") throw new Error("crypto.randomUUID is required to create periods.");
  return crypto.randomUUID();
}

export class PeriodService {
  constructor(private readonly repository: PeriodRepository) {}

  async list(coupleId: string): Promise<Period[]> {
    return this.repository.list(coupleId);
  }

  async create(coupleId: string, uid: string, input: PeriodInput, periods: readonly Period[]): Promise<PeriodMutationResult> {
    const issues = validatePeriodInput(input, periods);
    if (hasPeriodErrors(issues)) throw new PeriodValidationError(issues);
    const now = timestamp();
    const period: Period = {
      id: createPeriodId(), coupleId, ...input, createdAt: now, createdBy: uid, updatedAt: now, updatedBy: uid, revision: 1,
    };
    await this.repository.create(period);
    return { period, warnings: issues };
  }

  async update(period: Period, uid: string, input: PeriodInput, periods: readonly Period[]): Promise<PeriodMutationResult> {
    const issues = validatePeriodInput(input, periods, period.id);
    if (hasPeriodErrors(issues)) throw new PeriodValidationError(issues);
    const updated = await this.repository.update(period.coupleId, period.id, input, period.revision, uid);
    return { period: updated, warnings: issues };
  }

  async remove(period: Period): Promise<void> {
    await this.repository.remove(period.coupleId, period.id);
  }

  async restore(period: Period): Promise<void> {
    await this.repository.create(period);
  }
}

export class PeriodValidationError extends Error {
  constructor(readonly issues: PeriodValidationIssue[]) {
    super("Period validation failed.");
  }
}
