import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

initializeApp();

interface EventRecord { title?: unknown; date?: unknown; reminderDays?: unknown; }
interface TokenRecord { token?: unknown; }

function vietnamDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);
  return Math.round((Date.UTC(toYear ?? 0, (toMonth ?? 1) - 1, toDay ?? 0) - Date.UTC(fromYear ?? 0, (fromMonth ?? 1) - 1, fromDay ?? 0)) / 86_400_000);
}

export const sendEventReminders = onSchedule({ schedule: "every 15 minutes", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1" }, async () => {
  const database = getDatabase();
  const today = vietnamDate();
  const snapshot = await database.ref("couples").once("value");
  const jobs: Promise<unknown>[] = [];

  snapshot.forEach((couple) => {
    const value = couple.val() as { events?: Record<string, EventRecord>; notificationTokens?: Record<string, Record<string, TokenRecord>> };
    const tokens = Object.values(value.notificationTokens ?? {}).flatMap((ownerTokens) => Object.values(ownerTokens).flatMap((record) => typeof record.token === "string" ? [record.token] : []));
    if (!tokens.length) return;
    Object.values(value.events ?? {}).forEach((event) => {
      if (typeof event.title !== "string" || typeof event.date !== "string" || !Array.isArray(event.reminderDays)) return;
      const days = daysBetween(today, event.date);
      if (!event.reminderDays.includes(days) || days < 0) return;
      const suffix = days === 0 ? "là hôm nay." : `còn ${days} ngày nữa.`;
      jobs.push(getMessaging().sendEachForMulticast({
        tokens,
        notification: { title: "Nhịp Đôi nhắc bạn", body: `${event.title} ${suffix}` },
        webpush: { notification: { icon: "/icons/icon-192.svg", tag: `event-${couple.key}-${event.date}-${event.title}` } },
      }).then((result) => logger.info("Đã gửi nhắc sự kiện", { coupleId: couple.key, success: result.successCount, failure: result.failureCount })));
    });
  });
  await Promise.all(jobs);
});
