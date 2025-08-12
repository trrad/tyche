/**
 * Beta-Binomial conjugate inference engine
 * Migrated to extend InferenceEngine base class with proper capabilities
 */

import { InferenceEngine, EngineCapabilities } from '../base/InferenceEngine';
import {
  FitOptions,
  InferenceResult,
  Posterior,
  ModelConfig,
  ModelStructure,
  ModelType,
} from '../base/types';
import { StandardData, DataType } from '../../core/data/StandardData';
import { TycheError, ErrorCode } from '../../core/errors';
import { BetaDistribution } from '../../core/distributions/BetaDistribution';

/**
 * Beta posterior distribution wrapper
 * Implements the Posterior interface with analytical capabilities
 */
class BetaPosterior implements Posterior {
  private distribution: BetaDistribution;

  constructor(
    private readonly alpha: number,
    private readonly beta: number
  ) {
    if (alpha <= 0 || beta <= 0) {
      throw new TycheError(
        ErrorCode.INVALID_PRIOR,
        `Invalid Beta parameters: alpha=${alpha}, beta=${beta}. Both must be positive.`
      );
    }
    this.distribution = new BetaDistribution(alpha, beta);
  }

  /**
   * Sample from the posterior
   */
  sample(n: number = 1): number[] {
    return this.distribution.sample(n);
  }

  /**
   * Analytical mean
   */
  mean(): number[] {
    return [this.distribution.mean()];
  }

  /**
   * Analytical variance
   */
  variance(): number[] {
    return [this.distribution.variance()];
  }

  /**
   * Credible interval using quantiles
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    // For now, approximate with percentiles from samples
    // In production, we'd use the incomplete beta function
    const samples = this.sample(10000);
    samples.sort((a, b) => a - b);
    const lower = samples[Math.floor(samples.length * alpha)];
    const upper = samples[Math.floor(samples.length * (1 - alpha))];
    return [[lower, upper]];
  }

  /**
   * Log probability density/mass function
   * Required for WAIC computation
   */
  logPdf(data: any): number {
    // For binomial data, we need the Beta-Binomial log PMF
    if (data && typeof data === 'object' && 'successes' in data && 'trials' in data) {
      const { successes: s, trials: n } = data;
      // Beta-Binomial log PMF using the beta function
      // P(X=s|n,α,β) = C(n,s) * B(s+α, n-s+β) / B(α,β)
      return (
        this.logChoose(n, s) +
        this.logBeta(s + this.alpha, n - s + this.beta) -
        this.logBeta(this.alpha, this.beta)
      );
    }
    throw new TycheError(ErrorCode.INVALID_DATA, 'Invalid data for Beta posterior');
  }

  /**
   * Batch log PDF computation
   */
  logPdfBatch(data: any[]): number[] {
    return data.map((d) => this.logPdf(d));
  }

  /**
   * This posterior has analytical form
   */
  hasAnalyticalForm(): boolean {
    return true;
  }

  /**
   * Get the parameters of the posterior
   */
  getParameters(): { alpha: number; beta: number } {
    return { alpha: this.alpha, beta: this.beta };
  }

  /**
   * Sample parameters from the Beta posterior
   * Returns a probability p ~ Beta(alpha, beta)
   */
  sampleParameters(): { p: number } {
    // Sample from Beta distribution
    const p = this.distribution.sample(1)[0];
    return { p };
  }

  /**
   * Compute log likelihood of data given specific parameter value
   * This is the Binomial likelihood, not the Beta-Binomial predictive
   * @param data - Must have {successes, trials} format
   * @param params - Parameter value {p: probability}
   */
  static logLikelihood(data: { successes: number; trials: number }, params: { p: number }): number {
    const { successes: s, trials: n } = data;
    const { p } = params;

    // Binomial log likelihood: log C(n,s) + s*log(p) + (n-s)*log(1-p)
    // Use helper for log choose
    const logChoose = (n: number, k: number): number => {
      if (k > n || k < 0) return -Infinity;
      if (k === 0 || k === n) return 0;

      let result = 0;
      for (let i = 1; i <= k; i++) {
        result += Math.log(n - k + i) - Math.log(i);
      }
      return result;
    };

    const eps = 1e-10; // Avoid log(0)
    const pSafe = Math.max(eps, Math.min(1 - eps, p));

    return logChoose(n, s) + s * Math.log(pSafe) + (n - s) * Math.log(1 - pSafe);
  }

  /**
   * Instance method for log likelihood (delegates to static method)
   */
  logLikelihood(data: { successes: number; trials: number }, params: { p: number }): number {
    return BetaPosterior.logLikelihood(data, params);
  }

