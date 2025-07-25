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

/**
 * LogNormal posterior distribution with uncertainty
 */
export class LogNormalPosterior implements Posterior {
  constructor(
    private readonly params: NormalInverseGammaParams,
    private readonly sampleSize: number
  ) {
    if (params.lambda <= 0 || params.alpha <= 0 || params.beta <= 0) {
      throw new Error('Invalid posterior parameters');
    }
  }
  
  mean(): number[] {
    // For LogNormal, we need to account for both parameter uncertainty
    // E[X] ≈ exp(μ + σ²/2), but both μ and σ² are uncertain
    
    // Posterior mean of μ
    const muMean = this.params.mu0;
    
    // Posterior mean of σ² (from Inverse-Gamma)
    const sigma2Mean = this.params.beta / (this.params.alpha - 1);
    
    // Approximate expectation (this is itself uncertain)
    return [Math.exp(muMean + sigma2Mean / 2)];
  }
  
  variance(): number[] {
    // This is complex due to parameter uncertainty
    // Using approximation based on delta method
    const muMean = this.params.mu0;
    const muVar = this.params.beta / (this.params.lambda * (this.params.alpha - 1));
    
    const sigma2Mean = this.params.beta / (this.params.alpha - 1);
    const sigma2Var = this.params.beta * this.params.beta / 
      ((this.params.alpha - 1) * (this.params.alpha - 1) * (this.params.alpha - 2));
    
    // Approximate variance of LogNormal accounting for parameter uncertainty
    const expMuSigma = Math.exp(muMean + sigma2Mean);
    const totalVar = expMuSigma * expMuSigma * 
      (Math.exp(muVar + sigma2Var) - 1);
    
    return [totalVar];
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
  
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Use posterior predictive sampling
    const samples: number[] = [];
    for (let i = 0; i < 10000; i++) {
      samples.push(this.sample()[0]);
    }
    
    samples.sort((a, b) => a - b);
    const alpha = (1 - level) / 2;
    const lowerIdx = Math.floor(alpha * samples.length);
    const upperIdx = Math.floor((1 - alpha) * samples.length);
    
    return [[samples[lowerIdx], samples[upperIdx]]];
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
  
  /**
   * Median (more robust for LogNormal)
   */
  median(): number {
    // Median = exp(μ), and μ has posterior mean μ₀
    return Math.exp(this.params.mu0);
  }
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
        runtime: 0
      }
    };
  }
  
  private getPriorParams(
    options: FitOptions | undefined,
    data: number[]
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
    
    // Otherwise, use weakly informative priors based on data scale
    const logData = data.map(x => Math.log(x));
    const empiricalMean = logData.reduce((a, b) => a + b, 0) / logData.length;
    const empiricalVar = logData.reduce(
      (sum, x) => sum + Math.pow(x - empiricalMean, 2), 0
    ) / logData.length;
    
    return {
      mu0: empiricalMean,      // Center prior at data
      lambda: 1,               // Weak confidence (1 pseudo-observation)
      alpha: 2,                // Weak shape (minimum for finite variance)
      beta: empiricalVar * 2   // Scale based on data
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