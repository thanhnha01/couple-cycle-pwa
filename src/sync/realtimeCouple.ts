import { onDisconnect, onValue, ref, serverTimestamp, set, type Unsubscribe } from "firebase/database";
import type { Period } from "../cycle/types";
import { getFirebaseDatabase } from "../firebase/database";
import { calendarDate, timestamp } from "../utils/date";
import type { CoupleProfile, Presence } from "../couple/types";

export interface RealtimeCoupleCallbacks {
  profile: (profile: CoupleProfile | undefined) => void;
  periods: (periods: Period[]) => void;
  presence: (people: Presence[]) => void;
}

/** Separate narrow listeners; never subscribes to the complete couple object. */
export function subscribeRealtimeCouple(coupleId: string, uid: string, callbacks: RealtimeCoupleCallbacks): Unsubscribe {
  const database = getFirebaseDatabase();
  const unsubscribers: Unsubscribe[] = [];
  unsubscribers.push(onValue(ref(database, `couples/${coupleId}/profile`), (snapshot) => callbacks.profile(parseProfile(snapshot.val()))));
  unsubscribers.push(onValue(ref(database, `couples/${coupleId}/periods`), (snapshot) => callbacks.periods(parsePeriods(coupleId, snapshot.val()))));
  unsubscribers.push(onValue(ref(database, `couples/${coupleId}/presence`), (snapshot) => callbacks.presence(parsePresence(coupleId, snapshot.val()))));

  const presenceRef = ref(database, `couples/${coupleId}/presence/${uid}`);
  unsubscribers.push(onValue(ref(database, ".info/connected"), (snapshot) => {
    if (snapshot.val() !== true) return;
    void onDisconnect(presenceRef).set({ state: "offline", lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() });
    void set(presenceRef, { state: "online", lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }));
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    void set(presenceRef, { state: "offline", lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp() });
  };
}

function parseProfile(value: unknown): CoupleProfile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.createdAt !== "number" || typeof record.ownerUid !== "string" || (record.memberCount !== 1 && record.memberCount !== 2)) return undefined;
  return { name: record.name, createdAt: timestamp(record.createdAt), ownerUid: record.ownerUid, memberCount: record.memberCount };
}

function parsePeriods(coupleId: string, value: unknown): Period[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, Record<string, unknown>>).flatMap(([id, period]) => {
    if (typeof period.startDate !== "string" || typeof period.endDate !== "string" || typeof period.createdAt !== "number" || typeof period.updatedAt !== "number" || typeof period.createdBy !== "string" || typeof period.updatedBy !== "string" || typeof period.revision !== "number") return [];
    return [{ id, coupleId, startDate: calendarDate(period.startDate), endDate: calendarDate(period.endDate), createdAt: timestamp(period.createdAt), createdBy: period.createdBy, updatedAt: timestamp(period.updatedAt), updatedBy: period.updatedBy, revision: period.revision }];
  }).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id.localeCompare(a.id));
}

function parsePresence(coupleId: string, value: unknown): Presence[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, Record<string, unknown>>).flatMap(([userId, presence]) => {
    if ((presence.state !== "online" && presence.state !== "away" && presence.state !== "offline") || typeof presence.lastSeenAt !== "number" || typeof presence.updatedAt !== "number") return [];
    return [{ id: `${coupleId}:${userId}`, coupleId, userId, state: presence.state, lastSeenAt: timestamp(presence.lastSeenAt), updatedAt: timestamp(presence.updatedAt) }];
  });
}
