/**
 * Normal Bayesian inference using Normal-Inverse-Gamma conjugate
 * For continuous data with unknown mean and variance
 * 
 * Parallel to LogNormalBayesian for consistency
 * 
 * Model: X ~ N(μ, σ²)
 * Prior: (μ, σ²) ~ Normal-Inverse-Gamma(μ₀, λ, α, β)
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

/**
 * Normal sufficient statistics
 */
export interface NormalSufficientStats {
  n: number;           // Effective sample size
  sum: number;         // Σ w_i * x_i
  sumSq: number;       // Σ w_i * x_i²
  mean: number;        // Weighted mean of values
}

/**
 * Normal posterior distribution with uncertainty
 */
export class NormalPosterior implements Posterior {
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
    
    // 3. Sample from Normal(μ, σ²) - no exp() transform!
    const z = jStat.normal.sample(0, 1);
    return [mu + Math.sqrt(sigma2) * z];
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
}

/**
 * Normal Bayesian inference with conjugate priors
 * 
 * Model: X ~ N(μ, σ²)
 * Prior: (μ, σ²) ~ Normal-Inverse-Gamma(μ₀, λ, α, β)
 * 
 * This provides full posterior distributions over parameters,
 * not just point estimates.
 */
export class NormalBayesian extends InferenceEngine {
  constructor() {
    super('Normal Bayesian');
  }
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    this.validateInput(data);
    
    if (!Array.isArray(data.data)) {
      throw new Error('Normal inference requires array data');
    }
    
    const values = data.data;
    const n = values.length;
    
    // Get prior parameters (with sensible defaults)
    const prior = this.getPriorParams(options, values);
    
    // Sufficient statistics (no log transform!)
    const sumX = values.reduce((a, b) => a + b, 0);
    const sumX2 = values.reduce((a, b) => a + b * b, 0);
    const xBar = sumX / n;
    
    // Conjugate update for Normal-Inverse-Gamma (same as LogNormal)
    const posteriorLambda = prior.lambda + n;
    const posteriorMu0 = (prior.lambda * prior.mu0 + n * xBar) / posteriorLambda;
    const posteriorAlpha = prior.alpha + n / 2;
    
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
      posterior: new NormalPosterior(posteriorParams, n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime: 0
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
      throw new Error('Normal inference requires array data');
    }
    const values = data.data;
    if (values.length !== weights.length) {
      throw new Error('Data and weights must have same length');
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
    stats: NormalSufficientStats,
    options?: FitOptions
  ): Promise<InferenceResult> {
    // Get prior parameters
    const prior = this.getPriorParams(options, null); // null since we don't have raw data
    // Conjugate update for Normal-Inverse-Gamma
    const posteriorLambda = prior.lambda + stats.n;
    const posteriorMu0 = (prior.lambda * prior.mu0 + stats.n * stats.mean) / posteriorLambda;
    const posteriorAlpha = prior.alpha + stats.n / 2;
    // Update for beta
    const priorSS = prior.beta;
    const dataSS = stats.sumSq - stats.n * stats.mean * stats.mean;
    const shrinkageSS = (prior.lambda * stats.n / posteriorLambda) * Math.pow(stats.mean - prior.mu0, 2);
    const posteriorBeta = priorSS + 0.5 * dataSS + 0.5 * shrinkageSS;
    const posteriorParams: NormalInverseGammaParams = {
      mu0: posteriorMu0,
      lambda: posteriorLambda,
      alpha: posteriorAlpha,
      beta: posteriorBeta
    };
    return {
      posterior: new NormalPosterior(posteriorParams, stats.n),
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime: 0
      }
    };
  }
  
  /**
   * Compute weighted sufficient statistics
   */
  computeWeightedStats(values: number[], weights: number[]): NormalSufficientStats {
    const n = weights.reduce((sum, w) => sum + w, 0);
    if (n <= 0) {
      throw new Error('Sum of weights must be positive');
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
      mean
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
      const empiricalMean = data.reduce((a, b) => a + b, 0) / data.length;
      const empiricalVar = data.reduce(
        (sum, x) => sum + Math.pow(x - empiricalMean, 2), 0
      ) / data.length;
      return {
        mu0: empiricalMean,
        lambda: 1,
        alpha: 2,
        beta: empiricalVar * 2
      };
    }
    // Default weakly informative prior
    return {
      mu0: 0,      // Center at 0
      lambda: 1,   // Weak confidence
      alpha: 2,    // Minimum for finite variance
      beta: 2      // Moderate scale
    };
  }
  
  canHandle(data: DataInput): boolean {
    return Array.isArray(data.data) && data.data.length > 0;
  }
  
  getDescription(): string {
    return 'Bayesian inference for Normal using Normal-Inverse-Gamma conjugate prior';
  }
}

// For backward compatibility, keep the old name but use Bayesian version
export const NormalNormalConjugate = NormalBayesian;