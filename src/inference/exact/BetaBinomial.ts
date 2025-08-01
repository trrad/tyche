/**
 * Beta-Binomial conjugate inference
 * Exact Bayesian inference for binary outcomes
 */

import jStat from 'jstat';
import { InferenceEngine } from '../base/InferenceEngine';
import { 
  DataInput, 
  FitOptions, 
  InferenceResult, 
  Posterior,
  BinomialData 
} from '../base/types';

/**
 * Beta posterior distribution wrapper
 */
class BetaPosterior implements Posterior {
  constructor(
    private readonly alpha: number,
    private readonly beta: number
  ) {
    if (alpha <= 0 || beta <= 0) {
      throw new Error(`Invalid Beta parameters: alpha=${alpha}, beta=${beta}. Both must be positive.`);
    }
  }
  
  mean(): number[] {
    return [this.alpha / (this.alpha + this.beta)];
  }
  
  variance(): number[] {
    const n = this.alpha + this.beta;
    return [(this.alpha * this.beta) / (n * n * (n + 1))];
  }
  
  sample(n: number = 1): number[] {
    // Use jstat for sampling
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      samples.push(jStat.beta.sample(this.alpha, this.beta));
    }
    return samples;
  }
  
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    return [[
      jStat.beta.inv(alpha, this.alpha, this.beta),
      jStat.beta.inv(1 - alpha, this.alpha, this.beta)
    ]];
  }
  
  /**
   * Get the parameters of the posterior
   */
  getParameters(): { alpha: number; beta: number } {
    return { alpha: this.alpha, beta: this.beta };
  }
  
  /**
   * Additional methods for Beta posterior
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
    return 1 - jStat.beta.cdf(threshold, this.alpha, this.beta);
  }

  /**
   * Log probability density/mass function
   * Required for WAIC computation
   */
  logPdf(data: any): number {
    // Bernoulli observation
    if (data === 0 || data === 1) {
      const p = this.alpha / (this.alpha + this.beta);
      return data === 1 ? Math.log(p) : Math.log(1 - p);
    }
    // Binomial observation
    if (data && typeof data === 'object' && 'successes' in data && 'trials' in data) {
      const { successes: s, trials: n } = data;
      // Beta-Binomial log PMF
      return this.logBeta(s + this.alpha, n - s + this.beta) - 
             this.logBeta(this.alpha, this.beta) + 
             this.logChoose(n, s);
    }
    throw new Error('Invalid data for Beta posterior');
  }

  private logBeta(a: number, b: number): number {
    return this.logGamma(a) + this.logGamma(b) - this.logGamma(a + b);
  }

  private logGamma(x: number): number {
    // Use Stirling's approximation for large x
    if (x > 170) {
      return x * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI / x);
    }
    // For smaller x, use a simple implementation or library
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
  constructor() {
    super('Beta-Binomial Conjugate');
  }
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    // Validate input
    this.validateInput(data);
    
    // Extract binomial data
    const binomialData = data.data as BinomialData;
    if (!('successes' in binomialData) || !('trials' in binomialData)) {
      throw new Error('BetaBinomial requires data with successes and trials');
    }
    
    const { successes, trials } = binomialData;
    
    // Get prior parameters (default to uniform Beta(1,1))
    let priorAlpha = 1;
    let priorBeta = 1;
    
    if (options?.priorParams) {
      if (options.priorParams.type !== 'beta') {
        throw new Error('BetaBinomial requires beta prior');
      }
      if (options.priorParams.params.length !== 2) {
        throw new Error('Beta prior requires exactly 2 parameters');
      }
      [priorAlpha, priorBeta] = options.priorParams.params;
    }
    
    // Conjugate update
    const posteriorAlpha = priorAlpha + successes;
    const posteriorBeta = priorBeta + (trials - successes);
    
    // Create posterior
    const posterior = new BetaPosterior(posteriorAlpha, posteriorBeta);
    
    // Return result with diagnostics
    return {
      posterior,
      diagnostics: {
        converged: true,  // Always converges (exact inference)
        iterations: 1,    // Single update
        runtime: 0,       // Near-instant
        modelType: 'beta-binomial'
      }
    };
  }
  
  canHandle(data: DataInput): boolean {
    // Can handle binomial data or binary arrays
    if (data.data && typeof data.data === 'object') {
      if ('successes' in data.data && 'trials' in data.data) {
        return true;
      }
    }
    
    if (Array.isArray(data.data)) {
      // Check if all values are 0 or 1
      return data.data.every(x => x === 0 || x === 1);
    }
    
    return false;
  }
  
  getDescription(): string {
    return 'Exact Bayesian inference for binary outcomes using Beta-Binomial conjugacy';
  }
  
  /**
   * Helper to convert array data to binomial format
   */
  static arrayToBinomial(data: number[]): BinomialData {
    const successes = data.filter(x => x === 1).length;
    const trials = data.length;
    return { successes, trials };
  }
}

export { BetaPosterior };