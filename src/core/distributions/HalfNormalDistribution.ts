/**
 * Pure HalfNormal Distribution
 * Mathematical implementation without automatic differentiation coupling
 */

import { erf, erfInv } from '../utils/math/special';
import { RNG } from '../utils/math/random';
import { Distribution } from './Distribution';

const LOG_TWO_PI = Math.log(2 * Math.PI);
const SQRT_TWO = Math.sqrt(2);
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

/**
 * Pure mathematical HalfNormal distribution
 * Implements the canonical Distribution interface from InterfaceStandards.md
 */
export class HalfNormalDistribution implements Distribution {
  private rng: RNG;

  constructor(
    private readonly stdDevValue: number,
    rng?: RNG
  ) {
    // Validate parameters
    if (stdDevValue <= 0) {
      throw new Error(
        `Invalid HalfNormal parameters: stdDev=${stdDevValue}. Standard deviation must be positive.`
      );
    }

    this.rng = rng || new RNG();
  }

  /**
   * Probability density function
   */
  pdf(x: number): number {
    if (x < 0) return 0;

    // Half-normal PDF: 2 * φ(x/σ) / σ where φ is standard normal PDF
    const standardized = x / this.stdDevValue;
    const normalPdf = (1 / SQRT_TWO_PI) * Math.exp(-0.5 * standardized * standardized);
    return (2 / this.stdDevValue) * normalPdf;
  }

  /**
   * Log probability density function
   */
  logPdf(x: number): number {
    if (x < 0) return -Infinity;

    // log(2 * φ(x/σ) / σ) = log(2) + log(φ(x/σ)) - log(σ)
    const standardized = x / this.stdDevValue;
    const logNormalPdf = -0.5 * LOG_TWO_PI - 0.5 * standardized * standardized;
    return Math.log(2) + logNormalPdf - Math.log(this.stdDevValue);
  }

  /**
   * Cumulative distribution function
   */
  cdf(x: number): number {
    if (x <= 0) return 0;

    // Half-normal CDF: 2 * Φ(x/σ) - 1 where Φ is standard normal CDF
    const standardized = x / (this.stdDevValue * SQRT_TWO);
    const normalCdf = 0.5 * (1 + erf(standardized));
    return 2 * normalCdf - 1;
  }

  /**
   * Inverse CDF (quantile function)
   */
  quantile(p: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;

    // For half-normal: x = σ * √2 * erf^(-1)((p+1)/2 - 1)
    const erfArg = (p + 1) / 2 - 1; // This maps [0,1] to [-1,1]
    // Actually, let's use: x = σ * Φ^(-1)((p+1)/2) where Φ^(-1) is normal quantile
    const normalQuantileArg = (p + 1) / 2;
    const standardizedQuantile = SQRT_TWO * erfInv(2 * normalQuantileArg - 1);
    return this.stdDevValue * standardizedQuantile;
  }

  /**
   * Mean of the HalfNormal distribution: σ * sqrt(2/π)
   */
  mean(): number {
    return this.stdDevValue * Math.sqrt(2 / Math.PI);
  }

  /**
   * Variance of the HalfNormal distribution: σ² * (1 - 2/π)
   */
  variance(): number {
    const sigma2 = this.stdDevValue * this.stdDevValue;
    return sigma2 * (1 - 2 / Math.PI);
  }

  /**
   * Support of the HalfNormal distribution
   */
  support(): { min: number; max: number } {
    return { min: 0, max: Infinity };
  }

  /**
   * Sample from the HalfNormal distribution
   * Returns single sample or array of samples
   */
  sample(n: number, rng?: () => number): number[] {
    const samples: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = Math.abs(this.stdDevValue * this.rng.normal());
    }
    return samples;
  }

  /**
   * Mode of the HalfNormal distribution (always 0)
   */
  mode(): number {
    return 0;
  }

  /**
   * Standard deviation of the underlying normal
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
   * Get distribution parameters
   */
  getParameters(): { stdDev: number } {
    return { stdDev: this.stdDevValue };
  }
}
