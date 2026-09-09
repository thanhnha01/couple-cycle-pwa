import type { CalendarDate } from "../utils/date";
import { addCalendarDays, calendarDaysBetween, tryCalendarDate } from "./calendar-math";
import { CYCLE_MODEL_V2_CONFIG as config } from "./config";
import { createStudentTDistribution } from "./distribution";
import { clamp, effectiveSampleSize, median, recencyWeights, robustScale, weightedMean, weightedRootMeanSquare } from "./robust-statistics";
import type {
  BacktestSummary,
  ConfidenceLevel,
  CycleBacktest,
  CycleBacktestPrediction,
  CycleEngineInput,
  CyclePrediction,
  MissingPeriodCandidate,
  PredictionWarning,
  PredictionWarningCode,
} from "./types";

interface NormalizedPeriod {
  id: string;
  startDate: CalendarDate;
  endDate?: CalendarDate;
}

interface Interval {
  from: NormalizedPeriod;
  to: NormalizedPeriod;
  days: number;
}

interface NormalizationResult {
  periods: NormalizedPeriod[];
  warnings: PredictionWarning[];
  periodRecords: number;
  validStartDates: number;
  invalidRecords: number;
  duplicateGroups: number;
  overlapGroups: number;
  ambiguousPeriodIds: Set<string>;
}

interface DynamicForecast {
  mean: number;
  variance: number;
  latestShock: number;
}

interface BacktestEntry extends CycleBacktestPrediction {
  windowHalfWidth: number;
}

interface CoreMeta {
  effectiveSamples: number;
  samples: number;
  variability: number;
  recentShock: number;
  ambiguousAnchor: boolean;
  hasMissingCandidate: boolean;
  hasOverlap: boolean;
}

interface CoreOutcome {
  prediction: CyclePrediction;
  meta: CoreMeta;
}

function warning(
  code: PredictionWarningCode,
  severity: PredictionWarning["severity"],
  periodIds: string[] = [],
  details?: Record<string, number | string | boolean>,
): PredictionWarning {
  return details === undefined ? { code, severity, periodIds } : { code, severity, periodIds, details };
}

function normalizePeriods(input: CycleEngineInput): NormalizationResult {
  const asOfDate = tryCalendarDate(input.asOfDate);
  if (asOfDate === null) throw new TypeError("CycleEngineInput.asOfDate must be a valid CalendarDate.");
  const warnings: PredictionWarning[] = [];
  const valid: NormalizedPeriod[] = [];
  let invalidRecords = 0;
  let validStartDates = 0;
  input.periods.forEach((record, index) => {
    const unknownRecord = record as unknown as { id?: unknown; startDate?: unknown; endDate?: unknown };
    const id = typeof unknownRecord.id === "string" && unknownRecord.id.length > 0 ? unknownRecord.id : `invalid-period-${index}`;
    const startDate = tryCalendarDate(unknownRecord.startDate);
    if (startDate === null) {
      invalidRecords += 1;
      warnings.push(warning("INVALID_START_DATE", "error", [id]));
      return;
    }
    if (startDate > asOfDate) return;
    validStartDates += 1;
    let endDate: CalendarDate | undefined;
    if (unknownRecord.endDate !== undefined) {
      const candidateEnd = tryCalendarDate(unknownRecord.endDate);
      if (candidateEnd === null) {
        invalidRecords += 1;
        warnings.push(warning("INVALID_END_DATE", "warning", [id]));
      } else if (candidateEnd < startDate) {
        invalidRecords += 1;
        warnings.push(warning("INVALID_PERIOD_RANGE", "warning", [id]));
      } else {
        endDate = candidateEnd;
      }
    }
    valid.push({ id, startDate, endDate });
  });
  valid.sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id));

  const periods: NormalizedPeriod[] = [];
  let duplicateGroups = 0;
  for (let index = 0; index < valid.length; ) {
    const first = valid[index];
    if (first === undefined) break;
    const group = [first];
    index += 1;
    while (valid[index]?.startDate === first.startDate) {
      const duplicate = valid[index];
      if (duplicate !== undefined) group.push(duplicate);
      index += 1;
    }
    if (group.length > 1) {
      duplicateGroups += 1;
      warnings.push(warning("DUPLICATE_PERIOD", "warning", group.map((period) => period.id)));
    }
    periods.push(first);
  }

  const ambiguousPeriodIds = new Set<string>();
  let overlapGroups = 0;
  for (let leftIndex = 0; leftIndex < periods.length; leftIndex += 1) {
    const left = periods[leftIndex];
    if (left?.endDate === undefined) continue;
    const group = [left.id];
    for (let rightIndex = leftIndex + 1; rightIndex < periods.length; rightIndex += 1) {
      const right = periods[rightIndex];
      if (right === undefined || right.startDate > left.endDate) break;
      group.push(right.id);
    }
    if (group.length > 1) {
      overlapGroups += 1;
      group.forEach((id) => ambiguousPeriodIds.add(id));
      warnings.push(warning("OVERLAPPING_PERIODS", "warning", group));
    }
  }
  return {
    periods,
    warnings,
    // Records after asOfDate are outside the observation boundary by design.
    periodRecords: validStartDates,
    validStartDates,
    invalidRecords,
    duplicateGroups,
    overlapGroups,
    ambiguousPeriodIds,
  };
}

