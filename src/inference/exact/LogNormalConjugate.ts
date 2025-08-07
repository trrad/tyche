/**
 * LogNormal conjugate inference using Normal-Inverse-Gamma prior
 * For heavy-tailed positive data (e.g., revenue)
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
import { LogNormalDistribution } from '../../core/distributions/LogNormalDistribution';
import { NormalDistribution } from '../../core/distributions/NormalDistribution';
import { GammaDistribution } from '../../core/distributions/GammaDistribution';

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

export interface LogNormalSufficientStats {
  n: number; // Effective sample size
  sumLog: number; // Σ w_i * log(x_i)
  sumLogSq: number; // Σ w_i * log(x_i)²
  meanLog: number; // Weighted mean of log values
}

/**
 * LogNormal posterior distribution with uncertainty
 * Implements the Posterior interface with analytical capabilities
 */
export class LogNormalPosterior implements Posterior {
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

      // 3. Sample from LogNormal(μ, σ²)
      const logNormal = new LogNormalDistribution(mu, Math.sqrt(sigma2));
      samples.push(logNormal.sample(1)[0]);
    }

    return samples;
  }

  /**
   * Get the posterior mean using Monte Carlo estimation
   */
  mean(): number[] {
    const samples = this.getMCSamples();
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return [mean];
  }

  /**
   * Get the posterior variance using Monte Carlo estimation
   */
  variance(): number[] {
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
    if (data <= 0) {
      return -Infinity;
    }

    const logData = Math.log(data);
    const mu = this.params.mu0;
    const sigma2 = this.params.beta / (this.params.alpha - 1);
    const sigma = Math.sqrt(sigma2);

    // LogNormal PDF in log space
    const z = (logData - mu) / sigma;
    return -logData - 0.5 * Math.log(2 * Math.PI) - Math.log(sigma) - 0.5 * z * z;
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
 * LogNormal conjugate inference with Normal-Inverse-Gamma prior
 *
 * Model: log(X) ~ N(μ, σ²)
 * Prior: (μ, σ²) ~ Normal-Inverse-Gamma(μ₀, λ, α, β)
 *
 * This provides full posterior distributions over parameters,
 * not just point estimates.
 */
export class LogNormalConjugate extends InferenceEngine {
  /**
   * Declare capabilities for routing
   */
  readonly capabilities: EngineCapabilities = {
    structures: ['simple', 'compound'] as ModelStructure[],
    types: ['lognormal'] as ModelType[],
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
    super('LogNormal Conjugate');
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
      // Extract positive values from user-level data
      values = data.userLevel.users.map((u) => u.value).filter((v) => v > 0);

      if (values.length === 0) {
        throw new TycheError(
          ErrorCode.INSUFFICIENT_DATA,
          'No positive values found in user-level data'
        );
      }
    } else {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'LogNormalConjugate requires user-level data with positive values',
        { actualType: data.type }
      );
    }

    // Transform to log scale
    const logValues = values.map((x) => Math.log(x));
    const n = logValues.length;

    // Get prior parameters (with sensible defaults)
    const prior = this.getPriorParams(options, values);

    // Sufficient statistics
    const sumX = logValues.reduce((a, b) => a + b, 0);
    const sumX2 = logValues.reduce((a, b) => a + b * b, 0);
    const xBar = sumX / n;

    // Conjugate update for Normal-Inverse-Gamma
    // See Murphy (2007) or Gelman et al. (2013) for derivation
    const posteriorLambda = prior.lambda + n;
    const posteriorMu0 = (prior.lambda * prior.mu0 + n * xBar) / posteriorLambda;
    const posteriorAlpha = prior.alpha + n / 2;

    // Update for beta is more complex
    const priorSS = prior.beta;
    const dataSS = sumX2 - n * xBar * xBar;
    const shrinkageSS = ((prior.lambda * n) / posteriorLambda) * Math.pow(xBar - prior.mu0, 2);

    const posteriorBeta = priorSS + 0.5 * dataSS + 0.5 * shrinkageSS;

    const posteriorParams: NormalInverseGammaParams = {
      mu0: posteriorMu0,
      lambda: posteriorLambda,
      alpha: posteriorAlpha,
      beta: posteriorBeta,
    };

    const runtime = performance.now() - start;

    return {
      posterior: new LogNormalPosterior(posteriorParams, n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime,
        modelType: 'lognormal',
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
      values = data.userLevel.users.map((u) => u.value).filter((v) => v > 0);
    } else {
      throw new TycheError(ErrorCode.INVALID_DATA, 'LogNormalConjugate requires user-level data');
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
  async fitFromStats(
    stats: LogNormalSufficientStats,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const start = performance.now();

    // Get prior parameters
    const prior = this.getPriorParams(options, null);

    // Conjugate update for Normal-Inverse-Gamma
    const posteriorLambda = prior.lambda + stats.n;
    const posteriorMu0 = (prior.lambda * prior.mu0 + stats.n * stats.meanLog) / posteriorLambda;
    const posteriorAlpha = prior.alpha + stats.n / 2;

    // Update for beta
    const priorSS = prior.beta;
    const dataSS = stats.sumLogSq - stats.n * stats.meanLog * stats.meanLog;
    const shrinkageSS =
      ((prior.lambda * stats.n) / posteriorLambda) * Math.pow(stats.meanLog - prior.mu0, 2);

    const posteriorBeta = priorSS + 0.5 * dataSS + 0.5 * shrinkageSS;

    const posteriorParams: NormalInverseGammaParams = {
      mu0: posteriorMu0,
      lambda: posteriorLambda,
      alpha: posteriorAlpha,
      beta: posteriorBeta,
    };

    const runtime = performance.now() - start;

    return {
      posterior: new LogNormalPosterior(posteriorParams, stats.n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime,
        modelType: 'lognormal',
      },
    };
  }

  /**
   * Compute weighted sufficient statistics
   */
  computeWeightedStats(values: number[], weights: number[]): LogNormalSufficientStats {
    const n = weights.reduce((sum, w) => sum + w, 0);
    if (n <= 0) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Sum of weights must be positive');
    }

    let sumLog = 0;
    let sumLogSq = 0;

    for (let i = 0; i < values.length; i++) {
      const logX = Math.log(values[i]);
      const w = weights[i];
      sumLog += w * logX;
      sumLogSq += w * logX * logX;
    }

    const meanLog = sumLog / n;

    return {
      n,
      sumLog,
      sumLogSq,
      meanLog,
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
    if (config.structure === 'simple' && config.type !== 'lognormal') {
      return false;
    }

    // For compound models, check value type
    if (config.structure === 'compound' && config.valueType !== 'lognormal') {
      return false;
    }

    // Must have user-level data with positive values
    if (data.type !== 'user-level' || !data.userLevel) {
      return false;
    }

    // Check for positive values
    const hasPositiveValues = data.userLevel.users.some((u) => u.value > 0);
    return hasPositiveValues;
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
      const logData = data.map((x) => Math.log(x));
      const empiricalMean = logData.reduce((a, b) => a + b, 0) / logData.length;
      const empiricalVar =
        logData.reduce((sum, x) => sum + Math.pow(x - empiricalMean, 2), 0) / logData.length;

      return {
        mu0: empiricalMean,
        lambda: 1,
        alpha: 2,
        beta: empiricalVar * 2,
      };
    }

    // Default weakly informative prior
    return {
      mu0: 0, // log(1) = 0, so centered at 1 on original scale
      lambda: 1, // Weak confidence
      alpha: 2, // Minimum for finite variance
      beta: 2, // Moderate scale
    };
  }
}

/**
 * Helper to detect if data might be better modeled as LogNormal
 */
export function isLikelyLogNormal(data: number[]): boolean {
  if (data.length < 10) return false;

  // Check for positive skew and heavy tail
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const sortedData = [...data].sort((a, b) => a - b);
  const median = sortedData[Math.floor(data.length / 2)];
  const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
  const std = Math.sqrt(variance);
  const cv = std / mean;

  // LogNormal indicators:
  // 1. Mean > Median (right skew)
  // 2. High coefficient of variation
  // 3. All positive values
  return mean > median * 1.1 && cv > 0.5 && data.every((x) => x > 0);
}

// For backward compatibility
export const LogNormalBayesian = LogNormalConjugate;
export const LogNormalInference = LogNormalConjugate;
