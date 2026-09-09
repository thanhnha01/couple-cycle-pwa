import type { CalendarDate, Timestamp } from "../utils/date";
import type { Period } from "../cycle/types";

export interface PeriodInput {
  startDate: CalendarDate;
  endDate: CalendarDate;
}

export type PeriodValidationCode = "DUPLICATE_START" | "OVERLAP" | "END_BEFORE_START" | "LONG_DURATION";

export interface PeriodValidationIssue {
  code: PeriodValidationCode;
  severity: "error" | "warning";
  periodId?: string;
}

export interface PeriodRepository {
  list(coupleId: string): Promise<Period[]>;
  create(period: Period, operationId?: string): Promise<void>;
  update(coupleId: string, periodId: string, input: PeriodInput, expectedRevision: number, updatedBy: string, operationId?: string): Promise<Period>;
  remove(coupleId: string, periodId: string, expectedRevision?: number, operationId?: string): Promise<void>;
}

export interface PeriodMutationResult {
  period: Period;
  warnings: PeriodValidationIssue[];
}

export interface PeriodSnapshot {
  id: string;
  coupleId: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  revision: number;
}
