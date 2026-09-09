import { CYCLE_MODEL_V2_CONFIG as config } from "./config";

export interface DiscreteDistribution {
  offsets: number[];
  probabilities: number[];
  expectedOffset: number;
  startOffset: number;
  endOffset: number;
}

const LANCZOS_COEFFICIENTS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9.984369578019572e-6,
  1.5056327351493116e-7,
] as const;

function logGamma(value: number): number {
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const z = value - 1;
  let accumulator = LANCZOS_COEFFICIENTS[0] ?? 0;
  for (let index = 1; index < LANCZOS_COEFFICIENTS.length; index += 1) {
    const coefficient = LANCZOS_COEFFICIENTS[index];
    if (coefficient !== undefined) accumulator += coefficient / (z + index);
  }
  const t = z + LANCZOS_COEFFICIENTS.length - 1.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(accumulator);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maximumIterations = 200;
  const epsilon = 3e-14;
  const minimum = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < minimum) d = minimum;
  d = 1 / d;
  let h = d;
  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const twiceIteration = 2 * iteration;
    let aa = (iteration * (b - iteration) * x) / ((a + twiceIteration - 1) * (a + twiceIteration));
    d = 1 + aa * d;
    if (Math.abs(d) < minimum) d = minimum;
    c = 1 + aa / c;
    if (Math.abs(c) < minimum) c = minimum;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + iteration) * (a + b + iteration) * x) / ((a + twiceIteration) * (a + twiceIteration + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < minimum) d = minimum;
    c = 1 + aa / c;
    if (Math.abs(c) < minimum) c = minimum;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const logFront = logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  const front = Math.exp(logFront);
  const direct = (front * betaContinuedFraction(a, b, x)) / a;
  return x < (a + 1) / (a + b + 2) ? direct : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Deterministic Student-t CDF using the regularized incomplete beta function. */
export function studentTCdf(value: number, degreesOfFreedom: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(degreesOfFreedom) || degreesOfFreedom <= 0) {
    throw new TypeError("Student-t arguments must be finite and degrees of freedom positive.");
  }
  if (value === 0) return 0.5;
  const x = degreesOfFreedom / (degreesOfFreedom + value * value);
  const beta = regularizedIncompleteBeta(x, degreesOfFreedom / 2, 0.5);
  return value > 0 ? 1 - beta / 2 : beta / 2;
}

export function createStudentTDistribution(mean: number, variance: number, effectiveSamples: number): DiscreteDistribution {
  if (!Number.isFinite(mean) || !Number.isFinite(variance) || variance <= 0) {
    throw new TypeError("Distribution mean and variance must be finite, with positive variance.");
  }
  const degreesOfFreedom = Math.min(
    config.studentTDegreesOfFreedomMaximum,
    config.studentTDegreesOfFreedomBase + Math.floor(effectiveSamples),
  );
  const scale = Math.sqrt((variance * (degreesOfFreedom - 2)) / degreesOfFreedom);
  const rawOffsets: number[] = [];
  const rawProbabilities: number[] = [];
  for (let offset = 1; offset <= config.distributionMaximumCycleDays; offset += 1) {
    const upper = studentTCdf((offset + 0.5 - mean) / scale, degreesOfFreedom);
    const lower = studentTCdf((offset - 0.5 - mean) / scale, degreesOfFreedom);
    rawOffsets.push(offset);
    rawProbabilities.push(Math.max(0, upper - lower));
    if (upper >= 1 - config.distributionTailMass && offset > mean) break;
  }
  const total = rawProbabilities.reduce((sum, probability) => sum + probability, 0);
  if (!Number.isFinite(total) || total <= 0) throw new RangeError("Could not normalize Student-t prediction distribution.");
  const probabilities = rawProbabilities.map((probability) => probability / total);
  const finalProbability = probabilities[probabilities.length - 1];
  if (finalProbability === undefined) throw new RangeError("Distribution unexpectedly empty.");
  probabilities[probabilities.length - 1] = finalProbability + (1 - probabilities.reduce((sum, probability) => sum + probability, 0));
  const expectedOffset = rawOffsets.reduce((sum, offset, index) => sum + offset * (probabilities[index] ?? 0), 0);
  const lowerTail = (1 - config.predictionWindowCoverage) / 2;
  const upperTail = 1 - lowerTail;
  let cumulative = 0;
  let startOffset = rawOffsets[0] ?? 1;
  let endOffset = rawOffsets[rawOffsets.length - 1] ?? 1;
  for (let index = 0; index < rawOffsets.length; index += 1) {
    cumulative += probabilities[index] ?? 0;
    const offset = rawOffsets[index] ?? 1;
    if (cumulative >= lowerTail && startOffset === (rawOffsets[0] ?? 1)) startOffset = offset;
    if (cumulative >= upperTail) {
      endOffset = offset;
      break;
    }
  }
  return { offsets: rawOffsets, probabilities, expectedOffset, startOffset, endOffset };
}
