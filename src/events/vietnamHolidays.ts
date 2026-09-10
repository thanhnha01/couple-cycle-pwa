import { calendarDate, type CalendarDate } from "../utils/date";

export interface VietnamHoliday { title: string; date: CalendarDate; }

/** Solar-calendar occasions that couples commonly choose to remember. Lunar holidays need a lunar calendar source and are intentionally not guessed. */
export function vietnamHolidays(year: number): VietnamHoliday[] {
  const item = (month: number, day: number, title: string): VietnamHoliday => ({ title, date: calendarDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`) });
  return [item(1, 1, "Tết Dương lịch"), item(2, 14, "Lễ tình nhân"), item(3, 8, "Quốc tế Phụ nữ"), item(4, 30, "Ngày Giải phóng miền Nam"), item(5, 1, "Quốc tế Lao động"), item(9, 2, "Quốc khánh"), item(10, 20, "Ngày Phụ nữ Việt Nam"), item(12, 24, "Giáng sinh")];
}

export function suggestedHolidays(from: CalendarDate): VietnamHoliday[] {
  const year = Number(from.slice(0, 4));
  return [...vietnamHolidays(year), ...vietnamHolidays(year + 1)].filter((holiday) => holiday.date >= from).slice(0, 4);
}
