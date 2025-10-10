/**
 * Normal-Inverse-Gamma Distribution
 *
 * The conjugate prior for the Normal distribution with unknown mean and variance.
 * If (μ, σ²) ~ NIG(μ₀, λ, α, β), then:
 * - μ | σ² ~ Normal(μ₀, σ²/λ)
 * - σ² ~ InverseGamma(α, β)
 *
 * Parameterization:
 * - μ₀: prior mean of μ
 * - λ: prior precision (confidence in μ₀)
 * - α: shape parameter for σ²
 * - β: scale parameter for σ²
 *
 * Mean: μ₀ (for μ), β/(α-1) (for σ² when α > 1)
 * This is the proper conjugate prior for LogNormal inference engines.
 */

import { RNG } from '../utils/math/random';
import { Distribution } from './Distribution';
import { GammaDistribution } from './GammaDistribution';
import { NormalDistribution } from './NormalDistribution';

/**
 * Normal-Inverse-Gamma distribution implementation
 * Implements the canonical Distribution interface from InterfaceStandards.md
 */
export class NormalInverseGammaDistribution implements Distribution {
  private rng: RNG;

  constructor(
    private readonly mu0: number, // Prior mean of μ
    private readonly lambda: number, // Prior precision (confidence in mu0)
    private readonly alpha: number, // Shape parameter for σ²
    private readonly beta: number // Scale parameter for σ²
  ) {
    // Validate parameters
    if (lambda <= 0) {
      throw new Error(`Invalid lambda parameter: ${lambda}. Must be positive.`);
    }
    if (alpha <= 0) {
      throw new Error(`Invalid alpha parameter: ${alpha}. Must be positive.`);
    }
    if (beta <= 0) {
      throw new Error(`Invalid beta parameter: ${beta}. Must be positive.`);
    }

    this.rng = new RNG();
  }

  /**
   * Probability density function
   * For NIG, we typically evaluate at parameter values [μ, σ²]
   */
  pdf(x: number): number {
    throw new Error(
      'NormalInverseGamma is a prior distribution - use for parameter sampling, not data likelihood'
    );
  }

  /**
   * Log probability density function
   * For NIG, we typically evaluate at parameter values [μ, σ²]
   */
  logPdf(x: number): number {
    throw new Error(
      'NormalInverseGamma is a prior distribution - use for parameter sampling, not data likelihood'
    );
  }

  /**
   * CDF not typically used for prior distributions
   */
  cdf(x: number): number {
    throw new Error('CDF not applicable for Normal-Inverse-Gamma prior distribution');
  }

  /**
   * Sample parameters from the distribution
   * This is a prior distribution that samples parameter values for use in other distributions
   * Returns [μ, σ²] pairs but flattened for Distribution interface compatibility
   */
  sample(n: number): number[] {
    // For the Distribution interface, we need to return number[], not number[][]
    // We'll alternate μ, σ² values: [μ₁, σ²₁, μ₂, σ²₂, ...]
    const samples: number[] = [];

    for (let i = 0; i < n; i++) {
      // Sample σ² from Inverse-Gamma(α, β) using proven approach from LogNormalConjugate
      const gamma = new GammaDistribution(this.alpha, 1 / this.beta);
      const sigma2 = 1 / gamma.sample(1)[0];

      // Sample μ | σ² from Normal(μ₀, σ²/λ) using proven approach
      const muDist = new NormalDistribution(this.mu0, Math.sqrt(sigma2 / this.lambda));
      const mu = muDist.sample(1)[0];

      samples.push(mu, sigma2);
    }

    return samples;
  }

  /**
   * Sample parameter pairs as [μ, σ²] - convenience method for engine use
   */
  sampleParameters(n: number = 1): Array<{ mu: number; sigma2: number }> {
    const results: Array<{ mu: number; sigma2: number }> = [];

    for (let i = 0; i < n; i++) {
      // Use the same proven sampling approach
      const gamma = new GammaDistribution(this.alpha, 1 / this.beta);
      const sigma2 = 1 / gamma.sample(1)[0];

      const muDist = new NormalDistribution(this.mu0, Math.sqrt(sigma2 / this.lambda));
      const mu = muDist.sample(1)[0];

      results.push({ mu, sigma2 });
    }

    return results;
  }

  /**
   * Mean of μ component (Distribution interface requires single value)
   */
  mean(): number {
    return this.mu0;
  }

  /**
   * Variance of μ component (Distribution interface requires single value)
   */
  variance(): number {
    // Var[μ] = E[Var[μ|σ²]] + Var[E[μ|σ²]] = E[σ²/λ] + 0 = β/(λ(α-1)) for α > 1
    return this.alpha > 1 ? this.beta / (this.lambda * (this.alpha - 1)) : Infinity;
  }

  /**
   * Get means of both μ and σ² components - convenience method for multivariate use
   */
  getMeans(): number[] {
    const muMean = this.mu0;
    const sigma2Mean = this.alpha > 1 ? this.beta / (this.alpha - 1) : Infinity;
    return [muMean, sigma2Mean];
  }

  /**
   * Get variances of both μ and σ² components - convenience method for multivariate use
   */
  getVariances(): number[] {
    // Var[μ] = E[Var[μ|σ²]] + Var[E[μ|σ²]] = E[σ²/λ] + 0 = β/(λ(α-1)) for α > 1
    const muVariance = this.alpha > 1 ? this.beta / (this.lambda * (this.alpha - 1)) : Infinity;

    // Var[σ²] for InverseGamma(α, β) = β²/((α-1)²(α-2)) for α > 2
    const sigma2Variance =
      this.alpha > 2
        ? (this.beta * this.beta) / ((this.alpha - 1) * (this.alpha - 1) * (this.alpha - 2))
        : Infinity;

    return [muVariance, sigma2Variance];
  }

  /**
   * Support for the flattened sample format [μ₁, σ²₁, μ₂, σ²₂, ...]
   */
  support(): { min: number; max: number } {
    // Since we alternate μ, σ² values, we can't meaningfully define single min/max
    // This is a limitation of the Distribution interface for multivariate distributions
    return { min: -Infinity, max: Infinity };
  }

  /**
   * Get distribution parameters
   */
  getParameters(): { mu0: number; lambda: number; alpha: number; beta: number } {
    return {
      mu0: this.mu0,
      lambda: this.lambda,
      alpha: this.alpha,
      beta: this.beta,
    };
  }

  /**
   * Helper: log gamma function (simplified implementation)
   */
  private logGamma(x: number): number {
    // Stirling's approximation for log(Γ(x))
    // More accurate implementation would use Lanczos approximation
    if (x < 0.5) {
      // Use reflection formula: Γ(z)Γ(1-z) = π/sin(πz)
      return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - this.logGamma(1 - x);
    }

    // Stirling's approximation
    return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI);
  }
}