function extractIntervals(periods: readonly NormalizedPeriod[], ambiguousPeriodIds: ReadonlySet<string>): Interval[] {
  const intervals: Interval[] = [];
  for (let index = 1; index < periods.length; index += 1) {
    const from = periods[index - 1];
    const to = periods[index];
    if (from === undefined || to === undefined || ambiguousPeriodIds.has(from.id) || ambiguousPeriodIds.has(to.id)) continue;
    const days = calendarDaysBetween(from.startDate, to.startDate);
    if (days > 0) intervals.push({ from, to, days });
  }
  return intervals;
}

function dynamicForecast(intervals: readonly number[], scale: number): DynamicForecast {
  const first = intervals[0];
  if (first === undefined) throw new RangeError("Dynamic model requires an interval.");
  const observationVariance = Math.max(config.observationNoiseFloorDays, scale) ** 2;
  const levelNoise = Math.max(config.minimumLevelProcessNoiseDays, config.levelProcessNoiseScale * scale);
  const trendNoise = Math.max(config.minimumTrendProcessNoiseDays, config.trendProcessNoiseScale * scale);
  let level = first;
  let trend = 0;
  let p00 = config.initialLevelStandardDeviationDays ** 2;
  let p01 = 0;
  let p11 = config.initialTrendStandardDeviationDays ** 2;
  let latestShock = 0;
  for (let index = 1; index < intervals.length; index += 1) {
    const observation = intervals[index];
    if (observation === undefined) continue;
    const damping = config.trendDamping;
    const predictedLevel = level + damping * trend;
    const predictedTrend = damping * trend;
    const predictedP00 = p00 + 2 * damping * p01 + damping * damping * p11 + levelNoise ** 2;
    const predictedP01 = damping * p01 + damping * damping * p11;
    const predictedP11 = damping * damping * p11 + trendNoise ** 2;
    const innovationVariance = predictedP00 + observationVariance;
    const rawInnovation = observation - predictedLevel;
    latestShock = Math.abs(rawInnovation) / Math.sqrt(innovationVariance);
    const innovation = clamp(rawInnovation, -config.huberLimit * Math.sqrt(innovationVariance), config.huberLimit * Math.sqrt(innovationVariance));
    const gainLevel = predictedP00 / innovationVariance;
    const gainTrend = predictedP01 / innovationVariance;
    level = predictedLevel + gainLevel * innovation;
    trend = predictedTrend + gainTrend * innovation;
    p00 = (1 - gainLevel) * predictedP00;
    p01 = (1 - gainLevel) * predictedP01;
    p11 = predictedP11 - gainTrend * predictedP01;
  }
  const damping = config.trendDamping;
  const forecastMean = level + damping * trend;
  const forecastP00 = p00 + 2 * damping * p01 + damping * damping * p11 + levelNoise ** 2;
  return { mean: forecastMean, variance: forecastP00 + observationVariance, latestShock };
}

