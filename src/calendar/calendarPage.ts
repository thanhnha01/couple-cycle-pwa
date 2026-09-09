import { predictCycle, type Period } from "../cycle";
import { addCalendarDays } from "../cycle/calendar-math";
import { calendarDate, formatCalendarDate, type CalendarDate } from "../utils/date";
import { PeriodValidationError } from "../periods/service";
import { findPeriodContaining, validatePeriodInput } from "../periods/validation";
import { mondayWeekdayIndex, monthCalendarGrid, shiftCalendarMonth } from "./calendar-grid";

export interface CalendarPageContext {
  periods: readonly Period[];
  loading: boolean;
  error: boolean;
  coupleId: string;
  uid: string;
  service: {
    create(coupleId: string, uid: string, input: { startDate: CalendarDate; endDate: CalendarDate }, periods: readonly Period[]): Promise<unknown>;
    update(period: Period, uid: string, input: { startDate: CalendarDate; endDate: CalendarDate }, periods: readonly Period[]): Promise<unknown>;
    remove(period: Period): Promise<void>;
    restoreDeleted(period: Period): Promise<void>;
  };
  refresh: () => Promise<void>;
  rerender: () => void;
}

interface CalendarState {
  selected: CalendarDate | null;
  month: string;
  editingId: string | null;
  undo: Period | null;
  undoTimer: number | undefined;
  focusAfterRender: boolean;
  focusDate: CalendarDate | null;
}

