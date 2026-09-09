import { addCalendarDays, calendarDateToDayNumber } from "../cycle/calendar-math";
import { calendarDate, type CalendarDate } from "../utils/date";

export interface CalendarDay {
  date: CalendarDate;
  inMonth: boolean;
}

export function shiftCalendarMonth(year: number, month: number, amount: number): { year: number; month: number } {
  const absoluteMonth = year * 12 + (month - 1) + amount;
  return { year: Math.floor(absoluteMonth / 12), month: (absoluteMonth % 12 + 12) % 12 + 1 };
}

export function mondayWeekdayIndex(date: CalendarDate): number {
  return (calendarDateToDayNumber(date) + 3) % 7;
}

export function monthCalendarGrid(year: number, month: number): CalendarDay[] {
  const first = calendarDate(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`);
  // 1970-01-01 was Thursday; convert Sunday=0 to Monday=0.
  const mondayOffset = mondayWeekdayIndex(first);
  const start = addCalendarDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addCalendarDays(start, index);
    return { date, inMonth: date.slice(0, 7) === first.slice(0, 7) };
  });
}
