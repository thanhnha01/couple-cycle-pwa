import { getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

if (!getApps().length) {
  const databaseURL = process.env.FIREBASE_DATABASE_URL;
  if (!databaseURL) throw new Error("FIREBASE_DATABASE_URL is required for the reminder runner.");
  initializeApp({ databaseURL });
}

interface EventRecord { title?: unknown; date?: unknown; reminderDays?: unknown; }
interface TokenRecord { token?: unknown; }

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
    const value = couple.val() as { events?: Record<string, EventRecord>; notificationTokens?: Record<string, Record<string, TokenRecord>> };
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
