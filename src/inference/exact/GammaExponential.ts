/**
 * Gamma-Exponential conjugate inference
 * Exact Bayesian inference for positive continuous values
 */

import jStat from 'jstat';
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
import { GammaDistribution } from '../../core/distributions';

/**
 * Gamma posterior distribution wrapper
 */
export class GammaPosterior implements Posterior {
  constructor(
    private readonly shape: number, // alpha
    private readonly rate: number // beta (rate = 1/scale)
  ) {
    if (shape <= 0 || rate <= 0) {
      throw new Error(
        `Invalid Gamma parameters: shape=${shape}, rate=${rate}. Both must be positive.`
      );
    }
  }

  mean(): number[] {
    return [this.shape / this.rate];
  }

  variance(): number[] {
    return [this.shape / (this.rate * this.rate)];
  }

  sample(): number[] {
    // Use jstat for sampling - note jstat uses scale parameterization
    const scale = 1 / this.rate;
    return [jStat.gamma.sample(this.shape, scale)];
  }

  logPdf(data: any): number {
    // Convert rate to scale for jStat
    const scale = 1 / this.rate;
    if (Array.isArray(data)) {
      // Sum log probabilities for multiple data points
      return data.reduce((sum, x) => sum + Math.log(jStat.gamma.pdf(x, this.shape, scale)), 0);
    }
    return Math.log(jStat.gamma.pdf(data, this.shape, scale));
  }

  credibleInterval(level: number = 0.95): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    const scale = 1 / this.rate;

    return [
      [jStat.gamma.inv(alpha, this.shape, scale), jStat.gamma.inv(1 - alpha, this.shape, scale)],
    ];
  }

  /**
   * Get the parameters of the posterior
   */
  getParameters(): { shape: number; rate: number; scale: number } {
    return {
      shape: this.shape,
      rate: this.rate,
      scale: 1 / this.rate,
    };
  }

  /**
   * Mode of the Gamma distribution (for shape > 1)
   */
  mode(): number {
    if (this.shape >= 1) {
      return (this.shape - 1) / this.rate;
    }
    return 0; // Mode at 0 for shape < 1
  }

  /**
   * Probability that the parameter is greater than a threshold
   */
  probabilityGreaterThan(threshold: number): number {
    if (threshold < 0) return 1;
    const scale = 1 / this.rate;
    return 1 - jStat.gamma.cdf(threshold, this.shape, scale);
  }

  /**
   * Returns true since this posterior has analytical forms for mean, variance, credible intervals
   */
  hasAnalyticalForm(): boolean {
    return true;
  }
}

/**
 * Gamma-Exponential conjugate inference engine
 *
 * This implements exact Bayesian inference for exponentially distributed data
 * with a Gamma prior on the rate parameter.
 *
 * Model: X ~ Exponential(λ), λ ~ Gamma(α, β)
 * Posterior: λ | X ~ Gamma(α + n, β + Σx)
 *
 * Also supports:
 * - Gamma-Poisson (with sufficient statistics)
 * - General positive continuous data with Gamma prior
 */
export class GammaExponentialConjugate extends InferenceEngine {
  /**
   * Declare capabilities for routing
   */
  readonly capabilities: EngineCapabilities = {
    structures: ['simple'] as ModelStructure[],
    types: ['gamma'] as ModelType[],
    dataTypes: ['user-level'] as DataType[],
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
    super('Gamma-Exponential Conjugate');
  }

  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const start = performance.now();

    // Validate data
    this.validateStandardData(data);

    // Additional validation for user-level data
    if (data.type !== 'user-level') {
      throw new TycheError(ErrorCode.INVALID_DATA, 'GammaExponential requires user-level data', {
        actualType: data.type,
      });
    }

    if (!data.userLevel) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'User-level data structure is missing');
    }

    const values = data.userLevel.users.map((u) => u.value);

    // Check all values are positive
    if (values.some((x) => x <= 0)) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Gamma conjugate requires all positive values', {
        minValue: Math.min(...values),
      });
    }

    const n = values.length;
    const sumX = values.reduce((a, b) => a + b, 0);

    // Get prior parameters (default to weakly informative)
    let priorShape = 1; // α
    let priorRate = 0.1; // β (small rate = weak prior)

    if (options?.prior) {
      if (!(options.prior instanceof GammaDistribution)) {
        throw new TycheError(
          ErrorCode.INVALID_PRIOR,
          'GammaExponential requires Gamma distribution prior',
          { actualType: options.prior.constructor.name }
        );
      }

      const params = options.prior.getParameters();
      priorShape = params.shape;
      priorRate = options.prior.rate();
    }

    // Conjugate update
    const posteriorShape = priorShape + n;
    const posteriorRate = priorRate + sumX;

    // Create posterior
    const posterior = new GammaPosterior(posteriorShape, posteriorRate);

    const runtime = performance.now() - start;

    // Return result with diagnostics
    return {
      posterior,
      diagnostics: {
        converged: true, // Always converges (exact inference)
        iterations: 1, // Single update
        runtime,
        modelType: 'gamma',
        parameterCount: 2, // shape and rate
      },
    };
  }

  getDescription(): string {
    return 'Exact Bayesian inference for positive continuous data using Gamma conjugacy';
  }

  /**
   * Helper to compute summary statistics from array
   */
  static arrayToSummary(data: number[]): { n: number; sum: number; mean: number } {
    const n = data.length;
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    return { n, sum, mean };
  }
}
