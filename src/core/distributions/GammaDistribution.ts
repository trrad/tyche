/**
 * Pure Gamma Distribution
 * Mathematical implementation without automatic differentiation coupling
 */

import { logGamma } from '../utils/math/special';
import { RNG } from '../utils/math/random';
import { Distribution } from './Distribution';

/**
 * Pure mathematical Gamma distribution
 * Implements the canonical Distribution interface from InterfaceStandards.md
 *
 * Uses shape-scale parameterization: Gamma(α, θ) where α is shape and θ is scale
 * Mean = α * θ, Variance = α * θ²
 */
export class GammaDistribution implements Distribution {
  private rng: RNG;

  constructor(
    private readonly shape: number, // α (alpha)
    private readonly scale: number, // θ (theta)
    rng?: RNG
  ) {
    // Validate parameters
    if (shape <= 0 || scale <= 0) {
      throw new Error(
        `Invalid Gamma parameters: shape=${shape}, scale=${scale}. Both must be positive.`
      );
    }

    this.rng = rng || new RNG();
  }

  /**
   * Probability density function
   */
  pdf(x: number): number {
    if (x <= 0) return 0;

    // Gamma PDF: x^(α-1) * exp(-x/θ) / (Γ(α) * θ^α)
    const logPdf = this.logPdf(x);
    return Math.exp(logPdf);
  }

  /**
   * Log probability density function
   */
  logPdf(x: number): number {
    if (x <= 0) return -Infinity;

    // log p(x) = -log(Γ(α)) - α*log(θ) + (α-1)*log(x) - x/θ
    const logGammaAlpha = logGamma(this.shape);
    const term1 = -logGammaAlpha;
    const term2 = -this.shape * Math.log(this.scale);
    const term3 = (this.shape - 1) * Math.log(x);
    const term4 = -x / this.scale;

    return term1 + term2 + term3 + term4;
  }

  /**
   * Cumulative distribution function
   * Uses numerical approximation - could be improved with incomplete gamma function
   */
  cdf(x: number): number {
    if (x <= 0) return 0;

    // Use numerical integration for all cases (simple but consistent)
    const steps = 1000;
    const dx = x / steps;
    let sum = 0;

    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) * dx;
      sum += this.pdf(t) * dx;
    }

    return Math.min(1, sum);
  }

  /**
   * Mean of the Gamma distribution: α * θ
   */
  mean(): number {
    return this.shape * this.scale;
  }

  /**
   * Variance of the Gamma distribution: α * θ²
   */
  variance(): number {
    return this.shape * this.scale * this.scale;
  }

  /**
   * Support of the Gamma distribution
   */
  support(): { min: number; max: number } {
    return { min: 0, max: Infinity };
  }

  /**
   * Sample values from the distribution
   */
  sample(n: number, rng?: () => number): number[] {
    const samples: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      samples[i] = this.rng.gamma(this.shape, this.scale);
    }
    return samples;
  }

  /**
   * Mode of the Gamma distribution
   * Mode = (α - 1) * θ for α >= 1, otherwise 0
   */
  mode(): number {
    if (this.shape >= 1) {
      return (this.shape - 1) * this.scale;
    } else {
      return 0;
    }
  }

  /**
   * Standard deviation
   */
  stdDev(): number {
    return Math.sqrt(this.variance());
  }

  /**
   * Rate parameter (inverse scale): β = 1/θ
   */
  rate(): number {
    return 1 / this.scale;
  }

  /**
   * Get distribution parameters
   */
  getParameters(): { shape: number; scale: number } {
    return { shape: this.shape, scale: this.scale };
  }

  /**
   * Alternative parameterization: get shape and rate
   */
  getShapeRate(): { shape: number; rate: number } {
    return { shape: this.shape, rate: this.rate() };
  }

  /**
   * Simplified incomplete gamma function for CDF (lower regularized)
   * This is a basic approximation - could be improved
   */
  private incompleteGammaLower(x: number): number {
    // Use series expansion for P(a,x) = γ(a,x)/Γ(a)
    // γ(a,x) = x^a * e^(-x) * Σ(x^n / Γ(a+n+1)) for n=0 to ∞

    const a = this.shape;
    const scaledX = x / this.scale;

    if (scaledX === 0) return 0;

    let sum = 1;
    let term = 1;

    // Series expansion
    for (let n = 1; n < 100; n++) {
      term *= scaledX / (a + n - 1);
      sum += term;

      if (Math.abs(term) < 1e-10) break;
    }

    const result = (Math.pow(scaledX, a) * Math.exp(-scaledX) * sum) / Math.exp(logGamma(a));
    return Math.min(1, result);
  }
}
