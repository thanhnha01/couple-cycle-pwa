import { getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";
import { systemHolidays } from "./holidays.js";

if (!getApps().length) {
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!databaseURL) throw new Error("FIREBASE_DATABASE_URL is required for the reminder runner.");
  initializeApp({ databaseURL });
}

interface EventRecord { title?: unknown; date?: unknown; reminderDays?: unknown; }
interface TokenRecord { token?: unknown; }
interface CoupleValue { events?: Record<string, EventRecord>; notificationTokens?: Record<string, Record<string, TokenRecord>>; profile?: { name?: unknown; startDate?: unknown } }

function vietnamDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round((Date.UTC(toYear ?? 0, (toMonth ?? 1) - 1, toDay ?? 0) - Date.UTC(fromYear ?? 0, (fromMonth ?? 1) - 1, fromDay ?? 0)) / 86_400_000);
}

function loveDayCount(start: string, current: string): number {
  return Math.max(1, daysBetween(start, current) + 1);
}

function nextMilestone(day: number): number {
  const presets = [30, 50, 100, 200, 365, 500, 1000];
  const preset = presets.find((value) => value > day);
  return preset ?? (Math.floor(day / 365) + 1) * 365;
}

const dailyMessages = [
  "Hôm nay hãy kể cho nhau nghe một điều khiến bạn mỉm cười.",
  "Gửi người ấy một lời cảm ơn thật cụ thể.",
  "Cùng chọn một bài hát cho buổi tối hôm nay.",
  "Hỏi nhau: điều gì sẽ làm ngày hôm nay nhẹ hơn một chút?",
  "Dành 10 phút không điện thoại để nghe nhau kể chuyện.",
];

function stableMessage(coupleId: string, date: string): string {
  let hash = 0;
  for (const char of `${coupleId}:${date}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [year, month, day] = date.split("-").map(Number);
  const dayIndex = Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
  return dailyMessages[(dayIndex + hash) % dailyMessages.length] ?? dailyMessages[0]!;
}

async function sendOnce(database: ReturnType<typeof getDatabase>, coupleId: string, kind: string, date: string, tokens: string[], title: string, body: string): Promise<number> {
  const delivery = database.ref(`reminderDeliveries/${coupleId}/${kind}/${date}`);
  const reservation = await delivery.transaction((current: unknown) => current ?? { reservedAt: Date.now() });
  if (!reservation.committed) return 0;
  const response = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, webpush: { notification: { icon: "/icons/icon-192.svg", tag: `nhip-doi-${kind}-${date}` } } });
  await delivery.update({ sentAt: Date.now(), successCount: response.successCount, failureCount: response.failureCount });
  return response.successCount;
}

/**
 * Executed by the scheduled GitHub Action. A Realtime Database transaction
 * reserves each reminder once per Vietnamese calendar day, preventing every
 * 15-minute workflow run from sending duplicates.
 */
export async function sendDueEventReminders(): Promise<{ sent: number; skipped: number }> {
  const database = getDatabase();
  const dateToday = vietnamDate();
  const couples = await database.ref("couples").once("value");
  let sent = 0;
  let skipped = 0;

  const work: Promise<void>[] = [];
  couples.forEach((couple) => {
    const value = couple.val() as CoupleValue;
    const tokens = Object.values(value.notificationTokens ?? {}).flatMap((userTokens) => Object.values(userTokens).flatMap((record) => typeof record.token === "string" ? [record.token] : []));
    if (!tokens.length) return;
    Object.entries(value.events ?? {}).forEach(([eventId, event]) => {
      if (typeof event.title !== "string" || typeof event.date !== "string" || !Array.isArray(event.reminderDays)) return;
      const remainingDays = daysBetween(dateToday, event.date);
      if (remainingDays < 0 || !event.reminderDays.includes(remainingDays)) return;
      work.push((async () => {
        const delivery = database.ref(`reminderDeliveries/${couple.key}/${eventId}/${dateToday}/${remainingDays}`);
        const reservation = await delivery.transaction((current: unknown) => current ?? { reservedAt: Date.now() });
        if (!reservation.committed) { skipped += 1; return; }
        const suffix = remainingDays === 0 ? "là hôm nay." : `còn ${remainingDays} ngày nữa.`;
        const response = await getMessaging().sendEachForMulticast({
          tokens,
          notification: { title: "Nhịp Đôi nhắc bạn", body: `${event.title} ${suffix}` },
          webpush: { notification: { icon: "/icons/icon-192.svg", tag: `event-${couple.key}-${eventId}-${dateToday}` } },
        });
        await delivery.update({ sentAt: Date.now(), successCount: response.successCount, failureCount: response.failureCount });
        sent += response.successCount;
      })());
    });
  });
  await Promise.all(work);
  return { sent, skipped };
}

export async function sendDailyAndMilestoneReminders(): Promise<{ sent: number }> {
  const database = getDatabase();
  const dateToday = vietnamDate();
  const couples = await database.ref("couples").once("value");
  let sent = 0;
  const work: Promise<void>[] = [];
  couples.forEach((couple) => {
    const value = couple.val() as CoupleValue;
    const tokens = Object.values(value.notificationTokens ?? {}).flatMap((records) => Object.values(records).flatMap((record) => typeof record.token === "string" ? [record.token] : []));
    if (!tokens.length || typeof value.profile?.startDate !== "string") return;
    const day = loveDayCount(value.profile.startDate, dateToday);
    const milestone = nextMilestone(day);
    if (milestone - day === 1 || milestone === day) work.push(sendOnce(database, couple.key!, `milestone-${milestone}-${milestone - day}`, dateToday, tokens, "Nhịp Đôi · cột mốc sắp tới", milestone - day === 0 ? `Hôm nay là ngày yêu thứ ${day}.` : `Ngày mai hai bạn sẽ chạm mốc ${milestone} ngày.`).then((count) => { sent += count; }));
    work.push(sendOnce(database, couple.key!, "daily-message", dateToday, tokens, "Thông điệp dành cho hai người", stableMessage(couple.key!, dateToday)).then((count) => { sent += count; }));
  });
  await Promise.all(work);
  return { sent };
}

export async function sendSystemHolidayReminders(): Promise<{ sent: number }> {
  const database = getDatabase(); const today = vietnamDate(); const year = Number(today.slice(0, 4)); const couples = await database.ref("couples").once("value"); let sent = 0; const work: Promise<void>[] = [];
  couples.forEach((couple) => { const value = couple.val() as CoupleValue; const tokens = Object.values(value.notificationTokens ?? {}).flatMap((records) => Object.values(records).flatMap((record) => typeof record.token === "string" ? [record.token] : [])); if (!tokens.length || !couple.key) return; for (const holiday of [...systemHolidays(year), ...systemHolidays(year + 1)]) { const left = daysBetween(today, holiday.date); if (left !== 0 && left !== 1) continue; work.push(sendOnce(database, couple.key, `holiday-${holiday.id}-${left}`, today, tokens, "Nhịp Đôi · ngày lễ", left === 0 ? `Hôm nay là ${holiday.title}.` : `Ngày mai là ${holiday.title}.`).then((count) => { sent += count; })); } });
  await Promise.all(work); return { sent };
}
