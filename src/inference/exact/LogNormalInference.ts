/**
 * LogNormal Bayesian inference using conjugate updates
 * For heavy-tailed positive data (e.g., revenue)
 * 
 * Uses Normal-Inverse-Gamma conjugate prior for full Bayesian inference
 */

import jStat from 'jstat';
import { InferenceEngine } from '../base/InferenceEngine';
import { 
  DataInput, 
  FitOptions, 
  InferenceResult, 
  Posterior
} from '../base/types';

/**
 * Parameters for Normal-Inverse-Gamma distribution
 * This is the conjugate prior for Normal with unknown mean and variance
 */
interface NormalInverseGammaParams {
  mu0: number;      // Prior mean of μ
  lambda: number;   // Prior precision (confidence in mu0)
  alpha: number;    // Shape parameter for variance
  beta: number;     // Scale parameter for variance
}

export interface LogNormalSufficientStats {
    n: number;           // Effective sample size
    sumLog: number;      // Σ w_i * log(x_i)
    sumLogSq: number;    // Σ w_i * log(x_i)²
    meanLog: number;     // Weighted mean of log values
  }


/**
 * LogNormal posterior distribution with uncertainty
 */
export class LogNormalPosterior implements Posterior {
  private _mcSamples?: number[];
  private readonly MC_SAMPLES = 10000;
  constructor(
    private readonly params: NormalInverseGammaParams,
    private readonly sampleSize: number
  ) {
    if (params.lambda <= 0 || params.alpha <= 0 || params.beta <= 0) {
      throw new Error('Invalid posterior parameters');
    }
  }

  private getMCSamples(): number[] {
    if (!this._mcSamples) {
      this._mcSamples = [];
      for (let i = 0; i < this.MC_SAMPLES; i++) {
        this._mcSamples.push(this.sample()[0]);
      }
      this._mcSamples.sort((a, b) => a - b);
    }
    return this._mcSamples;
  }

  mean(): number[] {
    const samples = this.getMCSamples();
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return [mean];
  }

  variance(): number[] {
    const samples = this.getMCSamples();
    const mean = this.mean()[0];
    const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (samples.length - 1);
    return [variance];
  }

  median(): number {
    const samples = this.getMCSamples();
    return samples[Math.floor(samples.length / 2)];
  }

  quantile(q: number): number {
    const samples = this.getMCSamples();
    return samples[Math.floor(q * samples.length)];
  }

  credibleInterval(level: number = 0.8): Array<[number, number]> {
    const samples = this.getMCSamples();
    const alpha = (1 - level) / 2;
    const lowerIdx = Math.floor(alpha * samples.length);
    const upperIdx = Math.floor((1 - alpha) * samples.length);
    return [[samples[lowerIdx], samples[upperIdx]]];
  }
  
  sample(): number[] {
    // Sample from posterior predictive distribution
    // 1. Sample σ² from Inverse-Gamma(α, β)
    const sigma2 = this.sampleInverseGamma(this.params.alpha, this.params.beta);
    
    // 2. Sample μ from Normal(μ₀, σ²/λ)
    const mu = jStat.normal.sample(
      this.params.mu0, 
      Math.sqrt(sigma2 / this.params.lambda)
    );
    
    // 3. Sample from LogNormal(μ, σ²)
    const z = jStat.normal.sample(0, 1);
    return [Math.exp(mu + Math.sqrt(sigma2) * z)];
  }
  
  private sampleInverseGamma(alpha: number, beta: number): number {
    // Sample from Gamma and take reciprocal
    const gammaShape = alpha;
    const gammaScale = 1 / beta;
    const gammaSample = jStat.gamma.sample(gammaShape, gammaScale);
    return 1 / gammaSample;
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
      posteriorMeanSigma2: this.params.beta / (this.params.alpha - 1)
    };
  }
  
  // The following methods are now redundant as they rely on MC samples
  // and are handled by getMCSamples()
  // median(): number {
  //   // Median = exp(μ), and μ has posterior mean μ₀
  //   return Math.exp(this.params.mu0);
  // }

  // credibleInterval(level: number = 0.95): Array<[number, number]> {
  //   // Use posterior predictive sampling
  //   const samples: number[] = [];
  //   for (let i = 0; i < 10000; i++) {
  //     samples.push(this.sample()[0]);
  //   }
    
  //   samples.sort((a, b) => a - b);
  //   const alpha = (1 - level) / 2;
  //   const lowerIdx = Math.floor(alpha * samples.length);
  //   const upperIdx = Math.floor((1 - alpha) * samples.length);
    
  //   return [[samples[lowerIdx], samples[upperIdx]]];
  // }
}

/**
 * LogNormal Bayesian inference with conjugate priors
 * 
 * Model: log(X) ~ N(μ, σ²)
 * Prior: (μ, σ²) ~ Normal-Inverse-Gamma(μ₀, λ, α, β)
 * 
 * This provides full posterior distributions over parameters,
 * not just point estimates.
 */
export class LogNormalBayesian extends InferenceEngine {
  constructor() {
    super('LogNormal Bayesian');
  }
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    this.validateInput(data);
    
