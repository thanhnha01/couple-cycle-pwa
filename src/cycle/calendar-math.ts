import { calendarDate, type CalendarDate } from "../utils/date";

/** Validates untrusted runtime data without using JavaScript Date. */
export function tryCalendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;
  try {
    return calendarDate(value);
  } catch {
    return null;
  }
}

function parse(value: CalendarDate): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) throw new TypeError("CalendarDate must use YYYY-MM-DD.");
  return { year, month, day };
}

/** Days since 1970-01-01 using proleptic Gregorian civil-date arithmetic. */
export function calendarDateToDayNumber(value: CalendarDate): number {
  const { year: inputYear, month, day } = parse(value);
  const year = inputYear - (month <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

export function dayNumberToCalendarDate(dayNumber: number): CalendarDate {
  const shifted = dayNumber + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365);
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  if (year < 0 || year > 9999) throw new RangeError("CalendarDate is outside the supported YYYY-MM-DD range.");
  return calendarDate(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

export function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  if (!Number.isSafeInteger(days)) throw new TypeError("Calendar day offset must be a safe integer.");
  return dayNumberToCalendarDate(calendarDateToDayNumber(value) + days);
}

export function calendarDaysBetween(start: CalendarDate, end: CalendarDate): number {
  return calendarDateToDayNumber(end) - calendarDateToDayNumber(start);
}