function findMissingCandidates(intervals: readonly Interval[]): MissingPeriodCandidate[] {
  if (intervals.length < 3) return [];
  const candidates: MissingPeriodCandidate[] = [];
  for (let index = 0; index < intervals.length; index += 1) {
    const interval = intervals[index];
    if (interval === undefined) continue;
    const others = intervals.filter((_, otherIndex) => otherIndex !== index).map((item) => item.days);
    const baseline = median(others);
    if (interval.days <= config.missingGapMultiplier * baseline) continue;
    const tolerance = Math.max(config.missingGapMinimumToleranceDays, config.missingGapRelativeTolerance * baseline);
    const multiple = config.missingGapMultiples.find((candidate) => Math.abs(interval.days / candidate - baseline) <= tolerance);
    if (multiple !== undefined) {
      candidates.push({
        fromPeriodId: interval.from.id,
        toPeriodId: interval.to.id,
        intervalDays: interval.days,
        possibleMissedPeriods: multiple - 1,
      });
    }
  }
  return candidates;
}

function initialPrediction(normalized: NormalizationResult): CyclePrediction {
  return {
    modelVersion: config.version,
    anchorDate: normalized.periods.at(-1)?.startDate ?? null,
    expectedDate: null,
    predictionWindow: null,
    cycleLength: { expected: null, median: null, variability: null },
    uncertainty: { standardDeviationDays: null, calibratedByBacktest: false, calibrationFactor: 1 },
    confidence: { level: "insufficient", reasons: ["INSUFFICIENT_HISTORY"] },
    dataQuality: {
      periodRecords: normalized.periodRecords,
      validStartDates: normalized.validStartDates,
      samples: 0,
      effectiveSamples: 0,
      duplicateGroups: normalized.duplicateGroups,
      overlapGroups: normalized.overlapGroups,
      invalidRecords: normalized.invalidRecords,
      outlierIntervals: 0,
      missingSuspected: false,
      missingCandidates: [],
    },
    backtest: emptyBacktestSummary(),
    warnings: [...normalized.warnings, warning("INSUFFICIENT_HISTORY", "warning")],
  };
}

function emptyBacktestSummary(): BacktestSummary {
  return {
    predictionCount: 0,
    maeDays: null,
    medianAbsoluteErrorDays: null,
    windowCoverage: null,
    meanWindowWidthDays: null,
    calibrationError: null,
  };
}