    if (!Array.isArray(data.data)) {
      throw new Error('LogNormal inference requires array data');
    }
    
    const values = data.data;
    
    // Check all values are positive
    if (values.some(x => x <= 0)) {
      throw new Error('LogNormal requires all positive values');
    }
    
    // Transform to log scale
    const logValues = values.map(x => Math.log(x));
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
    const shrinkageSS = (prior.lambda * n / posteriorLambda) * 
      Math.pow(xBar - prior.mu0, 2);
    
    const posteriorBeta = priorSS + 0.5 * dataSS + 0.5 * shrinkageSS;
    
    const posteriorParams: NormalInverseGammaParams = {
      mu0: posteriorMu0,
      lambda: posteriorLambda,
      alpha: posteriorAlpha,
      beta: posteriorBeta
    };
    
    return {
      posterior: new LogNormalPosterior(posteriorParams, n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime: 0,
        modelType: 'lognormal'
      }
    };
  }
  
  // --- Weighted and Sufficient Statistics Inference Extensions ---

  /**
   * Fit model using weighted data
   */
  async fitWeighted(
    data: DataInput,
    weights: number[],
    options?: FitOptions
  ): Promise<InferenceResult> {
    this.validateInput(data);
    if (!Array.isArray(data.data)) {
      throw new Error('LogNormal inference requires array data');
    }
    const values = data.data;
    if (values.length !== weights.length) {
      throw new Error('Data and weights must have same length');
    }
    if (values.some(x => x <= 0)) {
      throw new Error('LogNormal requires all positive values');
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
    // Get prior parameters
    const prior = this.getPriorParams(options, null); // null since we don't have raw data
    // Conjugate update for Normal-Inverse-Gamma
    const posteriorLambda = prior.lambda + stats.n;
    const posteriorMu0 = (prior.lambda * prior.mu0 + stats.n * stats.meanLog) / posteriorLambda;
    const posteriorAlpha = prior.alpha + stats.n / 2;
    // Update for beta
    const priorSS = prior.beta;
    const dataSS = stats.sumLogSq - stats.n * stats.meanLog * stats.meanLog;
    const shrinkageSS = (prior.lambda * stats.n / posteriorLambda) * Math.pow(stats.meanLog - prior.mu0, 2);
    const posteriorBeta = priorSS + 0.5 * dataSS + 0.5 * shrinkageSS;
    const posteriorParams: NormalInverseGammaParams = {
      mu0: posteriorMu0,
      lambda: posteriorLambda,
      alpha: posteriorAlpha,
      beta: posteriorBeta
    };
    return {
      posterior: new LogNormalPosterior(posteriorParams, stats.n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime: 0,
        modelType: 'lognormal'
      }
    };
  }

  /**
   * Compute weighted sufficient statistics
   */
  computeWeightedStats(values: number[], weights: number[]): LogNormalSufficientStats {
    const n = weights.reduce((sum, w) => sum + w, 0);
    if (n <= 0) {
      throw new Error('Sum of weights must be positive');
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
      meanLog
    };
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
        throw new Error('Normal-Inverse-Gamma prior needs 4 parameters');
      }
      return {
        mu0: params[0],
        lambda: params[1],
        alpha: params[2],
        beta: params[3]
      };
    }
    // If we have data, use empirical estimates
    if (data && data.length > 0) {
      const logData = data.map(x => Math.log(x));
      const empiricalMean = logData.reduce((a, b) => a + b, 0) / logData.length;
      const empiricalVar = logData.reduce(
        (sum, x) => sum + Math.pow(x - empiricalMean, 2), 0
      ) / logData.length;
      return {
        mu0: empiricalMean,
        lambda: 1,
        alpha: 2,
        beta: empiricalVar * 2
      };
    }
    // Default weakly informative prior
    return {
      mu0: 0,      // log(1) = 0, so centered at 1 on original scale
      lambda: 1,   // Weak confidence
      alpha: 2,    // Minimum for finite variance
      beta: 2      // Moderate scale
    };
  }
  
  canHandle(data: DataInput): boolean {
    return Array.isArray(data.data) && 
           data.data.length > 0 && 
           data.data.every(x => x > 0);
  }
  
  getDescription(): string {
    return 'Bayesian inference for LogNormal using Normal-Inverse-Gamma conjugate prior';
  }
}

/**
 * Helper to detect if data might be better modeled as LogNormal
 */
export function isLikelyLogNormal(data: number[]): boolean {
  if (data.length < 10) return false;
  
  // Check for positive skew and heavy tail
  const mean = jStat.mean(data);
  const median = jStat.median(data);
  const std = jStat.stdev(data, true);
  const cv = std / mean;
  
  // LogNormal indicators:
  // 1. Mean > Median (right skew)
  // 2. High coefficient of variation
  // 3. All positive values
  return mean > median * 1.1 && cv > 0.5 && data.every(x => x > 0);
}

// For backward compatibility, keep the old name but use Bayesian version
export const LogNormalInference = LogNormalBayesian;