  /**
   * Mode of the Beta distribution (for α > 1, β > 1)
   */
  mode(): number {
    if (this.alpha > 1 && this.beta > 1) {
      return (this.alpha - 1) / (this.alpha + this.beta - 2);
    }
    // Mode not well-defined for alpha <= 1 or beta <= 1
    return NaN;
  }

  /**
   * Probability that the parameter is greater than a threshold
   */
  probabilityGreaterThan(threshold: number): number {
    if (threshold < 0) return 1;
    if (threshold > 1) return 0;
    return 1 - this.distribution.cdf(threshold);
  }

  // Helper methods
  private logBeta(a: number, b: number): number {
    return this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b);
  }

  private logGamma(x: number): number {
    // Use Stirling's approximation for large x
    if (x > 170) {
      return x * Math.log(x) - x + 0.5 * Math.log((2 * Math.PI) / x);
    }
    // For smaller x, use a simple implementation
    return Math.log(this.gamma(x));
  }

  private gamma(x: number): number {
    // Simple recursive implementation
    if (x === 1) return 1;
    if (x < 1) return this.gamma(x + 1) / x;
    return (x - 1) * this.gamma(x - 1);
  }

  private logChoose(n: number, k: number): number {
    if (k > n || k < 0) return -Infinity;
    if (k === 0 || k === n) return 0;
    // Use log factorials
    let result = 0;
    for (let i = 0; i < k; i++) {
      result += Math.log(n - i) - Math.log(i + 1);
    }
    return result;
  }
}

/**
 * Beta-Binomial conjugate inference engine
 *
 * This implements exact Bayesian inference for binomial data with a Beta prior.
 * The posterior is also Beta-distributed due to conjugacy.
 *
 * Model: X ~ Binomial(n, p), p ~ Beta(α, β)
 * Posterior: p | X ~ Beta(α + x, β + n - x)
 */
export class BetaBinomialConjugate extends InferenceEngine {
  /**
   * Declare capabilities for routing
   */
  readonly capabilities: EngineCapabilities = {
    structures: ['simple'] as ModelStructure[],
    types: ['beta'] as ModelType[],
    dataTypes: ['binomial'] as DataType[],
    components: [1], // Only single component
    exact: true,
    fast: true,
    stable: true,
  };

  /**
   * Algorithm type
   */
  readonly algorithm = 'conjugate' as const;

  constructor() {
    super('Beta-Binomial Conjugate');
  }

  /**
   * Fit the model using conjugate updating
   */
  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const start = performance.now();

    // Validate data
    this.validateStandardData(data);

    // Additional validation for binomial data
    if (data.type !== 'binomial') {
      throw new TycheError(ErrorCode.INVALID_DATA, 'BetaBinomialConjugate requires binomial data', {
        actualType: data.type,
      });
    }

    if (!data.binomial) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Binomial data structure is missing');
    }

    const { successes, trials } = data.binomial;

    // Get prior parameters (default to uniform Beta(1,1))
    let priorAlpha = 1;
    let priorBeta = 1;

    if (options?.priorParams) {
      if (options.priorParams.type !== 'beta') {
        throw new TycheError(ErrorCode.INVALID_PRIOR, 'BetaBinomial requires beta prior', {
          actualType: options.priorParams.type,
        });
      }
      if (options.priorParams.params.length !== 2) {
        throw new TycheError(ErrorCode.INVALID_PRIOR, 'Beta prior requires exactly 2 parameters');
      }
      [priorAlpha, priorBeta] = options.priorParams.params;
    }

    // Conjugate update
    const posteriorAlpha = priorAlpha + successes;
    const posteriorBeta = priorBeta + (trials - successes);

    // Create posterior
    const posterior = new BetaPosterior(posteriorAlpha, posteriorBeta);

    const runtime = performance.now() - start;

    // Return result with diagnostics
    return {
      posterior,
      diagnostics: {
        converged: true, // Always converges (exact inference)
        iterations: 1, // Single update
        runtime,
        modelType: 'beta-binomial',
        parameterCount: 2, // alpha and beta
      },
    };
  }

  /**
   * Override canHandle to provide more specific checks
   */
  canHandle(config: ModelConfig, data: StandardData, options?: FitOptions): boolean {
    // Use base class method which checks capabilities
    if (!super.canHandle(config, data, options)) {
      return false;
    }

    // Additional specific checks
    if (config.structure !== 'simple') {
      return false;
    }

    if (config.type !== 'beta') {
      return false;
    }

    if (data.type !== 'binomial') {
      return false;
    }

    return true;
  }

  /**
   * Helper to convert array data to binomial format
   */
  static arrayToBinomial(data: number[]): { successes: number; trials: number } {
    const successes = data.filter((x) => x === 1).length;
    const trials = data.length;
    return { successes, trials };
  }
}

export { BetaPosterior };
