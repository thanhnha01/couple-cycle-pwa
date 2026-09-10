import { get, onValue, push, ref, serverTimestamp, set, update, type Unsubscribe } from "firebase/database";
import { getFirebaseDatabase } from "../firebase/database";
import { calendarDate, timestamp } from "../utils/date";
import type { Mood, PrivateCheckIn, SharedTask } from "./types";

const localTasksKey = (coupleId: string) => `nhip-doi:shared-tasks:${coupleId}`;
const localCheckinsKey = (uid: string) => `nhip-doi:private-checkins:${uid}`;

function readObject(key: string): Record<string, Record<string, unknown>> {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, Record<string, unknown>>; } catch { return {}; }
}

function writeObject(key: string, value: Record<string, unknown>): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is an optional offline convenience. */ }
}

function parseTasks(coupleId: string, value: unknown): SharedTask[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, Record<string, unknown>>).flatMap(([id, task]) => {
    if (typeof task.title !== "string" || typeof task.completed !== "boolean" || typeof task.createdAt !== "number" || typeof task.createdBy !== "string") return [];
    return [{ id, coupleId, title: task.title, completed: task.completed, createdAt: timestamp(task.createdAt), createdBy: task.createdBy, ...(typeof task.completedAt === "number" ? { completedAt: timestamp(task.completedAt) } : {}), ...(typeof task.completedBy === "string" ? { completedBy: task.completedBy } : {}) }];
  }).sort((a, b) => Number(a.completed) - Number(b.completed) || b.createdAt - a.createdAt);
}

function parseCheckins(value: unknown): PrivateCheckIn[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, Record<string, unknown>>).flatMap(([rawDate, item]) => {
    if (typeof item.coupleId !== "string" || typeof item.mood !== "string" || typeof item.createdAt !== "number" || !(["vui", "on", "met", "can-om"] as string[]).includes(item.mood)) return [];
    try { return [{ date: calendarDate(rawDate), coupleId: item.coupleId, mood: item.mood as Mood, createdAt: timestamp(item.createdAt) }]; } catch { return []; }
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export class DailyConnectionService {
  constructor(private readonly remoteEnabled: boolean) {}

  subscribeTasks(coupleId: string, callback: (tasks: SharedTask[]) => void): Unsubscribe {
    if (!this.remoteEnabled) { callback(parseTasks(coupleId, readObject(localTasksKey(coupleId)))); return () => undefined; }
    return onValue(ref(getFirebaseDatabase(), `couples/${coupleId}/sharedTasks`), (snapshot) => callback(parseTasks(coupleId, snapshot.val())));
  }

  subscribeCheckins(uid: string, callback: (checkins: PrivateCheckIn[]) => void): Unsubscribe {
    if (!this.remoteEnabled) { callback(parseCheckins(readObject(localCheckinsKey(uid)))); return () => undefined; }
    return onValue(ref(getFirebaseDatabase(), `privateCheckins/${uid}`), (snapshot) => callback(parseCheckins(snapshot.val())));
  }

  async saveCheckin(uid: string, coupleId: string, date: string, mood: Mood): Promise<void> {
    const checkedDate = calendarDate(date);
    if (!this.remoteEnabled) {
      const next = readObject(localCheckinsKey(uid));
      next[checkedDate] = { coupleId, mood, createdAt: Date.now() };
      writeObject(localCheckinsKey(uid), next);
      return;
    }
    await set(ref(getFirebaseDatabase(), `privateCheckins/${uid}/${checkedDate}`), { coupleId, mood, createdAt: serverTimestamp() });
  }

  async createTask(coupleId: string, uid: string, rawTitle: string): Promise<void> {
    const title = rawTitle.trim();
    if (title.length < 2 || title.length > 120) throw new Error("Tên việc cần có từ 2 đến 120 ký tự.");
    if (!this.remoteEnabled) {
      const next = readObject(localTasksKey(coupleId));
      next[crypto.randomUUID()] = { title, completed: false, createdAt: Date.now(), createdBy: uid };
      writeObject(localTasksKey(coupleId), next);
      return;
    }
    const target = push(ref(getFirebaseDatabase(), `couples/${coupleId}/sharedTasks`));
    await set(target, { title, completed: false, createdAt: serverTimestamp(), createdBy: uid });
  }

  async toggleTask(coupleId: string, task: SharedTask, uid: string): Promise<void> {
    const completed = !task.completed;
    if (!this.remoteEnabled) {
      const next = readObject(localTasksKey(coupleId));
      next[task.id] = { ...next[task.id], completed, ...(completed ? { completedAt: Date.now(), completedBy: uid } : {}) };
      writeObject(localTasksKey(coupleId), next);
      return;
    }
    await update(ref(getFirebaseDatabase(), `couples/${coupleId}/sharedTasks/${task.id}`), completed ? { completed: true, completedAt: serverTimestamp(), completedBy: uid } : { completed: false, completedAt: null, completedBy: null });
  }

  async listCheckins(uid: string): Promise<PrivateCheckIn[]> {
    if (!this.remoteEnabled) return parseCheckins(readObject(localCheckinsKey(uid)));
    return parseCheckins((await get(ref(getFirebaseDatabase(), `privateCheckins/${uid}`))).val());
  }
}
