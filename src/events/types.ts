import type { CalendarDate, Timestamp } from "../utils/date";

export type CoupleEventKind = "anniversary" | "birthday" | "holiday" | "date" | "custom";

export interface CoupleEvent {
  id: string;
  coupleId: string;
  title: string;
  date: CalendarDate;
  kind: CoupleEventKind;
  reminderDays: readonly number[];
  createdAt: Timestamp;
  createdBy: string;
}

export interface CreateCoupleEventInput {
  title: string;
  date: CalendarDate;
  kind: CoupleEventKind;
  reminderDays: readonly number[];
}
