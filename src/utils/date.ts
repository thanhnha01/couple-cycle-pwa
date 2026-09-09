export type CalendarDate = string & { readonly __calendarDate: unique symbol };
export type Timestamp = number & { readonly __timestamp: unique symbol };

const CALENDAR_DATE_PATTERN = /^(\d{2})-(\d{2})-(\d{4})$/;

export function calendarDate(value: string): CalendarDate {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) throw new TypeError("CalendarDate must use DD-MM-YYYY.");

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new TypeError("CalendarDate must be a valid date.");
  }

  return value as CalendarDate;
}

export function timestamp(value: number = Date.now()): Timestamp {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("Timestamp must be a non-negative number.");
  return value as Timestamp;
}
