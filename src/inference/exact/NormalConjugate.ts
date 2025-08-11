/**
 * Normal conjugate inference using Normal-Inverse-Gamma prior
 * For continuous data with unknown mean and variance
 *
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
import { NormalDistribution } from '../../core/distributions/NormalDistribution';
import { GammaDistribution } from '../../core/distributions/GammaDistribution';
import { logGamma, digamma } from '../../core/utils/math/special';

/**
 * Parameters for Normal-Inverse-Gamma distribution
 * This is the conjugate prior for Normal with unknown mean and variance
 */
interface NormalInverseGammaParams {
  mu0: number; // Prior mean of μ
  lambda: number; // Prior precision (confidence in mu0)
  alpha: number; // Shape parameter for variance
  beta: number; // Scale parameter for variance
}

/**
 * Normal sufficient statistics
 */
export interface NormalSufficientStats {
  n: number; // Effective sample size
  sum: number; // Σ w_i * x_i
  sumSq: number; // Σ w_i * x_i²
  mean: number; // Weighted mean of values
}

/**
 * Normal posterior distribution with uncertainty
 * Implements the Posterior interface with analytical capabilities
 */
export class NormalPosterior implements Posterior {
  private _mcSamples?: number[];
  private readonly MC_SAMPLES = 10000;

  constructor(
    private readonly params: NormalInverseGammaParams,
    private readonly sampleSize: number
  ) {
    if (params.lambda <= 0 || params.alpha <= 0 || params.beta <= 0) {
      throw new TycheError(
        ErrorCode.INVALID_PRIOR,
        'Invalid posterior parameters: lambda, alpha, and beta must be positive'
      );
    }
  }

  /**
   * Sample from the posterior predictive distribution
   */
  sample(n: number = 1): number[] {
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      // Sample from posterior predictive distribution
      // 1. Sample σ² from Inverse-Gamma(α, β)
      const sigma2 = this.sampleInverseGamma(this.params.alpha, this.params.beta);

      // 2. Sample μ from Normal(μ₀, σ²/λ)
      const muDist = new NormalDistribution(
        this.params.mu0,
        Math.sqrt(sigma2 / this.params.lambda)
      );
      const mu = muDist.sample(1)[0];

      // 3. Sample from Normal(μ, σ²)
      const normal = new NormalDistribution(mu, Math.sqrt(sigma2));
      samples.push(normal.sample(1)[0]);
    }
    return samples;
  }

  /**
   * Get the posterior mean using Monte Carlo estimation
   */
  mean(): number[] {
    // For Normal posterior, the mean is just mu0
    return [this.params.mu0];
  }

  /**
   * Get the posterior variance using Monte Carlo estimation
   */
  variance(): number[] {
    // For Normal posterior predictive, need to account for both parameter uncertainty
    const samples = this.getMCSamples();
    const mean = this.mean()[0];
    const variance =
      samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (samples.length - 1);
    return [variance];
  }

  /**
   * Get credible interval using percentiles
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    const samples = this.getMCSamples();
    const alpha = (1 - level) / 2;
    const lowerIdx = Math.floor(alpha * samples.length);
    const upperIdx = Math.floor((1 - alpha) * samples.length);
    return [[samples[lowerIdx], samples[upperIdx]]];
  }

  /**
   * Log probability density function for data
   * Using the posterior predictive distribution
   */
  logPdf(data: number): number {
    const mu = this.params.mu0;
    const sigma2 = this.params.beta / (this.params.alpha - 1);
    const sigma = Math.sqrt(sigma2);

    // Normal PDF in log space
    const z = (data - mu) / sigma;
    return -0.5 * Math.log(2 * Math.PI) - Math.log(sigma) - 0.5 * z * z;
  }

  /**
   * Batch log PDF computation
   */
  logPdfBatch(data: number[]): number[] {
    return data.map((d) => this.logPdf(d));
  }

  /**
   * This posterior has analytical form for some operations
   */
  hasAnalyticalForm(): boolean {
    return true; // We have analytical logPdf
  }

  /**
   * Get median using Monte Carlo samples
   */
  median(): number {
    const samples = this.getMCSamples();
    return samples[Math.floor(samples.length / 2)];
  }

  /**
   * Get quantile using Monte Carlo samples
   */
  quantile(q: number): number {
    const samples = this.getMCSamples();
    return samples[Math.floor(q * samples.length)];
  }

  /**
   * Get posterior parameters
   */
  getParameters(): NormalInverseGammaParams & {
    posteriorMeanMu: number;
    posteriorMeanSigma2: number;
  } {
    return {
      ...this.params,
      posteriorMeanMu: this.params.mu0,
      posteriorMeanSigma2: this.params.beta / (this.params.alpha - 1),
    };
  }

  /**
   * Compute KL divergence from a prior Normal-Inverse-Gamma distribution
   * KL(q||p) where q is this posterior and p is the prior
   *
   * Formula for KL(NIG(μ₁,λ₁,α₁,β₁) || NIG(μ₀,λ₀,α₀,β₀)):
   * = (α₁ - α₀)ψ(α₁) - log Γ(α₁) + log Γ(α₀)
   *   + α₀(log β₁ - log β₀) + α₁(β₀/β₁ - 1)
   *   + λ₁(μ₁ - μ₀)²/(2β₁) + 1/2(log λ₀ - log λ₁)
   *   + (λ₀/λ₁ - 1)/2
   */
  klDivergenceFromPrior(prior: NormalInverseGammaParams): number {
    const q = this.params; // Posterior (this)
    const p = prior; // Prior

    // KL divergence components
    let kl = 0;

    // Shape parameter terms (alpha)
    kl += (q.alpha - p.alpha) * digamma(q.alpha);
    kl -= logGamma(q.alpha);
    kl += logGamma(p.alpha);

    // Scale parameter terms (beta)
    kl += p.alpha * (Math.log(q.beta) - Math.log(p.beta));
    kl += q.alpha * (p.beta / q.beta - 1);

    // Location parameter terms (mu, lambda)
    kl += (q.lambda * Math.pow(q.mu0 - p.mu0, 2)) / (2 * q.beta);
    kl += 0.5 * (Math.log(p.lambda) - Math.log(q.lambda));
    kl += (p.lambda / q.lambda - 1) / 2;

    return kl;
  }

  private getMCSamples(): number[] {
    if (!this._mcSamples) {
      this._mcSamples = this.sample(this.MC_SAMPLES);
      this._mcSamples.sort((a, b) => a - b);
    }
    return this._mcSamples;
  }

  private sampleInverseGamma(alpha: number, beta: number): number {
    // Sample from Gamma and take reciprocal
    const gamma = new GammaDistribution(alpha, 1 / beta);
    return 1 / gamma.sample(1)[0];
  }
}