function buildCore(input: CycleEngineInput, calibrationFactor: number, includeDistribution: boolean): CoreOutcome {
  const normalized = normalizePeriods(input);
  const intervals = extractIntervals(normalized.periods, normalized.ambiguousPeriodIds);
  if (intervals.length === 0) {
    return {
      prediction: initialPrediction(normalized),
      meta: { effectiveSamples: 0, samples: 0, variability: 0, recentShock: 0, ambiguousAnchor: false, hasMissingCandidate: false, hasOverlap: normalized.overlapGroups > 0 },
    };
  }
  const values = intervals.map((interval) => interval.days);
  const { median: center, reported: variability, computation: scale } = robustScale(values);
  const weights = recencyWeights(values.length);
  const effectiveSamples = effectiveSampleSize(weights);
  const robustValues = values.map((value) => center + clamp(value - center, -config.huberLimit * scale, config.huberLimit * scale));
  const robustMean = weightedMean(robustValues, weights);
  const tailExcesses = values.map((value) => Math.max(0, Math.abs(value - center) - config.huberLimit * scale));
  const tailRms = weightedRootMeanSquare(tailExcesses, weights);
  const observationVariance = Math.max(config.observationNoiseFloorDays, scale) ** 2;
  const baselineVariance = observationVariance * (1 + 1 / effectiveSamples) + config.tailVarianceWeight * tailRms ** 2;
  const dynamic = dynamicForecast(values, scale);
  const blend = clamp(
    (effectiveSamples - config.dynamicBlendStartEffectiveSamples) / config.dynamicBlendRampEffectiveSamples,
    0,
    config.dynamicBlendMaximum,
  );
  const expectedLength = (1 - blend) * robustMean + blend * dynamic.mean;
  const blendedVariance =
    (1 - blend) * baselineVariance + blend * dynamic.variance + blend * (1 - blend) * (robustMean - dynamic.mean) ** 2;
  const outlierThreshold = Math.max(config.outlierScaleMultiplier * scale, config.outlierMinimumDays);
  const outlierIntervals = intervals.filter((interval) => Math.abs(interval.days - center) > outlierThreshold);
  const missingCandidates = findMissingCandidates(intervals);
  const outlierFraction = outlierIntervals.length / intervals.length;
  const missingFraction = missingCandidates.length / intervals.length;
  const shockFraction = clamp((dynamic.latestShock - 1) / 2, 0, 1);
  const qualityInflation =
    1 +
    config.outlierVarianceInflation * outlierFraction +
    config.missingVarianceInflation * missingFraction +
    config.shockVarianceInflation * shockFraction;
  const sparseFloor = Math.max(config.predictiveStandardDeviationFloorDays, config.sparseUncertaintyNumeratorDays / Math.sqrt(effectiveSamples));
  const standardDeviation = Math.max(Math.sqrt(blendedVariance * qualityInflation), sparseFloor) * calibrationFactor;
  const distribution = createStudentTDistribution(expectedLength, standardDeviation ** 2, effectiveSamples);
  const anchorDate = normalized.periods.at(-1)?.startDate;
  if (anchorDate === undefined) throw new RangeError("Prediction interval exists without an anchor period.");
  const expectedDate = addCalendarDays(anchorDate, Math.floor(distribution.expectedOffset + 0.5));
  const predictionWindow = {
    start: addCalendarDays(anchorDate, distribution.startOffset),
    end: addCalendarDays(anchorDate, distribution.endOffset),
    coverage: config.predictionWindowCoverage,
  };
  const warnings = [...normalized.warnings];
  if (intervals.length === 1) warnings.push(warning("PRELIMINARY_PREDICTION", "warning", [intervals[0]?.from.id ?? "", intervals[0]?.to.id ?? ""]));
  for (const interval of intervals) {
    if (interval.days < config.extremeIntervalMinimumDays || interval.days > config.extremeIntervalMaximumDays) {
      warnings.push(warning("EXTREME_INTERVAL", "warning", [interval.from.id, interval.to.id], { intervalDays: interval.days }));
    }
  }
  for (const interval of outlierIntervals) {
    warnings.push(warning("OUTLIER_INTERVAL", "warning", [interval.from.id, interval.to.id], { intervalDays: interval.days }));
  }
  for (const candidate of missingCandidates) {
    warnings.push(warning("UNUSUALLY_LONG_GAP", "warning", [candidate.fromPeriodId, candidate.toPeriodId], { intervalDays: candidate.intervalDays }));
    warnings.push(warning("MISSING_PERIOD_SUSPECTED", "warning", [candidate.fromPeriodId, candidate.toPeriodId], { possibleMissedPeriods: candidate.possibleMissedPeriods }));
  }
  if (dynamic.latestShock > config.huberLimit) warnings.push(warning("RECENT_INSTABILITY", "warning", [], { standardizedInnovation: dynamic.latestShock }));
  const ambiguousAnchor = normalized.ambiguousPeriodIds.has(anchorDate === undefined ? "" : (normalized.periods.at(-1)?.id ?? ""));
  if (ambiguousAnchor) warnings.push(warning("AMBIGUOUS_ANCHOR", "warning", [normalized.periods.at(-1)?.id ?? ""]));
  const asOfDate = tryCalendarDate(input.asOfDate);
  if (asOfDate === null) throw new TypeError("CycleEngineInput.asOfDate must be a valid CalendarDate.");
  if (expectedDate < asOfDate) warnings.push(warning("PREDICTION_PASSED_WITHOUT_RECORD", "info", [], { expectedDate }));
  return {
    prediction: {
      modelVersion: config.version,
      anchorDate,
      expectedDate,
      predictionWindow,
      cycleLength: { expected: distribution.expectedOffset, median: center, variability },
      uncertainty: {
        standardDeviationDays: standardDeviation,
        calibratedByBacktest: calibrationFactor !== 1,
        calibrationFactor,
      },
      confidence: { level: "low", reasons: [] },
      dataQuality: {
        periodRecords: normalized.periodRecords,
        validStartDates: normalized.validStartDates,
        samples: intervals.length,
        effectiveSamples,
        duplicateGroups: normalized.duplicateGroups,
        overlapGroups: normalized.overlapGroups,
        invalidRecords: normalized.invalidRecords,
        outlierIntervals: outlierIntervals.length,
        missingSuspected: missingCandidates.length > 0,
        missingCandidates,
      },
      backtest: emptyBacktestSummary(),
      ...(includeDistribution
        ? {
            distribution: distribution.offsets.map((offset, index) => ({
              date: addCalendarDays(anchorDate, offset),
              probability: distribution.probabilities[index] ?? 0,
            })),
          }
        : {}),
      warnings,
    },
    meta: {
      effectiveSamples,
      samples: intervals.length,
      variability,
      recentShock: dynamic.latestShock,
      ambiguousAnchor,
      hasMissingCandidate: missingCandidates.length > 0,
      hasOverlap: normalized.overlapGroups > 0,
    },
  };
}

