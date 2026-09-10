import { describe, expect, it } from "vitest";
import { estimateFertility } from "./fertility";
import { calendarDate } from "../utils/date";
import type { CyclePrediction, Period } from "./types";

const base: CyclePrediction = {
  modelVersion: "test", anchorDate: calendarDate("2026-08-01"), expectedDate: calendarDate("2026-08-29"), predictionWindow: { start: calendarDate("2026-08-27"), end: calendarDate("2026-09-02"), coverage: .8 }, cycleLength: { expected: 28, median: 28, variability: 2 }, uncertainty: { standardDeviationDays: 2, calibratedByBacktest: false, calibrationFactor: 1 }, confidence: { level: "moderate", reasons: [] }, dataQuality: { periodRecords: 3, validStartDates: 3, samples: 2, effectiveSamples: 2, duplicateGroups: 0, overlapGroups: 0, invalidRecords: 0, outlierIntervals: 0, missingSuspected: false, missingCandidates: [] }, backtest: { predictionCount: 0, maeDays: null, medianAbsoluteErrorDays: null, windowCoverage: null, meanWindowWidthDays: null, calibrationError: null }, warnings: []
};
const periods: Period[] = [];

describe("fertility reference estimate", () => {
  it("returns an estimated fertile window", () => expect(estimateFertility(periods, base, calendarDate("2026-08-15")).status).toBe("ovulation"));
  it("does not guess without an expected date", () => expect(estimateFertility(periods, { ...base, expectedDate: null }, calendarDate("2026-08-27")).status).toBe("unknown"));
});
