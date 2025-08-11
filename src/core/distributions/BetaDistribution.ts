/**
 * Pure Beta Distribution
 * Mathematical implementation without automatic differentiation coupling
 */

import { logBeta } from '../utils/math/special';
import { RNG } from '../utils/math/random';
import { Distribution } from './Distribution';
import jStat from 'jstat';

/**
 * Pure mathematical Beta distribution
 * Implements the canonical Distribution interface from InterfaceStandards.md
 */
export class BetaDistribution implements Distribution {
  private rng: RNG;

  constructor(
    private readonly alpha: number,
    private readonly beta: number,
    rng?: RNG
  ) {
    // Validate parameters
    if (alpha <= 0 || beta <= 0) {
      throw new Error(
        `Invalid Beta parameters: alpha=${alpha}, beta=${beta}. Both must be positive.`
      );
    }

    this.rng = rng || new RNG();
  }

  /**
   * Probability density function
   */
  pdf(x: number): number {
    // Check bounds
    if (x <= 0 || x >= 1) {
      return 0;
    }

    // Beta PDF: x^(α-1) * (1-x)^(β-1) / B(α,β)
    const logPdf = this.logPdf(x);
    return Math.exp(logPdf);
  }

  /**
   * Log probability density function
   */
  logPdf(x: number): number {
    // Check bounds
    if (x <= 0 || x >= 1) {
      return -Infinity;
    }

    // log(Beta PDF) = (α-1)log(x) + (β-1)log(1-x) - log(B(α,β))
    const term1 = (this.alpha - 1) * Math.log(x);
    const term2 = (this.beta - 1) * Math.log(1 - x);
    const normalization = -logBeta(this.alpha, this.beta);

    return term1 + term2 + normalization;
  }

  /**
   * Cumulative distribution function
   * Uses the incomplete beta function ratio I_x(α, β)
   */
  cdf(x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Use jStat's regularized incomplete beta function
    // Note: We'll implement a basic version for now
    return this.incompleteBeta(x, this.alpha, this.beta);
  }

  /**
   * Mean of the Beta distribution: α/(α+β)
   */
  mean(): number {
    return this.alpha / (this.alpha + this.beta);
  }

  /**
   * Variance of the Beta distribution: αβ/((α+β)²(α+β+1))
   */
  variance(): number {
    const alphaPlusBeta = this.alpha + this.beta;
    const numerator = this.alpha * this.beta;
    const denominator = alphaPlusBeta * alphaPlusBeta * (alphaPlusBeta + 1);

    return numerator / denominator;
  }

  /**
   * Support of the Beta distribution
   */
  support(): { min: number; max: number } {
    return { min: 0, max: 1 };
  }

  /**
   * Sample values from the distribution
   */
  sample(n: number, rng?: () => number): number[] {
    const samples: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = this.rng.beta(this.alpha, this.beta);
    }
    return samples;
  }

  /**
   * Mode of the Beta distribution (for α > 1, β > 1)
   */
  mode(): number {
    if (this.alpha <= 1 || this.beta <= 1) {
      throw new Error('Mode is undefined for Beta distribution when α ≤ 1 or β ≤ 1');
    }

    return (this.alpha - 1) / (this.alpha + this.beta - 2);
  }

  /**
   * Credible interval for the Beta distribution
   * Uses jStat's Beta inverse CDF (quantile function)
   */
  credibleInterval(level: number = 0.95): [number, number] {
    const alpha = (1 - level) / 2;
    return [
      jStat.beta.inv(alpha, this.alpha, this.beta),
      jStat.beta.inv(1 - alpha, this.alpha, this.beta),
    ];
  }

  /**
   * Get distribution parameters
   */
  getParameters(): { alpha: number; beta: number } {
    return { alpha: this.alpha, beta: this.beta };
  }

  /**
   * Basic implementation of regularized incomplete beta function
   * I_x(a,b) = B(x; a, b) / B(a, b)
   *
   * This is a simplified implementation for CDF computation
   */
  private incompleteBeta(x: number, a: number, b: number): number {
    // For simple cases
    if (x === 0) return 0;
    if (x === 1) return 1;

    // Use continued fraction expansion for better accuracy
    // This is a simplified version - in production we'd use a more robust implementation
    const bt = Math.exp(logBeta(a, b) + a * Math.log(x) + b * Math.log(1 - x));

    if (x < (a + 1) / (a + b + 2)) {
      // Use continued fraction directly
      return (bt * this.betacf(x, a, b)) / a;
    } else {
      // Use symmetry relation
      return 1 - (bt * this.betacf(1 - x, b, a)) / b;
    }
  }

  /**
   * Continued fraction for incomplete beta function
   * Simplified implementation
   */
  private betacf(x: number, a: number, b: number): number {
    const MAXITS = 100;
    const EPS = 3e-7;
    const FPMIN = 1e-30;

    let m, m2: number;
    let aa, c, d, del, h, qab, qam, qap: number;

    qab = a + b;
    qap = a + 1;
    qam = a - 1;
    c = 1;
    d = 1 - (qab * x) / qap;

    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    h = d;

    for (m = 1; m <= MAXITS; m++) {
      m2 = 2 * m;
      aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }

    return h;
  }
}