const today = (): CalendarDate => {
  const value = new Date();
  return calendarDate(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`);
};

const initialToday = today();
const state: CalendarState = { selected: null, month: initialToday.slice(0, 7), editingId: null, undo: null, undoTimer: undefined, focusAfterRender: false, focusDate: null };
const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function monthParts(value: string): { year: number; month: number } {
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}

function shiftMonth(value: string, direction: number): string {
  const { year, month } = monthParts(value);
  const next = shiftCalendarMonth(year, month, direction);
  return `${next.year}-${String(next.month).padStart(2, "0")}`;
}

function shiftDateByMonth(date: CalendarDate, direction: number): CalendarDate {
  const current = monthParts(date.slice(0, 7));
  const destination = shiftCalendarMonth(current.year, current.month, direction);
  const destinationDays = monthCalendarGrid(destination.year, destination.month).filter((day) => day.inMonth);
  return destinationDays.find((day) => day.date.slice(8) === date.slice(8))?.date ?? destinationDays.at(-1)!.date;
}

function periodDuration(period: Period): number {
  if (period.endDate === undefined) return 1;
  let cursor = period.startDate;
  let duration = 1;
  while (cursor < period.endDate) {
    cursor = addCalendarDays(cursor, 1);
    duration += 1;
  }
  return duration;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function renderCalendarPage(context: CalendarPageContext): string {
  const currentToday = today();
  const { year, month } = monthParts(state.month);
  const prediction = predictCycle({ periods: context.periods, asOfDate: currentToday });
  const calendarDays = monthCalendarGrid(year, month);
  const actualByDate = new Map(calendarDays.map((day) => [day.date, findPeriodContaining(context.periods, day.date)]));
  const days = calendarDays.map((day) => {
    const actual = actualByDate.get(day.date);
    const predicted = prediction.predictionWindow !== null && day.date >= prediction.predictionWindow.start && day.date <= prediction.predictionWindow.end;
    const expected = prediction.expectedDate === day.date;
    const selected = state.selected === day.date;
    const labels = [formatCalendarDate(day.date), actual ? "kỳ kinh đã ghi" : "", predicted ? "khoảng dự đoán" : "", expected ? "ngày dự kiến" : "", day.date === currentToday ? "hôm nay" : "", selected ? "đã chọn" : ""];
    return `<div class="calendar-cell" role="gridcell" aria-selected="${selected}"><button class="calendar-day ${day.inMonth ? "" : "outside-month"} ${actual ? "actual-period" : ""} ${predicted ? "predicted-period" : ""} ${expected ? "expected-period" : ""} ${day.date === currentToday ? "today" : ""} ${selected ? "selected" : ""}" type="button" data-calendar-date="${day.date}" aria-label="${labels.filter(Boolean).join(", ")}"${day.date === currentToday ? " aria-current=\"date\"" : ""} aria-describedby="calendar-legend"><span>${Number(day.date.slice(8, 10))}</span></button></div>`;
  });
  const calendarRows = Array.from({ length: 6 }, (_, row) => `<div class="calendar-week" role="row">${days.slice(row * 7, row * 7 + 7).join("")}</div>`).join("");
  const selectedPeriod = state.selected === null ? undefined : findPeriodContaining(context.periods, state.selected);
  const editing = state.editingId === null ? selectedPeriod : context.periods.find((period) => period.id === state.editingId);
  const draftDate = state.selected ?? currentToday;
  const todayPeriod = findPeriodContaining(context.periods, currentToday);
  const summary = todayPeriod
    ? `Đang ghi nhận kỳ kinh · ngày ${periodDuration({ ...todayPeriod, startDate: todayPeriod.startDate, endDate: currentToday })} trong lần ghi nhận hiện tại.`
    : prediction.expectedDate === null
      ? "Chưa đủ lịch sử để dự đoán kỳ tiếp theo."
      : prediction.expectedDate < currentToday
        ? `Kỳ dự đoán gần nhất là ${formatCalendarDate(prediction.expectedDate)}. Hãy ghi lại kỳ mới khi bắt đầu.`
        : `Dự kiến kỳ tiếp theo: ${formatCalendarDate(prediction.expectedDate)}${prediction.predictionWindow ? ` · ${formatCalendarDate(prediction.predictionWindow.start)}–${formatCalendarDate(prediction.predictionWindow.end)}` : ""}`;
  const history = [...context.periods].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((period) => `<li><button type="button" data-period-edit="${period.id}"><strong>${formatCalendarDate(period.startDate)} – ${period.endDate === undefined ? "Chưa ghi" : formatCalendarDate(period.endDate)}</strong><span>${periodDuration(period)} ngày</span></button></li>`).join("");
  const sheet = editing || state.selected !== null
    ? `<section class="period-sheet" aria-labelledby="period-sheet-title"><div class="sheet-handle" aria-hidden="true"></div><h2 id="period-sheet-title">${editing ? "Chỉnh sửa kỳ kinh" : "Ghi kỳ kinh"}</h2><form id="period-form" novalidate><label>Ngày bắt đầu<input name="startDate" type="date" required value="${editing?.startDate ?? draftDate}"></label><label>Ngày kết thúc<input name="endDate" type="date" required value="${editing?.endDate ?? draftDate}"></label><p id="period-form-status" class="form-status" role="alert" aria-live="assertive"></p><button class="primary-button" type="submit">${editing ? "Lưu thay đổi" : "Lưu kỳ kinh"}</button>${editing ? `<button id="period-delete" class="danger-button" type="button">Xóa kỳ kinh</button>` : ""}<button id="period-close" class="text-button" type="button">Đóng</button></form></section>`
    : "";
  return `<section class="calendar-page"><header class="calendar-header"><div><p class="eyebrow">Chu kỳ</p><h1>Lịch chu kỳ</h1></div><button id="calendar-today" class="secondary-button" type="button">Hôm nay</button></header><section class="calendar-surface" aria-label="Lịch tháng"><div class="calendar-month-controls"><button type="button" data-month-shift="-1" aria-label="Tháng trước">‹</button><h2 id="calendar-month-label">Tháng ${month}, ${year}</h2><button type="button" data-month-shift="1" aria-label="Tháng sau">›</button></div><div class="calendar-weekdays" role="row">${weekdays.map((day) => `<span role="columnheader">${day}</span>`).join("")}</div><div class="calendar-grid" role="grid" aria-labelledby="calendar-month-label">${calendarRows}</div><p id="calendar-legend" class="calendar-legend"><span class="legend-actual">Đã ghi</span><span class="legend-predicted">Dự đoán (viền)</span><span class="legend-expected">Ngày dự kiến (chấm)</span><span class="legend-today">Hôm nay (viền xanh)</span></p></section><section class="today-summary" aria-labelledby="today-summary-title"><h2 id="today-summary-title">Hôm nay</h2><p>${escapeHtml(summary)}</p>${prediction.warnings[0] ? `<small>${escapeHtml(prediction.warnings[0].code)}</small>` : ""}</section><section class="period-history" aria-labelledby="period-history-title"><div><h2 id="period-history-title">Lịch sử kỳ kinh</h2><button id="period-add" class="text-button" type="button">Thêm</button></div>${context.loading ? "<p>Đang tải lịch sử…</p>" : context.error ? "<p>Không thể tải lịch sử. <button id=\"period-retry\" class=\"text-button\" type=\"button\">Thử lại</button></p>" : history ? `<ul>${history}</ul>` : "<p>Chưa có kỳ kinh nào được ghi.</p>"}</section>${sheet}${state.undo ? `<div class="undo-bar" role="status">Đã xóa kỳ kinh.<button id="period-undo" type="button">Hoàn tác</button></div>` : ""}</section>`;
}

export function bindCalendarPage(root: HTMLElement, context: CalendarPageContext): void {
  root.querySelectorAll<HTMLButtonElement>("[data-month-shift]").forEach((button) => button.addEventListener("click", () => { state.month = shiftMonth(state.month, Number(button.dataset.monthShift)); context.rerender(); }));
  root.querySelector<HTMLButtonElement>("#calendar-today")?.addEventListener("click", () => { state.selected = today(); state.month = state.selected.slice(0, 7); context.rerender(); });
  root.querySelectorAll<HTMLButtonElement>("[data-calendar-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selected = calendarDate(button.dataset.calendarDate ?? today());
      // This canonical containment lookup makes every interior day reopen its existing record.
      state.editingId = findPeriodContaining(context.periods, state.selected)?.id ?? null;
      context.rerender();
    });
    button.addEventListener("keydown", (event) => {
      const date = calendarDate(button.dataset.calendarDate ?? today());
      let target: CalendarDate | null = null;
      if (event.key === "ArrowLeft") target = addCalendarDays(date, -1);
      if (event.key === "ArrowRight") target = addCalendarDays(date, 1);
      if (event.key === "ArrowUp") target = addCalendarDays(date, -7);
      if (event.key === "ArrowDown") target = addCalendarDays(date, 7);
      if (event.key === "Home") target = addCalendarDays(date, -mondayWeekdayIndex(date));
      if (event.key === "End") target = addCalendarDays(date, 6 - mondayWeekdayIndex(date));
      if (event.key === "PageUp") target = shiftDateByMonth(date, -1);
      if (event.key === "PageDown") target = shiftDateByMonth(date, 1);
      if (target === null) return;
      event.preventDefault();
      state.month = target.slice(0, 7);
      state.focusDate = target;
      state.focusAfterRender = true;
      context.rerender();
    });
  });
  root.querySelector<HTMLButtonElement>("#period-add")?.addEventListener("click", () => { state.selected = state.selected ?? today(); state.editingId = null; context.rerender(); });
  root.querySelectorAll<HTMLButtonElement>("[data-period-edit]").forEach((button) => button.addEventListener("click", () => { state.editingId = button.dataset.periodEdit ?? null; state.selected = context.periods.find((period) => period.id === state.editingId)?.startDate ?? state.selected; context.rerender(); }));
  root.querySelector<HTMLButtonElement>("#period-close")?.addEventListener("click", () => { state.selected = null; state.editingId = null; context.rerender(); });
  root.querySelector<HTMLButtonElement>("#period-retry")?.addEventListener("click", () => { void context.refresh().then(context.rerender); });
  root.querySelector<HTMLFormElement>("#period-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    let input: { startDate: CalendarDate; endDate: CalendarDate };
    const status = root.querySelector<HTMLElement>("#period-form-status");
    try {
      input = { startDate: calendarDate(String(values.get("startDate"))), endDate: calendarDate(String(values.get("endDate"))) };
    } catch {
      if (status) status.textContent = "Vui lòng chọn ngày bắt đầu và ngày kết thúc hợp lệ.";
      return;
    }
    const editing = state.editingId === null ? undefined : context.periods.find((period) => period.id === state.editingId);
    const issues = validatePeriodInput(input, context.periods, editing?.id);
    if (issues.some((issue) => issue.severity === "error")) { if (status) status.textContent = "Khoảng ngày này trùng hoặc không hợp lệ."; return; }
    if (issues.some((issue) => issue.code === "LONG_DURATION") && form.dataset.longConfirmed !== "true") { form.dataset.longConfirmed = "true"; if (status) status.textContent = "Thời gian ghi nhận dài. Nhấn Lưu lần nữa để xác nhận."; return; }
    void (editing ? context.service.update(editing, context.uid, input, context.periods) : context.service.create(context.coupleId, context.uid, input, context.periods)).then(() => context.refresh()).then(() => { state.selected = null; state.editingId = null; context.rerender(); }).catch((error: unknown) => { if (status) status.textContent = error instanceof PeriodValidationError ? "Không thể lưu kỳ kinh này." : "Không thể lưu. Vui lòng thử lại."; });
  });
  root.querySelector<HTMLButtonElement>("#period-delete")?.addEventListener("click", () => {
    const period = context.periods.find((item) => item.id === state.editingId);
    if (!period || !window.confirm("Xóa kỳ kinh này?")) return;
    void context.service.remove(period).then(() => context.refresh()).then(() => { state.undo = period; state.selected = null; state.editingId = null; if (state.undoTimer !== undefined) window.clearTimeout(state.undoTimer); state.undoTimer = window.setTimeout(() => { state.undo = null; context.rerender(); }, 8000); context.rerender(); }).catch(() => { window.alert("Không thể xóa kỳ kinh. Vui lòng thử lại."); });
  });
  root.querySelector<HTMLButtonElement>("#period-undo")?.addEventListener("click", () => { const undo = state.undo; if (!undo) return; void context.service.restoreDeleted(undo).then(() => context.refresh()).then(() => { state.undo = null; context.rerender(); }).catch(() => { window.alert("Không thể hoàn tác. Vui lòng thử lại."); }); });
  if (state.focusAfterRender) {
    state.focusAfterRender = false;
    root.querySelector<HTMLButtonElement>(`[data-calendar-date="${state.focusDate}"]`)?.focus();
    state.focusDate = null;
  }
}
