import type { CoupleEvent } from "../events/types";

function localDate(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function daysUntil(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const now = new Date();
  const current = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const target = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0);
  return Math.round((target - current) / 86_400_000);
}

/** Sends a privacy-safe local notification while the web app is open. */
export function notifyDueEvents(events: readonly CoupleEvent[]): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  for (const event of events) {
    const remaining = daysUntil(event.date);
    if (remaining < 0 || !event.reminderDays.includes(remaining)) continue;
    const key = `nhip-doi:notified:${event.id}:${localDate()}`;
    try {
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, "1");
    } catch { /* A notification may repeat when browser storage is unavailable. */ }
    const suffix = remaining === 0 ? "là hôm nay" : `còn ${remaining} ngày nữa`;
    new Notification("Nhịp Đôi nhắc bạn", { body: `${event.title} ${suffix}.`, icon: "./icons/icon-192.svg", tag: `nhip-doi:${event.id}` });
  }
}
