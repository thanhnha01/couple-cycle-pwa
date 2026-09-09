import { CYCLE_MODEL_V2_CONFIG as config } from "./config";

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("Cannot calculate the median of an empty collection.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) throw new RangeError("Median collection unexpectedly empty.");
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  if (lower === undefined) throw new RangeError("Median collection unexpectedly empty.");
  return (lower + upper) / 2;
}

export function robustScale(values: readonly number[]): { median: number; reported: number; computation: number } {
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  const reported = config.madScale * mad;
  return { median: center, reported, computation: Math.max(config.computationScaleFloorDays, reported) };
}

export function recencyWeights(length: number): number[] {
  return Array.from({ length }, (_, index) => {
    const age = length - 1 - index;
    return 2 ** (-age / config.recencyHalfLifeCycles);
  });
}

export function effectiveSampleSize(weights: readonly number[]): number {
  const sum = weights.reduce((total, value) => total + value, 0);
  const squaredSum = weights.reduce((total, value) => total + value * value, 0);
  return squaredSum === 0 ? 0 : (sum * sum) / squaredSum;
}

export function weightedMean(values: readonly number[], weights: readonly number[]): number {
  if (values.length !== weights.length || values.length === 0) throw new RangeError("Values and weights must be non-empty and aligned.");
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const weight = weights[index];
    if (value === undefined || weight === undefined) throw new RangeError("Values and weights must be aligned.");
    numerator += value * weight;
    denominator += weight;
  }
  return numerator / denominator;
}

export function weightedRootMeanSquare(values: readonly number[], weights: readonly number[]): number {
  return Math.sqrt(weightedMean(values.map((value) => value * value), weights));
}
