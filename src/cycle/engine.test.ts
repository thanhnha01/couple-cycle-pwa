import { describe, expect, it } from "vitest";
import { calendarDate, type CalendarDate } from "../utils/date";
import { addCalendarDays, calendarDaysBetween } from "./calendar-math";
import { CYCLE_MODEL_V2_CONFIG } from "./config";
import { createStudentTDistribution, studentTCdf } from "./distribution";
import { backtestCycleHistory, predictCycle } from "./engine";
import type { CycleEngineInput, Period } from "./types";

function period(id: string, start: string, end?: string): Pick<Period, "id" | "startDate" | "endDate"> {
  return {
    id,
    startDate: calendarDate(start),
    ...(end === undefined ? {} : { endDate: calendarDate(end) }),
  };
}

function periodsFromIntervals(intervals: number[], start = calendarDate("2026-01-01")): Pick<Period, "id" | "startDate" | "endDate">[] {
  const result = [period("p0", start)];
  let cursor = start;
  intervals.forEach((interval, index) => {
    cursor = addCalendarDays(cursor, interval);
    result.push(period(`p${index + 1}`, cursor));
  });
  return result;
}

function input(intervals: number[], asOfDate?: CalendarDate, includeDistribution = false): CycleEngineInput {
  const periods = periodsFromIntervals(intervals);
  return { periods, asOfDate: asOfDate ?? periods.at(-1)?.startDate ?? calendarDate("2026-01-01"), includeDistribution };
}

describe("Cycle Engine v2", () => {
  it("returns insufficient confidence for zero periods", () => {
    const result = predictCycle({ periods: [], asOfDate: calendarDate("2026-01-01") });
    expect(result.expectedDate).toBeNull();
    expect(result.confidence.level).toBe("insufficient");
  });

  it("returns a preliminary, non-28-day prediction for one interval", () => {
    const result = predictCycle(input([31]));
    expect(result.cycleLength.median).toBe(31);
    expect(result.cycleLength.expected).toBeGreaterThan(30);
    expect(result.cycleLength.expected).not.toBe(28);
    expect(result.confidence.level).toBe("low");
    expect(result.warnings.some((item) => item.code === "PRELIMINARY_PREDICTION")).toBe(true);
  });

  it.each([2, 3, 6, 12])("supports %i intervals deterministically", (count) => {
    const result = predictCycle(input(Array.from({ length: count }, () => 29)));
    expect(result.dataQuality.samples).toBe(count);
    expect(result.expectedDate).not.toBeNull();
    expect(result.cycleLength.median).toBe(29);
  });

  it("keeps regular history tighter than irregular history", () => {
    const regular = predictCycle(input([29, 29, 29, 29, 29, 29]));
    const irregular = predictCycle(input([22, 35, 25, 38, 24, 36]));
    expect(irregular.uncertainty.standardDeviationDays ?? 0).toBeGreaterThan(regular.uncertainty.standardDeviationDays ?? Infinity);
  });

  it("follows a gradual recent trend without using the full-history average alone", () => {
    const result = predictCycle(input([29, 29, 30, 30, 31, 31, 32]));
    expect(result.cycleLength.expected ?? 0).toBeGreaterThan(30);
  });

  it("widens uncertainty for a sudden change", () => {
    const stable = predictCycle(input([29, 29, 29, 29, 29, 29]));
    const changed = predictCycle(input([29, 29, 29, 29, 29, 45]));
    expect(changed.uncertainty.standardDeviationDays ?? 0).toBeGreaterThan(stable.uncertainty.standardDeviationDays ?? Infinity);
  });

  it("flags isolated and multiple outliers without deleting their diagnostics", () => {
    const isolated = predictCycle(input([29, 29, 60, 29, 29]));
    const multiple = predictCycle(input([29, 60, 29, 62, 29]));
    expect(isolated.dataQuality.outlierIntervals).toBeGreaterThan(0);
    expect(multiple.dataQuality.outlierIntervals).toBeGreaterThanOrEqual(isolated.dataQuality.outlierIntervals);
    expect(isolated.cycleLength.median).toBe(29);
  });

  it("flags suspected missing cycles without synthesizing shorter intervals", () => {
    const result = predictCycle(input([29, 29, 58, 29, 29]));
    expect(result.dataQuality.missingSuspected).toBe(true);
    expect(result.dataQuality.missingCandidates[0]?.intervalDays).toBe(58);
    expect(result.warnings.some((item) => item.code === "MISSING_PERIOD_SUSPECTED")).toBe(true);
  });

  it("detects duplicate starts and overlapping ranges", () => {
    const duplicate = predictCycle({
      periods: [period("a", "2026-01-01"), period("b", "2026-01-01"), period("c", "2026-01-30")],
      asOfDate: calendarDate("2026-01-30"),
    });
    const overlap = predictCycle({
      periods: [period("a", "2026-01-01", "2026-02-05"), period("b", "2026-01-29"), period("c", "2026-02-27")],
      asOfDate: calendarDate("2026-02-27"),
    });
    expect(duplicate.dataQuality.duplicateGroups).toBe(1);
    expect(overlap.dataQuality.overlapGroups).toBeGreaterThan(0);
    expect(overlap.warnings.some((item) => item.code === "OVERLAPPING_PERIODS")).toBe(true);
  });

  it("reports runtime-invalid dates and invalid ranges", () => {
    const invalid = [
      { id: "bad", startDate: "2026-02-30" },
      { id: "reversed", startDate: "2026-03-01", endDate: "2026-02-28" },
    ] as unknown as CycleEngineInput["periods"];
    const result = predictCycle({ periods: invalid, asOfDate: calendarDate("2026-03-01") });
    expect(result.dataQuality.invalidRecords).toBeGreaterThan(0);
    expect(result.warnings.some((item) => item.code === "INVALID_START_DATE")).toBe(true);
    expect(result.warnings.some((item) => item.code === "INVALID_PERIOD_RANGE")).toBe(true);
  });

  it("enforces asOfDate as a hard boundary", () => {
    const base = input([29, 29, 29]);
    const future = [...base.periods, period("future", "2026-12-31")];
    const withFuture = predictCycle({ ...base, periods: future });
    expect(withFuture).toEqual(predictCycle(base));
  });

  it("emits a passed-prediction warning without shifting the result", () => {
    const result = predictCycle(input([29, 29], calendarDate("2026-06-01")));
    expect(result.warnings.some((item) => item.code === "PREDICTION_PASSED_WITHOUT_RECORD")).toBe(true);
  });

  it("uses timezone-independent civil arithmetic across leap years and year boundaries", () => {
    expect(addCalendarDays(calendarDate("2024-02-28"), 1)).toBe("2024-02-29");
    expect(addCalendarDays(calendarDate("2026-12-31"), 1)).toBe("2027-01-01");
    expect(calendarDaysBetween(calendarDate("2024-02-28"), calendarDate("2024-03-01"))).toBe(2);
  });
});

