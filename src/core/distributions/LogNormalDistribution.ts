/**
 * Pure LogNormal Distribution
 * Mathematical implementation without automatic differentiation coupling
 *
 * The log-normal distribution models positive values whose logarithm is normally distributed.
 * If X ~ LogNormal(μ, σ), then log(X) ~ Normal(μ, σ)
 *
 * Parameterization: location (μ) and scale (σ) of the underlying normal
 * - Mean: exp(μ + σ²/2)
 * - Variance: (exp(σ²) - 1) * exp(2μ + σ²)
 * - Mode: exp(μ - σ²)
 * - PDF: (1/(x*σ*√(2π))) * exp(-(log(x)-μ)²/(2σ²)) for x > 0
 */

import { erf, erfInv } from '../utils/math/special';
import { RNG } from '../utils/math/random';

const LOG_TWO_PI = Math.log(2 * Math.PI);
const SQRT_TWO = Math.sqrt(2);
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

/**
 * Pure mathematical LogNormal distribution
 * Implements the canonical Distribution interface from InterfaceStandards.md
 */
export class LogNormalDistribution {
  private rng: RNG;

  constructor(
    private readonly muValue: number, // location parameter (mean of log)
    private readonly sigmaValue: number, // scale parameter (std dev of log)
    rng?: RNG
  ) {
    // Validate parameters
    if (sigmaValue < 0) {
      throw new Error(`Invalid LogNormal parameters: sigma=${sigmaValue}. Must be non-negative.`);
    }

    this.rng = rng || new RNG();
  }

  /**
   * Probability density function
   */
  pdf(x: number): number {
    if (x <= 0) return 0;

    if (this.sigmaValue === 0) {
      // Degenerate case: point mass at exp(μ)
      return x === Math.exp(this.muValue) ? Infinity : 0;
    }

    // LogNormal PDF: (1/(x*σ*√(2π))) * exp(-(log(x)-μ)²/(2σ²))
    const logX = Math.log(x);
    const coefficient = 1 / (x * this.sigmaValue * SQRT_TWO_PI);
    const exponent = -Math.pow(logX - this.muValue, 2) / (2 * this.sigmaValue * this.sigmaValue);

    return coefficient * Math.exp(exponent);
  }

  /**
   * Log probability density function
   */
  logPdf(x: number): number {
    if (x <= 0) return -Infinity;

    if (this.sigmaValue === 0) {
      // Degenerate case
      return x === Math.exp(this.muValue) ? Infinity : -Infinity;
    }

    // log p(x) = -log(x) - log(σ) - 0.5*log(2π) - (log(x)-μ)²/(2σ²)
    const logX = Math.log(x);
    const term1 = -logX;
    const term2 = -Math.log(this.sigmaValue);
    const term3 = -0.5 * LOG_TWO_PI;
    const term4 = -Math.pow(logX - this.muValue, 2) / (2 * this.sigmaValue * this.sigmaValue);

    return term1 + term2 + term3 + term4;
  }

  /**
   * Cumulative distribution function
   * Uses the error function via the underlying normal CDF
   */
  cdf(x: number): number {
    if (x <= 0) return 0;

    if (this.sigmaValue === 0) {
      // Degenerate case
      return x >= Math.exp(this.muValue) ? 1 : 0;
    }

    // Standardize log(x)
    const standardized = (Math.log(x) - this.muValue) / this.sigmaValue;

    // Use error function for normal CDF: Φ(z) = 0.5 * (1 + erf(z/√2))
    return 0.5 * (1 + erf(standardized / SQRT_TWO));
  }

  /**
   * Inverse CDF (quantile function)
   * Uses inverse error function
   */
  quantile(p: number): number {
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;

    if (this.sigmaValue === 0) {
      // Degenerate case
      return Math.exp(this.muValue);
    }

    // Use inverse error function: Φ^(-1)(p) = √2 * erf^(-1)(2p - 1)
    const standardizedQuantile = SQRT_TWO * erfInv(2 * p - 1);
    const logQuantile = this.muValue + this.sigmaValue * standardizedQuantile;

    return Math.exp(logQuantile);
  }

  /**
   * Mean of the LogNormal distribution: exp(μ + σ²/2)
   */
  mean(): number {
    return Math.exp(this.muValue + (this.sigmaValue * this.sigmaValue) / 2);
  }

  /**
   * Variance of the LogNormal distribution: (exp(σ²) - 1) * exp(2μ + σ²)
   */
  variance(): number {
    const sigma2 = this.sigmaValue * this.sigmaValue;
    const factor1 = Math.exp(sigma2) - 1;
    const factor2 = Math.exp(2 * this.muValue + sigma2);

    return factor1 * factor2;
  }

  /**
   * Support of the LogNormal distribution
   */
  support(): { min: number; max: number } {
    return { min: 0, max: Infinity };
  }

  /**
   * Sample from the LogNormal distribution
   * Returns single sample or array of samples
   */
  sample(n: number = 1, rng?: RNG): number | number[] {
    const useRng = rng || this.rng;

    if (n === 1) {
      // Sample from underlying normal and exponentiate
      const z = useRng.normal();
      return Math.exp(this.muValue + this.sigmaValue * z);
    }

    const samples: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const z = useRng.normal();
      samples[i] = Math.exp(this.muValue + this.sigmaValue * z);
    }

    return samples;
  }

  /**
   * Mode of the LogNormal distribution: exp(μ - σ²) for σ > 0, exp(μ) for σ = 0
   */
  mode(): number {
    if (this.sigmaValue === 0) {
      // Degenerate case
      return Math.exp(this.muValue);
    }

    return Math.exp(this.muValue - this.sigmaValue * this.sigmaValue);
  }

  /**
   * Median of the LogNormal distribution: exp(μ)
   */
  median(): number {
    return Math.exp(this.muValue);
  }

  /**
   * Standard deviation
   */
  stdDev(): number {
    return Math.sqrt(this.variance());
  }

  /**
   * Coefficient of variation: sqrt(exp(σ²) - 1)
   */
  coefficientOfVariation(): number {
    const sigma2 = this.sigmaValue * this.sigmaValue;
    return Math.sqrt(Math.exp(sigma2) - 1);
  }

  /**
   * Location parameter (μ) - mean of the underlying normal
   */
  mu(): number {
    return this.muValue;
  }

  /**
   * Scale parameter (σ) - standard deviation of the underlying normal
   */
  sigma(): number {
    return this.sigmaValue;
  }

  /**
   * Get distribution parameters
   */
  getParameters(): { mu: number; sigma: number } {
    return { mu: this.muValue, sigma: this.sigmaValue };
  }

  /**
   * Get parameters of the underlying normal distribution
   */
  getNormalParameters(): { mean: number; stdDev: number } {
    return { mean: this.muValue, stdDev: this.sigmaValue };
  }
}
