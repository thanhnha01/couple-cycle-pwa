import type { CalendarDate, Timestamp } from "../utils/date";

export type Mood = "vui" | "on" | "met" | "can-om";

export interface PrivateCheckIn {
  date: CalendarDate;
  coupleId: string;
  mood: Mood;
  createdAt: Timestamp;
}

export interface SharedTask {
  id: string;
  coupleId: string;
  title: string;
  completed: boolean;
  createdAt: Timestamp;
  createdBy: string;
  completedAt?: Timestamp;
  completedBy?: string;
}
