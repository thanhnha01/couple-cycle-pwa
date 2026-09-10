import { addCalendarDays } from "./calendar-math";
import type { CyclePrediction, Period } from "./types";
import type { CalendarDate } from "../utils/date";

export type FertilityStatus = "period" | "ovulation" | "fertile" | "lower" | "unknown";

export interface FertilityEstimate {
  status: FertilityStatus;
  label: string;
  confidence: CyclePrediction["confidence"]["level"];
  window: { start: CalendarDate; end: CalendarDate } | null;
}

/** A reference estimate only; never represents contraception or medical advice. */
export function estimateFertility(periods: readonly Period[], prediction: CyclePrediction, date: CalendarDate): FertilityEstimate {
  const current = periods.find((period) => period.startDate <= date && (period.endDate === undefined || period.endDate >= date));
  if (current) return { status: "period", label: "Kỳ kinh đã ghi nhận", confidence: prediction.confidence.level, window: null };
  if (!prediction.expectedDate || !prediction.cycleLength.expected || prediction.confidence.level === "insufficient") {
    return { status: "unknown", label: "Đang thu thập thêm dữ liệu", confidence: "insufficient", window: null };
  }
  const ovulation = addCalendarDays(prediction.expectedDate, -14);
  const window = { start: addCalendarDays(ovulation, -4), end: addCalendarDays(ovulation, 1) };
  if (date === ovulation) return { status: "ovulation", label: "Ngày rụng trứng dự kiến", confidence: prediction.confidence.level, window };
  if (date >= window.start && date <= window.end) return { status: "fertile", label: "Khoảng dễ thụ thai dự kiến", confidence: prediction.confidence.level, window };
  return { status: "lower", label: "Khả năng thụ thai thấp hơn", confidence: prediction.confidence.level, window };
}