/**
 * Normal conjugate inference with Normal-Inverse-Gamma prior
 *
 * Model: X ~ N(μ, σ²)
 * Prior: (μ, σ²) ~ Normal-Inverse-Gamma(μ₀, λ, α, β)
 *
 * This provides full posterior distributions over parameters,
 * not just point estimates.
 */
export class NormalConjugate extends InferenceEngine {
  /**
   * Declare capabilities for routing
   */
  readonly capabilities: EngineCapabilities = {
    structures: ['simple'] as ModelStructure[],
    types: ['normal'] as ModelType[],
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
    super('Normal Conjugate');
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

    // Extract values based on data type
    let values: number[];

    if (data.type === 'user-level' && data.userLevel) {
      // Extract all values from user-level data
      values = data.userLevel.users.map((u) => u.value);

      if (values.length === 0) {
        throw new TycheError(ErrorCode.INSUFFICIENT_DATA, 'No values found in user-level data');
      }
    } else {
      throw new TycheError(ErrorCode.INVALID_DATA, 'NormalConjugate requires user-level data', {
        actualType: data.type,
      });
    }

    const n = values.length;

    // Get prior parameters (with sensible defaults)
    const prior = this.getPriorParams(options, values);

    // Sufficient statistics (no log transform!)
    const sumX = values.reduce((a, b) => a + b, 0);
    const sumX2 = values.reduce((a, b) => a + b * b, 0);
    const xBar = sumX / n;

    // Conjugate update for Normal-Inverse-Gamma
    const posteriorLambda = prior.lambda + n;
    const posteriorMu0 = (prior.lambda * prior.mu0 + n * xBar) / posteriorLambda;
    const posteriorAlpha = prior.alpha + n / 2;

    const priorSS = prior.beta;
    const dataSS = Math.max(0, sumX2 - n * xBar * xBar); // Ensure non-negative (handles numerical errors)
    const shrinkageSS = ((prior.lambda * n) / posteriorLambda) * Math.pow(xBar - prior.mu0, 2);

    const posteriorBeta = Math.max(1e-10, priorSS + 0.5 * dataSS + 0.5 * shrinkageSS); // Ensure positive

    const posteriorParams: NormalInverseGammaParams = {
      mu0: posteriorMu0,
      lambda: posteriorLambda,
      alpha: posteriorAlpha,
      beta: posteriorBeta,
    };

    const runtime = performance.now() - start;

    return {
      posterior: new NormalPosterior(posteriorParams, n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime,
        modelType: 'normal',
      },
    };
  }

