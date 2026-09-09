import { calendarDaysBetween } from "../cycle/calendar-math";
import type { Period } from "../cycle/types";
import { calendarDate, type CalendarDate } from "../utils/date";
import type { PeriodInput, PeriodValidationIssue } from "./types";

export const LONG_PERIOD_DURATION_DAYS = 10;

/** The sole period lookup used by calendar selection and CRUD entry points. */
export function findPeriodContaining(periods: readonly Period[], date: CalendarDate): Period | undefined {
  return periods.find((period) => period.endDate !== undefined && period.startDate <= date && date <= period.endDate);
}

export function validatePeriodInput(input: PeriodInput, periods: readonly Period[], excludingPeriodId?: string): PeriodValidationIssue[] {
  // Re-check runtime values received from form controls or remote state.
  calendarDate(input.startDate);
  calendarDate(input.endDate);
  const issues: PeriodValidationIssue[] = [];
  if (input.endDate < input.startDate) {
    issues.push({ code: "END_BEFORE_START", severity: "error" });
    return issues;
  }
  for (const period of periods) {
    if (period.id === excludingPeriodId) continue;
    if (period.startDate === input.startDate) issues.push({ code: "DUPLICATE_START", severity: "error", periodId: period.id });
    if (period.endDate === undefined) continue;
    if (input.startDate <= period.endDate && period.startDate <= input.endDate) {
      issues.push({ code: "OVERLAP", severity: "error", periodId: period.id });
    }
  }
  if (calendarDaysBetween(input.startDate, input.endDate) + 1 > LONG_PERIOD_DURATION_DAYS) {
    issues.push({ code: "LONG_DURATION", severity: "warning" });
  }
  return issues;
}

export function hasPeriodErrors(issues: readonly PeriodValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
