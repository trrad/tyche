/**
 * Pure Normal Distribution
 * Mathematical implementation without automatic differentiation coupling
 */

import { erf, erfInv } from '../utils/math/special';
import { RNG } from '../utils/math/random';

const LOG_TWO_PI = Math.log(2 * Math.PI);
const SQRT_TWO = Math.sqrt(2);
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

/**
 * Pure mathematical Normal distribution
 * Implements the canonical Distribution interface from InterfaceStandards.md
 */
export class NormalDistribution {
  private rng: RNG;

  constructor(
    private readonly meanValue: number,
    private readonly stdDevValue: number,
    rng?: RNG
  ) {
    // Validate parameters
    if (stdDevValue <= 0) {
      throw new Error(
        `Invalid Normal parameters: stdDev=${stdDevValue}. Standard deviation must be positive.`
      );
    }

    this.rng = rng || new RNG();
  }

  /**
   * Probability density function
   */
  pdf(x: number): number {
    if (this.stdDevValue === 0) {
      // Degenerate case: point mass at mean
      return x === this.meanValue ? Infinity : 0;
    }

    const standardized = (x - this.meanValue) / this.stdDevValue;
    const coefficient = 1 / (this.stdDevValue * SQRT_TWO_PI);
    return coefficient * Math.exp(-0.5 * standardized * standardized);
  }

  /**
   * Log probability density function
   */
  logPdf(x: number): number {
    if (this.stdDevValue === 0) {
      // Degenerate case
      return x === this.meanValue ? Infinity : -Infinity;
    }

    // log(φ(x)) = -0.5 * log(2π) - log(σ) - 0.5 * ((x - μ) / σ)²
    const standardized = (x - this.meanValue) / this.stdDevValue;
    return -0.5 * LOG_TWO_PI - Math.log(this.stdDevValue) - 0.5 * standardized * standardized;
  }

  /**
   * Cumulative distribution function
   */
  cdf(x: number): number {
    if (this.stdDevValue === 0) {
      // Degenerate case: point mass at mean
      return x >= this.meanValue ? 1 : 0;
    }

    const standardized = (x - this.meanValue) / (this.stdDevValue * SQRT_TWO);
    return 0.5 * (1 + erf(standardized));
  }

  /**
   * Inverse CDF (quantile function)
   */
  quantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return this.meanValue;

    if (this.stdDevValue === 0) {
      // Degenerate case: point mass at mean
      return this.meanValue;
    }

    // Φ^(-1)(p) = μ + σ * √2 * erf^(-1)(2p - 1)
    const standardizedQuantile = SQRT_TWO * erfInv(2 * p - 1);
    return this.meanValue + this.stdDevValue * standardizedQuantile;
  }

  /**
   * Mean of the Normal distribution
   */
  mean(): number {
    return this.meanValue;
  }

  /**
   * Variance of the Normal distribution: σ²
   */
  variance(): number {
    return this.stdDevValue * this.stdDevValue;
  }

  /**
   * Support of the Normal distribution
   */
  support(): { min: number; max: number } {
    return { min: -Infinity, max: Infinity };
  }

  /**
   * Sample from the Normal distribution
   * Returns single sample or array of samples
   */
  sample(n: number = 1, rng?: RNG): number | number[] {
    const useRng = rng || this.rng;

    if (n === 1) {
      return this.meanValue + this.stdDevValue * useRng.normal();
    }

    const samples: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = this.meanValue + this.stdDevValue * useRng.normal();
    }

    return samples;
  }

  /**
   * Mode of the Normal distribution (equals the mean)
   */
  mode(): number {
    return this.meanValue;
  }

  /**
   * Standard deviation
   */
  stdDev(): number {
    return this.stdDevValue;
  }

  /**
   * Precision (1/variance)
   */
  precision(): number {
    return 1 / this.variance();
  }

  /**
   * Standardize a value: (x - μ) / σ
   */
  standardize(x: number): number {
    return (x - this.meanValue) / this.stdDevValue;
  }

  /**
   * Get distribution parameters
   */
  getParameters(): { mean: number; stdDev: number } {
    return { mean: this.meanValue, stdDev: this.stdDevValue };
  }
}
