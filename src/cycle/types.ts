import type { CalendarDate, Timestamp } from "../utils/date";

export interface Period {
  id: string;
  coupleId: string;
  startDate: CalendarDate;
  endDate?: CalendarDate;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CyclePrediction {
  id: string;
  coupleId: string;
  nextPeriodStart: CalendarDate;
  fertileWindowStart?: CalendarDate;
  fertileWindowEnd?: CalendarDate;
  generatedAt: Timestamp;
  updatedAt: Timestamp;
}
