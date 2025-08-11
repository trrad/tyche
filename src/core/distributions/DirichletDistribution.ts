/**
 * Dirichlet Distribution for Mixture Weight Posteriors in VBEM
 *
 * The Dirichlet distribution is the multivariate generalization of the Beta distribution,
 * used as the conjugate prior for categorical/multinomial distributions.
 *
 * In VBEM context:
 * - Prior: Dir(α₁, ..., αₖ) with symmetric α = 1 (uniform)
 * - Posterior: Dir(α₁ + N₁, ..., αₖ + Nₖ) where Nₖ = Σᵢ responsibilities[i][k]
 */

import { Distribution } from './Distribution';
import { BetaDistribution } from './BetaDistribution';
import { GammaDistribution } from './GammaDistribution';
import { logGamma, logBeta, digamma } from '../utils/math/special';
import { RNG } from '../utils/math/random';

/**
 * Dirichlet distribution implementation
 * Note: This extends Distribution but works with vector values, not scalars
 */
export class DirichletDistribution {
  private rng: RNG;
  private _logNormalizingConstant?: number;

  constructor(
    private readonly alpha: number[], // Concentration parameters
    rng?: RNG
  ) {
    // Validate parameters
    if (alpha.length === 0) {
      throw new Error('DirichletDistribution requires at least one concentration parameter');
    }

    if (alpha.some((a) => a <= 0)) {
      throw new Error('All concentration parameters must be positive');
    }

    this.rng = rng || new RNG();
  }

  /**
   * Get the dimension of the distribution
   */
  get dimension(): number {
    return this.alpha.length;
  }

  /**
   * Probability density function (multivariate)
   */
  pdf(x: number[]): number {
    return Math.exp(this.logPdf(x));
  }

  /**
   * Log probability density function
   * log p(x|α) = Σₖ (αₖ-1)log(xₖ) - log B(α)
   */
  logPdf(x: number[]): number {
    // Validate input
    if (x.length !== this.alpha.length) {
      throw new Error('Input dimension must match distribution dimension');
    }

    // Check simplex constraint: Σxₖ = 1 and all xₖ ≥ 0
    const sum = x.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-10) {
      return -Infinity; // Not on simplex
    }

    if (x.some((xi) => xi < 0 || xi > 1)) {
      return -Infinity; // Outside support
    }

    // Compute log density
    let logDensity = 0;
    for (let k = 0; k < this.alpha.length; k++) {
      if (x[k] === 0 && this.alpha[k] < 1) {
        return -Infinity; // Zero probability at boundary when α < 1
      }
      if (x[k] > 0) {
        logDensity += (this.alpha[k] - 1) * Math.log(x[k]);
      }
    }

