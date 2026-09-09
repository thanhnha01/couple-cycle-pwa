export type CalendarDate = string & { readonly __calendarDate: unique symbol };
export type Timestamp = number & { readonly __timestamp: unique symbol };

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthLengths[month - 1] ?? 0;
}

/** Creates a date-only value in the canonical YYYY-MM-DD storage format. */
export function calendarDate(value: string): CalendarDate {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new TypeError("CalendarDate must use YYYY-MM-DD.");

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new TypeError("CalendarDate must be a valid date.");
  }

  return value as CalendarDate;
}

/** Formats a canonical CalendarDate for date-only UI display without timezone conversion. */
export function formatCalendarDate(value: CalendarDate): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function timestamp(value: number = Date.now()): Timestamp {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("Timestamp must be a non-negative number.");
  return value as Timestamp;
}
