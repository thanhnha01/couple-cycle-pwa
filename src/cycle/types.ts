import type { CalendarDate, Timestamp } from "../utils/date";

/** An actual, user-recorded period. Predictions are never accepted as history. */
export interface Period {
  id: string;
  coupleId: string;
  startDate: CalendarDate;
  endDate?: CalendarDate;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
  updatedBy: string;
  revision: number;
}

export type ConfidenceLevel = "insufficient" | "low" | "moderate" | "high";

export type PredictionWarningCode =
  | "INSUFFICIENT_HISTORY"
  | "PRELIMINARY_PREDICTION"
  | "INVALID_START_DATE"
  | "INVALID_END_DATE"
  | "INVALID_PERIOD_RANGE"
  | "DUPLICATE_PERIOD"
  | "OVERLAPPING_PERIODS"
  | "EXTREME_INTERVAL"
  | "OUTLIER_INTERVAL"
  | "UNUSUALLY_LONG_GAP"
  | "MISSING_PERIOD_SUSPECTED"
  | "RECENT_INSTABILITY"
  | "AMBIGUOUS_ANCHOR"
  | "PREDICTION_PASSED_WITHOUT_RECORD";

export interface PredictionWarning {
  code: PredictionWarningCode;
  severity: "info" | "warning" | "error";
  periodIds: string[];
  details?: Record<string, number | string | boolean>;
}

export interface MissingPeriodCandidate {
  fromPeriodId: string;
  toPeriodId: string;
  intervalDays: number;
  possibleMissedPeriods: number;
}

export interface BacktestSummary {
  predictionCount: number;
  maeDays: number | null;
  medianAbsoluteErrorDays: number | null;
  windowCoverage: number | null;
  meanWindowWidthDays: number | null;
  /** Observed 80% window coverage minus the target 0.8 coverage. */
  calibrationError: number | null;
}

/** A leakage-free historical prediction evaluated against its now-known next period. */
export interface CycleBacktestPrediction {
  originDate: CalendarDate;
  actualDate: CalendarDate;
  expectedDate: CalendarDate;
  predictionWindow: {
    start: CalendarDate;
    end: CalendarDate;
    coverage: 0.8;
  };
  absoluteErrorDays: number;
  covered: boolean;
  windowWidthDays: number;
  /** Applied using completed origins strictly before this prediction. */
  calibrationFactor: number;
}

export interface CycleBacktest {
  modelVersion: string;
  summary: BacktestSummary;
  predictions: CycleBacktestPrediction[];
}

export interface CycleEngineInput {
  periods: ReadonlyArray<Pick<Period, "id" | "startDate" | "endDate">>;
  /** Period starts strictly after this date are not observations. */
  asOfDate: CalendarDate;
  includeDistribution?: boolean;
}

export interface CyclePrediction {
  modelVersion: string;
  anchorDate: CalendarDate | null;
  expectedDate: CalendarDate | null;
  predictionWindow: {
    start: CalendarDate;
    end: CalendarDate;
    coverage: 0.8;
  } | null;
  cycleLength: {
    expected: number | null;
    median: number | null;
    /** Robust standard deviation estimate: 1.4826 x MAD, in days. */
    variability: number | null;
  };
  uncertainty: {
    standardDeviationDays: number | null;
    calibratedByBacktest: boolean;
    calibrationFactor: number;
  };
  confidence: {
    level: ConfidenceLevel;
    reasons: string[];
  };
  dataQuality: {
    periodRecords: number;
    validStartDates: number;
    samples: number;
    effectiveSamples: number;
    duplicateGroups: number;
    overlapGroups: number;
    invalidRecords: number;
    outlierIntervals: number;
    missingSuspected: boolean;
    missingCandidates: MissingPeriodCandidate[];
  };
  backtest: BacktestSummary;
  distribution?: Array<{
    date: CalendarDate;
    probability: number;
  }>;
  warnings: PredictionWarning[];
}
