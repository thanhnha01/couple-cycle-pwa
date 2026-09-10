import { calendarDate, type CalendarDate } from "../utils/date";

const TZ = 7;
const INT = Math.floor;
const jdFromDate = (day: number, month: number, year: number) => { const a = INT((14 - month) / 12); const y = year + 4800 - a; const m = month + 12 * a - 3; let jd = day + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045; if (jd < 2299161) jd = day + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083; return jd; };
const jdToDate = (jd: number) => { let b: number; let c: number; if (jd > 2299160) { const a = jd + 32044; b = INT((4 * a + 3) / 146097); c = a - INT(146097 * b / 4); } else { b = 0; c = jd + 32082; } const d = INT((4 * c + 3) / 1461); const e = c - INT(1461 * d / 4); const m = INT((5 * e + 2) / 153); return { day: e - INT((153 * m + 2) / 5) + 1, month: m + 3 - 12 * INT(m / 10), year: 100 * b + d - 4800 + INT(m / 10) }; };
const newMoon = (k: number) => { const t = k / 1236.85; const t2 = t * t; const t3 = t2 * t; const dr = Math.PI / 180; let jd = 2415020.75933 + 29.53058868 * k + .0001178 * t2 - .000000155 * t3; jd += .00033 * Math.sin((166.56 + 132.87 * t - .009173 * t2) * dr); const m = 359.2242 + 29.10535608 * k - .0000333 * t2 - .00000347 * t3; const mpr = 306.0253 + 385.81691806 * k + .0107306 * t2 + .00001236 * t3; const f = 21.2964 + 390.67050646 * k - .0016528 * t2 - .00000239 * t3; const correction = t < -11 ? .001 + .000839 * t + .0002261 * t2 - .00000845 * t3 - .000000081 * t * t3 : -.000278 + .000265 * t + .000262 * t2; return jd + correction - .0004 * Math.sin((166.56 + 132.87 * t - .009173 * t2) * dr) + .1734 * Math.sin(m * dr) + .0021 * Math.sin(2 * m * dr) - .4068 * Math.sin(mpr * dr) + .0161 * Math.sin(2 * mpr * dr) - .0004 * Math.sin(3 * mpr * dr) + .0104 * Math.sin(2 * f * dr) - .0051 * Math.sin((m + mpr) * dr) - .0074 * Math.sin((m - mpr) * dr) + .0004 * Math.sin((2 * f + m) * dr) - .0004 * Math.sin((2 * f - m) * dr) - .0006 * Math.sin((2 * f + mpr) * dr) + .001 * Math.sin((2 * f - mpr) * dr) + .0005 * Math.sin((2 * mpr + m) * dr); };
const newMoonDay = (k: number) => INT(newMoon(k) + .5 + TZ / 24);
const sunLongitude = (jdn: number) => { const t = (jdn - 2451545.5 - TZ / 24) / 36525; const t2 = t * t; const dr = Math.PI / 180; const m = 357.5291 + 35999.0503 * t - .0001559 * t2 - .00000048 * t * t2; const l0 = 280.46645 + 36000.76983 * t + .0003032 * t2; let dl = (1.9146 - .004817 * t - .000014 * t2) * Math.sin(dr * m) + (.019993 - .000101 * t) * Math.sin(2 * dr * m) + .00029 * Math.sin(3 * dr * m); let l = (l0 + dl) * dr; l -= Math.PI * 2 * INT(l / (Math.PI * 2)); return INT(l / Math.PI * 6); };
const lunarMonth11 = (year: number) => { const off = jdFromDate(31, 12, year) - 2415021; const k = INT(off / 29.530588853); let nm = newMoonDay(k); if (sunLongitude(nm) >= 9) nm = newMoonDay(k - 1); return nm; };
const leapMonthOffset = (a11: number) => { const k = INT(.5 + (a11 - 2415021.076998695) / 29.530588853); let last = 0; let i = 1; let arc = sunLongitude(newMoonDay(k + i)); do { last = arc; i += 1; arc = sunLongitude(newMoonDay(k + i)); } while (arc !== last && i < 15); return i - 1; };

/** Converts an official Vietnamese lunar-calendar date (UTC+7) to a solar date. */
export function lunarToSolar(day: number, month: number, year: number, leap = false): CalendarDate {
  let a11 = lunarMonth11(year - 1); let b11 = lunarMonth11(year); let off: number; let leapOff = 0; let leapMonth = 0;
  if (month < 11) { a11 = lunarMonth11(year - 1); b11 = lunarMonth11(year); } else { a11 = lunarMonth11(year); b11 = lunarMonth11(year + 1); }
  off = month - 11; if (off < 0) off += 12;
  if (b11 - a11 > 365) { leapOff = leapMonthOffset(a11); leapMonth = leapOff - 2; if (leapMonth < 0) leapMonth += 12; if (leap && month !== leapMonth) throw new RangeError("Tháng nhuận không hợp lệ."); if (leap || off >= leapOff) off += 1; }
  const k = INT(.5 + (a11 - 2415021.076998695) / 29.530588853); const monthStart = newMoonDay(k + off); const solar = jdToDate(monthStart + day - 1);
  return calendarDate(`${solar.year}-${String(solar.month).padStart(2, "0")}-${String(solar.day).padStart(2, "0")}`);
}
