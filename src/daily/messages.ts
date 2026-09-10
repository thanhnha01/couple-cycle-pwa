import type { CalendarDate } from "../utils/date";

const messages = [
  "Hôm nay hãy kể cho nhau nghe một điều khiến bạn mỉm cười.",
  "Gửi người ấy một lời cảm ơn thật cụ thể.",
  "Cùng chọn một bài hát cho buổi tối hôm nay.",
  "Hỏi nhau: điều gì sẽ làm ngày hôm nay nhẹ hơn một chút?",
  "Dành 10 phút không điện thoại để nghe nhau kể chuyện.",
  "Nhắc người ấy về một kỷ niệm nhỏ mà bạn vẫn nhớ.",
  "Cùng lên một ý tưởng cho buổi hẹn tiếp theo.",
];

export function dailyCoupleMessage(coupleId: string, date: CalendarDate, dayCount?: number): string {
  let hash = 0;
  for (const char of `${coupleId}:${date}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [year, month, day] = date.split("-").map(Number);
  const dayIndex = Math.floor(Date.UTC(year!, month! - 1, day!) / 86_400_000);
  const prefix = dayCount ? `Ngày thứ ${dayCount} — ` : "";
  return `${prefix}${messages[(dayIndex + hash) % messages.length]}`;
}