function summarizeBacktest(entries: readonly BacktestEntry[]): BacktestSummary {
  if (entries.length === 0) return emptyBacktestSummary();
  const errors = entries.map((entry) => entry.absoluteErrorDays);
  const coverage = entries.filter((entry) => entry.covered).length / entries.length;
  return {
    predictionCount: entries.length,
    maeDays: errors.reduce((sum, value) => sum + value, 0) / errors.length,
    medianAbsoluteErrorDays: median(errors),
    windowCoverage: coverage,
    meanWindowWidthDays: entries.reduce((sum, entry) => sum + entry.windowWidthDays, 0) / entries.length,
    calibrationError: coverage - config.predictionWindowCoverage,
  };
}

interface CalibrationObservation {
  absoluteErrorDays: number;
  windowHalfWidth: number;
}

function calibrationFactor(entries: readonly CalibrationObservation[]): number {
  if (entries.length < config.calibrationMinimumPredictions) return 1;
  const recent = entries.slice(-config.calibrationRecentPredictions);
  const ratios = recent.map((entry) => entry.absoluteErrorDays / entry.windowHalfWidth).sort((left, right) => left - right);
  const index = Math.min(ratios.length - 1, Math.max(0, Math.ceil(config.predictionWindowCoverage * ratios.length) - 1));
  const quantile = ratios[index];
  if (quantile === undefined || !Number.isFinite(quantile)) return 1;
  return clamp(quantile, config.calibrationMinimumFactor, config.calibrationMaximumFactor);
}

/**
 * Evaluates each historical origin with only the data and completed errors that
 * existed at that origin. It shares buildCore with current predictions and
 * deliberately never calls predictCycle, preventing recursive backtesting.
 */
export function backtestCycleHistory(input: CycleEngineInput): CycleBacktest {
  const normalized = normalizePeriods(input);
  const entries: BacktestEntry[] = [];
  const periods = normalized.periods;
  for (let targetIndex = 2; targetIndex < periods.length; targetIndex += 1) {
    const target = periods[targetIndex];
    const anchor = periods[targetIndex - 1];
    if (target === undefined || anchor === undefined) continue;
    const prefix = periods.slice(0, targetIndex);
    const factor = calibrationFactor(entries);
    const core = buildCore({ periods: prefix, asOfDate: anchor.startDate, includeDistribution: false }, factor, false).prediction;
    if (core.expectedDate === null || core.predictionWindow === null) continue;
    const absoluteError = Math.abs(calendarDaysBetween(core.expectedDate, target.startDate));
    const covered = target.startDate >= core.predictionWindow.start && target.startDate <= core.predictionWindow.end;
    const width = calendarDaysBetween(core.predictionWindow.start, core.predictionWindow.end) + 1;
    entries.push({
      originDate: anchor.startDate,
      actualDate: target.startDate,
      expectedDate: core.expectedDate,
      predictionWindow: core.predictionWindow,
      absoluteErrorDays: absoluteError,
      covered,
      windowWidthDays: width,
      calibrationFactor: factor,
      windowHalfWidth: Math.max(1, width / 2),
    });
  }
  return {
    modelVersion: config.version,
    summary: summarizeBacktest(entries),
    predictions: entries.map((entry) => ({
      originDate: entry.originDate,
      actualDate: entry.actualDate,
      expectedDate: entry.expectedDate,
      predictionWindow: entry.predictionWindow,
      absoluteErrorDays: entry.absoluteErrorDays,
      covered: entry.covered,
      windowWidthDays: entry.windowWidthDays,
      calibrationFactor: entry.calibrationFactor,
    })),
  };
}