  /**
   * Fit model using weighted data
   */
  async fitWeighted(
    data: StandardData,
    weights: number[],
    options?: FitOptions
  ): Promise<InferenceResult> {
    this.validateStandardData(data);

    let values: number[];
    if (data.type === 'user-level' && data.userLevel) {
      values = data.userLevel.users.map((u) => u.value);
    } else {
      throw new TycheError(ErrorCode.INVALID_DATA, 'NormalConjugate requires user-level data');
    }

    if (values.length !== weights.length) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Data and weights must have same length');
    }

    // Compute weighted sufficient statistics
    const stats = this.computeWeightedStats(values, weights);

    // Fit from statistics
    return this.fitFromStats(stats, options);
  }

  /**
   * Fit model from sufficient statistics
   */
  async fitFromStats(stats: NormalSufficientStats, options?: FitOptions): Promise<InferenceResult> {
    const start = performance.now();

    // Get prior parameters
    const prior = this.getPriorParams(options, null);

    // Conjugate update for Normal-Inverse-Gamma
    const posteriorLambda = prior.lambda + stats.n;
    const posteriorMu0 = (prior.lambda * prior.mu0 + stats.n * stats.mean) / posteriorLambda;
    const posteriorAlpha = prior.alpha + stats.n / 2;

    // Update for beta
    const priorSS = prior.beta;
    const dataSS = Math.max(0, stats.sumSq - stats.n * stats.mean * stats.mean); // Ensure non-negative
    const shrinkageSS =
      ((prior.lambda * stats.n) / posteriorLambda) * Math.pow(stats.mean - prior.mu0, 2);

    const posteriorBeta = Math.max(1e-10, priorSS + 0.5 * dataSS + 0.5 * shrinkageSS); // Ensure positive

    const posteriorParams: NormalInverseGammaParams = {
      mu0: posteriorMu0,
      lambda: posteriorLambda,
      alpha: posteriorAlpha,
      beta: posteriorBeta,
    };

    const runtime = performance.now() - start;

    return {
      posterior: new NormalPosterior(posteriorParams, stats.n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime,
        modelType: 'normal',
      },
    };
  }

  /**
   * Compute weighted sufficient statistics
   */
  computeWeightedStats(values: number[], weights: number[]): NormalSufficientStats {
    const n = weights.reduce((sum, w) => sum + w, 0);
    if (n <= 0) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Sum of weights must be positive');
    }

    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < values.length; i++) {
      const x = values[i];
      const w = weights[i];
      sum += w * x;
      sumSq += w * x * x;
    }

    const mean = sum / n;

    return {
      n,
      sum,
      sumSq,
      mean,
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

    // For simple models
    if (config.structure === 'simple' && config.type !== 'normal') {
      return false;
    }

    // Must have user-level data
    if (data.type !== 'user-level' || !data.userLevel) {
      return false;
    }

    return true;
  }

  /**
   * Get prior parameters with adjustment for no raw data
   */
  private getPriorParams(
    options: FitOptions | undefined,
    data: number[] | null
  ): NormalInverseGammaParams {
    // If prior specified, use it
    if (options?.priorParams?.type === 'normal-inverse-gamma') {
      const params = options.priorParams.params;
      if (params.length !== 4) {
        throw new TycheError(
          ErrorCode.INVALID_PRIOR,
          'Normal-Inverse-Gamma prior needs 4 parameters'
        );
      }
      return {
        mu0: params[0],
        lambda: params[1],
        alpha: params[2],
        beta: params[3],
      };
    }

    // If we have data, use empirical estimates
    if (data && data.length > 0) {
      const empiricalMean = data.reduce((a, b) => a + b, 0) / data.length;
      const empiricalVar =
        data.reduce((sum, x) => sum + Math.pow(x - empiricalMean, 2), 0) / data.length;

      return {
        mu0: empiricalMean,
        lambda: 1,
        alpha: 2,
        beta: empiricalVar * 2,
      };
    }

    // Default weakly informative prior
    return {
      mu0: 0, // Center at 0
      lambda: 1, // Weak confidence
      alpha: 2, // Minimum for finite variance
      beta: 2, // Moderate scale
    };
  }
}

// For backward compatibility
export const NormalBayesian = NormalConjugate;
export const NormalNormalConjugate = NormalConjugate;