    return logDensity - this.logNormalizingConstant();
  }

  /**
   * Sample from the Dirichlet distribution using Gamma representation
   * If X_k ~ Gamma(α_k, 1), then (X₁/S, ..., Xₖ/S) ~ Dir(α₁, ..., αₖ)
   * where S = Σ X_k
   */
  sample(n: number = 1): number[][] {
    const samples: number[][] = [];

    for (let i = 0; i < n; i++) {
      const gammaSamples: number[] = [];
      let sum = 0;

      // Sample from Gamma distributions
      for (let k = 0; k < this.alpha.length; k++) {
        const gamma = new GammaDistribution(this.alpha[k], 1, this.rng);
        const sample = gamma.sample(1)[0];
        gammaSamples.push(sample);
        sum += sample;
      }

      // Normalize to get Dirichlet sample
      const dirichletSample = gammaSamples.map((g) => g / sum);
      samples.push(dirichletSample);
    }

    return samples;
  }

  /**
   * Mean of the Dirichlet distribution
   * E[πₖ] = αₖ / Σⱼ αⱼ
   */
  mean(): number[] {
    const alphaSum = this.alpha.reduce((a, b) => a + b, 0);
    return this.alpha.map((a) => a / alphaSum);
  }

  /**
   * Variance of each component (diagonal of covariance matrix)
   * Var[πₖ] = αₖ(Σαⱼ - αₖ) / [(Σαⱼ)²(Σαⱼ + 1)]
   */
  variance(): number[] {
    const alphaSum = this.alpha.reduce((a, b) => a + b, 0);
    const alphaSumSq = alphaSum * alphaSum;
    const alphaSumPlus1 = alphaSum + 1;

    return this.alpha.map((ak) => {
      const numerator = ak * (alphaSum - ak);
      const denominator = alphaSumSq * alphaSumPlus1;
      return numerator / denominator;
    });
  }

  /**
   * Covariance between components i and j
   * Cov[πᵢ, πⱼ] = -αᵢαⱼ / [(Σαₖ)²(Σαₖ + 1)] for i ≠ j
   */
  covariance(i: number, j: number): number {
    if (i === j) {
      return this.variance()[i];
    }

    const alphaSum = this.alpha.reduce((a, b) => a + b, 0);
    const alphaSumSq = alphaSum * alphaSum;
    const alphaSumPlus1 = alphaSum + 1;

    return (-this.alpha[i] * this.alpha[j]) / (alphaSumSq * alphaSumPlus1);
  }

  /**
   * Expected log weights for VBEM
   * E[log πₖ] = ψ(αₖ) - ψ(Σαⱼ)
   * where ψ is the digamma function
   */
  expectedLogWeights(): number[] {
    const alphaSum = this.alpha.reduce((a, b) => a + b, 0);
    const digammaSum = digamma(alphaSum);

    return this.alpha.map((ak) => digamma(ak) - digammaSum);
  }

  /**
   * Get the k-th marginal distribution (Beta distribution)
   * πₖ ~ Beta(αₖ, Σⱼ≠ₖ αⱼ)
   */
  marginalBeta(k: number): BetaDistribution {
    if (k < 0 || k >= this.alpha.length) {
      throw new Error(`Invalid component index: ${k}`);
    }

    const alphaK = this.alpha[k];
    const alphaNotK = this.alpha.reduce((sum, a, i) => (i === k ? sum : sum + a), 0);

    return new BetaDistribution(alphaK, alphaNotK, this.rng);
  }

  /**
   * KL divergence from this distribution to another Dirichlet
   * KL(p||q) = log B(αq)/B(αp) + Σₖ (αpₖ - αqₖ)[ψ(αpₖ) - ψ(Σαpⱼ)]
   */
  klDivergence(other: DirichletDistribution): number {
    if (this.alpha.length !== other.alpha.length) {
      throw new Error('Distributions must have same dimension for KL divergence');
    }

    // Log normalizing constant ratio
    const logRatio = other.logNormalizingConstant() - this.logNormalizingConstant();

    // Expectation term
    const alphaSumThis = this.alpha.reduce((a, b) => a + b, 0);
    const digammaSumThis = digamma(alphaSumThis);

    let expectation = 0;
    for (let k = 0; k < this.alpha.length; k++) {
      const diff = this.alpha[k] - other.alpha[k];
      const digammaDiff = digamma(this.alpha[k]) - digammaSumThis;
      expectation += diff * digammaDiff;
    }

    return logRatio + expectation;
  }

  /**
   * Entropy of the distribution
   * H[p] = log B(α) - (K-1)ψ(Σαₖ) + Σₖ (αₖ-1)ψ(αₖ)
   */
  entropy(): number {
    const K = this.alpha.length;
    const alphaSum = this.alpha.reduce((a, b) => a + b, 0);
    const digammaSum = digamma(alphaSum);

    let sum = 0;
    for (let k = 0; k < K; k++) {
      sum += (this.alpha[k] - 1) * digamma(this.alpha[k]);
    }

    return this.logNormalizingConstant() - (alphaSum - K) * digammaSum + sum;
  }

  /**
   * Support of the distribution (K-1 simplex)
   */
  support(): string {
    return `${this.alpha.length - 1}-simplex`;
  }

  /**
   * Get concentration parameters
   */
  getAlpha(): number[] {
    return [...this.alpha];
  }

  /**
   * Compute log normalizing constant log B(α)
   * log B(α) = Σₖ log Γ(αₖ) - log Γ(Σₖ αₖ)
   */
  private logNormalizingConstant(): number {
    if (this._logNormalizingConstant === undefined) {
      const alphaSum = this.alpha.reduce((a, b) => a + b, 0);
      let logBeta = -logGamma(alphaSum);

      for (const ak of this.alpha) {
        logBeta += logGamma(ak);
      }

      this._logNormalizingConstant = logBeta;
    }
    return this._logNormalizingConstant;
  }

  /**
   * Mode of the distribution (when all αₖ > 1)
   * mode[k] = (αₖ - 1) / (Σⱼ αⱼ - K)
   */
  mode(): number[] | null {
    // Mode only exists when all alpha > 1
    if (this.alpha.some((a) => a <= 1)) {
      return null;
    }

    const K = this.alpha.length;
    const alphaSum = this.alpha.reduce((a, b) => a + b, 0);
    const denominator = alphaSum - K;

    return this.alpha.map((ak) => (ak - 1) / denominator);
  }

  /**
   * Check if the distribution is symmetric (all αₖ equal)
   */
  isSymmetric(): boolean {
    const first = this.alpha[0];
    return this.alpha.every((a) => Math.abs(a - first) < 1e-10);
  }

  /**
   * Create a symmetric Dirichlet distribution
   */
  static symmetric(K: number, alpha: number = 1, rng?: RNG): DirichletDistribution {
    if (K <= 0) {
      throw new Error('Number of components must be positive');
    }
    return new DirichletDistribution(new Array(K).fill(alpha), rng);
  }

  /**
   * Create a uniform Dirichlet (symmetric with α = 1)
   */
  static uniform(K: number, rng?: RNG): DirichletDistribution {
    return DirichletDistribution.symmetric(K, 1, rng);
  }
}