function confidenceLevel(prediction: CyclePrediction, meta: CoreMeta, backtest: BacktestSummary): { level: ConfidenceLevel; reasons: string[] } {
  if (meta.samples === 0) return { level: "insufficient", reasons: ["INSUFFICIENT_HISTORY"] };
  const width = prediction.predictionWindow === null ? Infinity : calendarDaysBetween(prediction.predictionWindow.start, prediction.predictionWindow.end) + 1;
  const variabilityRatio = prediction.cycleLength.expected === null || prediction.cycleLength.expected <= 0 ? Infinity : meta.variability / prediction.cycleLength.expected;
  if (
    meta.effectiveSamples < config.confidence.lowEffectiveSamples ||
    backtest.predictionCount < config.confidence.moderateBacktests ||
    width > config.confidence.lowMaximumWindowDays ||
    meta.ambiguousAnchor
  ) {
    return { level: "low", reasons: ["SPARSE_OR_UNSTABLE_HISTORY"] };
  }
  const high =
    meta.effectiveSamples >= config.confidence.highEffectiveSamples &&
    backtest.predictionCount >= config.confidence.highBacktests &&
    (backtest.medianAbsoluteErrorDays ?? Infinity) <= config.confidence.highMedianAbsoluteErrorDays &&
    (backtest.windowCoverage ?? 0) >= config.confidence.highMinimumCoverage &&
    width <= config.confidence.highMaximumWindowDays &&
    (backtest.meanWindowWidthDays ?? Infinity) <= config.confidence.highMaximumWindowDays &&
    variabilityRatio <= config.confidence.highMaximumVariabilityRatio &&
    !meta.hasMissingCandidate &&
    !meta.hasOverlap &&
    meta.recentShock <= config.huberLimit;
  if (high) return { level: "high", reasons: ["CONSISTENT_HISTORY_AND_BACKTEST"] };
  const moderate =
    (backtest.medianAbsoluteErrorDays ?? Infinity) <= config.confidence.moderateMedianAbsoluteErrorDays &&
    (backtest.windowCoverage ?? 0) >= config.confidence.moderateMinimumCoverage &&
    width <= config.confidence.moderateMaximumWindowDays &&
    variabilityRatio <= config.confidence.moderateMaximumVariabilityRatio &&
    !meta.ambiguousAnchor;
  return moderate ? { level: "moderate", reasons: ["PERSONALIZED_WITH_LIMITED_EVIDENCE"] } : { level: "low", reasons: ["VARIABLE_OR_POORLY_CALIBRATED_HISTORY"] };
}

/** Pure, deterministic Cycle Engine v2 entry point. */
export function predictCycle(input: CycleEngineInput): CyclePrediction {
  const uncalibrated = buildCore(input, 1, input.includeDistribution === true);
  const backtest = backtestCycleHistory(input);
  const factor = calibrationFactor(
    backtest.predictions.map((prediction) => ({
      absoluteErrorDays: prediction.absoluteErrorDays,
      windowHalfWidth: Math.max(1, prediction.windowWidthDays / 2),
    })),
  );
  const calibrated = factor === 1 ? uncalibrated : buildCore(input, factor, input.includeDistribution === true);
  const confidence = confidenceLevel(calibrated.prediction, calibrated.meta, backtest.summary);
  return { ...calibrated.prediction, backtest: backtest.summary, confidence };
}
