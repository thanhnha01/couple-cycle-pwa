import { calendarDate, type CalendarDate } from "../utils/date";

const DAY = 86_400_000;
const milestones = [30, 50, 100, 200, 365, 500, 1000];

function toUtc(date: CalendarDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

export function loveDayCount(startDate: CalendarDate, asOfDate: CalendarDate): number {
  return Math.max(1, Math.floor((toUtc(asOfDate) - toUtc(startDate)) / DAY) + 1);
}

export function nextLoveMilestone(dayCount: number): number {
  const preset = milestones.find((value) => value > dayCount);
  if (preset !== undefined) return preset;
  const year = Math.floor(dayCount / 365) + 1;
  const nextYear = year * 365;
  if (nextYear > dayCount) return nextYear;
  return (Math.floor(dayCount / 500) + 1) * 500;
}

export function loveDateFromInput(value: string): CalendarDate | null {
  try { return calendarDate(value); } catch { return null; }
}
