import { get, onValue, push, ref, remove, serverTimestamp, set, type Unsubscribe } from "firebase/database";
import { getFirebaseDatabase } from "../firebase/database";
import { calendarDate, timestamp } from "../utils/date";
import type { CoupleEvent, CreateCoupleEventInput, CoupleEventKind } from "./types";

const localKey = (coupleId: string) => `nhip-doi:events:${coupleId}`;

function parseEvents(coupleId: string, value: unknown): CoupleEvent[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, Record<string, unknown>>).flatMap(([id, event]) => {
    if (typeof event.title !== "string" || typeof event.date !== "string" || typeof event.kind !== "string" || typeof event.createdAt !== "number" || typeof event.createdBy !== "string") return [];
    if (!(["anniversary", "birthday", "holiday", "date", "custom"] as string[]).includes(event.kind)) return [];
    const reminderDays = Array.isArray(event.reminderDays) ? event.reminderDays.filter((day): day is number => typeof day === "number" && day >= 0 && day <= 30) : [];
    try { return [{ id, coupleId, title: event.title, date: calendarDate(event.date), kind: event.kind as CoupleEventKind, reminderDays, createdAt: timestamp(event.createdAt), createdBy: event.createdBy }]; } catch { return []; }
  }).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function localEvents(coupleId: string): CoupleEvent[] {
  try { return parseEvents(coupleId, JSON.parse(localStorage.getItem(localKey(coupleId)) ?? "{}")); } catch { return []; }
}

function saveLocal(coupleId: string, events: readonly CoupleEvent[]): void {
  try { localStorage.setItem(localKey(coupleId), JSON.stringify(Object.fromEntries(events.map((event) => [event.id, event])))); } catch { /* A private browser can decline storage. */ }
}

export class CoupleEventService {
  constructor(private readonly remoteEnabled: boolean) {}

  async list(coupleId: string): Promise<CoupleEvent[]> {
    if (!this.remoteEnabled) return localEvents(coupleId);
    const snapshot = await get(ref(getFirebaseDatabase(), `couples/${coupleId}/events`));
    return parseEvents(coupleId, snapshot.val());
  }

  subscribe(coupleId: string, callback: (events: CoupleEvent[]) => void): Unsubscribe {
    if (!this.remoteEnabled) { callback(localEvents(coupleId)); return () => undefined; }
    return onValue(ref(getFirebaseDatabase(), `couples/${coupleId}/events`), (snapshot) => callback(parseEvents(coupleId, snapshot.val())));
  }

  async create(coupleId: string, uid: string, input: CreateCoupleEventInput): Promise<void> {
    const title = input.title.trim();
    if (title.length < 2 || title.length > 80) throw new Error("Tên sự kiện cần có từ 2 đến 80 ký tự.");
    const reminderDays = [...new Set(input.reminderDays)].filter((day) => Number.isInteger(day) && day >= 0 && day <= 30).sort((a, b) => b - a);
    if (!this.remoteEnabled) {
      const event: CoupleEvent = { id: crypto.randomUUID(), coupleId, title, date: input.date, kind: input.kind, reminderDays, createdAt: timestamp(), createdBy: uid };
      saveLocal(coupleId, [...localEvents(coupleId), event]);
      return;
    }
    const target = push(ref(getFirebaseDatabase(), `couples/${coupleId}/events`));
    await set(target, { title, date: input.date, kind: input.kind, reminderDays, createdAt: serverTimestamp(), createdBy: uid });
  }

  async remove(coupleId: string, eventId: string): Promise<void> {
    if (!this.remoteEnabled) { saveLocal(coupleId, localEvents(coupleId).filter((event) => event.id !== eventId)); return; }
    await remove(ref(getFirebaseDatabase(), `couples/${coupleId}/events/${eventId}`));
  }
}