describe("Student-t predictive distribution", () => {
  it("is finite, non-negative, normalized, and symmetric at zero", () => {
    const distribution = createStudentTDistribution(29, 16, 6);
    const sum = distribution.probabilities.reduce((total, value) => total + value, 0);
    expect(distribution.probabilities.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(sum).toBeCloseTo(1, 12);
    expect(studentTCdf(0, 6)).toBe(0.5);
    expect(studentTCdf(-1.5, 6) + studentTCdf(1.5, 6)).toBeCloseTo(1, 12);
  });

  it("returns an ordered central 80% window with sufficient mass", () => {
    const result = predictCycle(input([29, 29, 30, 29, 30, 29], undefined, true));
    const window = result.predictionWindow;
    const distribution = result.distribution;
    expect(window).not.toBeNull();
    expect(distribution).toBeDefined();
    if (window === null || distribution === undefined) throw new Error("Expected distribution and prediction window.");
    expect(window.start <= window.end).toBe(true);
    const mass = distribution
      .filter((item) => item.date >= window.start && item.date <= window.end)
      .reduce((total, item) => total + item.probability, 0);
    expect(mass).toBeGreaterThanOrEqual(0.8 - 1e-12);
  });
});

describe("Cycle Engine v2 backtesting and calibration", () => {
  it("reports rolling-origin metrics from evaluated historical predictions", () => {
    const history = backtestCycleHistory(input([29, 31, 28, 33, 30, 27, 32]));
    const entries = history.predictions;
    const errors = entries.map((entry) => entry.absoluteErrorDays).sort((left, right) => left - right);
    const expectedMae = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    const expectedMedian = errors.length % 2 === 1 ? errors[Math.floor(errors.length / 2)] : (errors[errors.length / 2 - 1]! + errors[errors.length / 2]!) / 2;
    const expectedCoverage = entries.filter((entry) => entry.covered).length / entries.length;
    const expectedWidth = entries.reduce((sum, entry) => sum + entry.windowWidthDays, 0) / entries.length;
    expect(history.summary.predictionCount).toBe(entries.length);
    expect(history.summary.maeDays).toBeCloseTo(expectedMae, 12);
    expect(history.summary.medianAbsoluteErrorDays).toBe(expectedMedian);
    expect(history.summary.windowCoverage).toBeCloseTo(expectedCoverage, 12);
    expect(history.summary.meanWindowWidthDays).toBeCloseTo(expectedWidth, 12);
    expect(history.summary.calibrationError).toBeCloseTo(expectedCoverage - 0.8, 12);
  });

  it("returns null metrics cleanly when no historical origin is eligible", () => {
    const history = backtestCycleHistory(input([29]));
    expect(history.summary).toEqual({
      predictionCount: 0,
      maeDays: null,
      medianAbsoluteErrorDays: null,
      windowCoverage: null,
      meanWindowWidthDays: null,
      calibrationError: null,
    });
    expect(predictCycle(input([29])).uncertainty.calibrationFactor).toBe(1);
  });

  it("uses only preceding completed errors at each historical origin", () => {
    const stablePrefix = [29, 35, 28, 36, 27, 34, 30, 33];
    const original = backtestCycleHistory(input([...stablePrefix, 29, 35, 28, 36]));
    const changedFuture = backtestCycleHistory(input([...stablePrefix, 55, 18, 60, 17]));
    const prefixPeriods = periodsFromIntervals(stablePrefix);
    const frozenOrigin = prefixPeriods[prefixPeriods.length - 2]?.startDate;
    const originalPrediction = original.predictions.find((prediction) => prediction.originDate === frozenOrigin);
    const changedPrediction = changedFuture.predictions.find((prediction) => prediction.originDate === frozenOrigin);
    expect(originalPrediction).toEqual(changedPrediction);
    expect(originalPrediction?.calibrationFactor).toBeGreaterThanOrEqual(CYCLE_MODEL_V2_CONFIG.calibrationMinimumFactor);
    expect(originalPrediction?.calibrationFactor).toBeLessThanOrEqual(CYCLE_MODEL_V2_CONFIG.calibrationMaximumFactor);
  });

  it("keeps historical origins unchanged when an excluded future record is supplied", () => {
    const base = input([29, 31, 28, 30, 29, 31]);
    const futureRecord = period("future", "2027-12-31");
    expect(backtestCycleHistory({ ...base, periods: [...base.periods, futureRecord] })).toEqual(backtestCycleHistory(base));
  });

  it("activates only after configured history and clamps calibration factors", () => {
    const history = backtestCycleHistory(input([20, 42, 19, 45, 21, 43, 18, 46, 20, 44, 19, 47]));
    expect(history.predictions.slice(0, CYCLE_MODEL_V2_CONFIG.calibrationMinimumPredictions).every((entry) => entry.calibrationFactor === 1)).toBe(true);
    expect(
      history.predictions.every(
        (entry) =>
          entry.calibrationFactor >= CYCLE_MODEL_V2_CONFIG.calibrationMinimumFactor &&
          entry.calibrationFactor <= CYCLE_MODEL_V2_CONFIG.calibrationMaximumFactor,
      ),
    ).toBe(true);
  });

  it("does not mutate period observations while calibrating", () => {
    const original = input([29, 29, 43, 28, 30, 45, 29, 31, 42]);
    const snapshot = structuredClone(original);
    backtestCycleHistory(original);
    predictCycle(original);
    expect(original).toEqual(snapshot);
  });

  it("ranks regular history at least as reliable as equally sized noisy history", () => {
    const regular = predictCycle(input(Array.from({ length: 12 }, () => 29)));
    const noisy = predictCycle(input([20, 42, 19, 45, 21, 43, 18, 46, 20, 44, 19, 47]));
    const rank = { insufficient: 0, low: 1, moderate: 2, high: 3 } as const;
    expect(rank[regular.confidence.level]).toBeGreaterThanOrEqual(rank[noisy.confidence.level]);
    expect(noisy.confidence.level).not.toBe("high");
    expect(noisy.uncertainty.standardDeviationDays ?? 0).toBeGreaterThan(regular.uncertainty.standardDeviationDays ?? Infinity);
  });
});
