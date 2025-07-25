/**
 * Gamma-Exponential conjugate inference
 * Exact Bayesian inference for positive continuous values
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
 * Gamma posterior distribution wrapper
 */
export class GammaPosterior implements Posterior {
  constructor(
    private readonly shape: number,  // alpha
    private readonly rate: number    // beta (rate = 1/scale)
  ) {
    if (shape <= 0 || rate <= 0) {
      throw new Error(`Invalid Gamma parameters: shape=${shape}, rate=${rate}. Both must be positive.`);
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
  
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    const scale = 1 / this.rate;
    
    return [[
      jStat.gamma.inv(alpha, this.shape, scale),
      jStat.gamma.inv(1 - alpha, this.shape, scale)
    ]];
  }
  
  /**
   * Get the parameters of the posterior
   */
  getParameters(): { shape: number; rate: number; scale: number } {
    return { 
      shape: this.shape, 
      rate: this.rate,
      scale: 1 / this.rate
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
  constructor() {
    super('Gamma-Exponential Conjugate');
  }
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    // Validate input
    this.validateInput(data);
    
    // Extract data
    let n: number;
    let sumX: number;
    
    if (Array.isArray(data.data)) {
      // Raw data
      const values = data.data;
      
      // Check all values are positive
      if (values.some(x => x <= 0)) {
        throw new Error('Gamma conjugate requires all positive values');
      }
      
      n = values.length;
      sumX = values.reduce((a, b) => a + b, 0);
    } else if ('n' in data.data && 'sum' in data.data) {
      // Summary statistics
      n = data.data.n;
      sumX = data.data.sum!;
      
      if (n <= 0 || sumX <= 0) {
        throw new Error('Invalid summary statistics');
      }
    } else {
      throw new Error('Gamma conjugate requires array data or summary statistics with n and sum');
    }
    
    // Get prior parameters (default to weakly informative)
    let priorShape = 1;   // α
    let priorRate = 0.1;  // β (small rate = weak prior)
    
    if (options?.priorParams) {
      if (options.priorParams.type !== 'gamma') {
        throw new Error('Gamma conjugate requires gamma prior');
      }
      if (options.priorParams.params.length !== 2) {
        throw new Error('Gamma prior requires exactly 2 parameters [shape, rate]');
      }
      [priorShape, priorRate] = options.priorParams.params;
    }
    
    // Conjugate update
    const posteriorShape = priorShape + n;
    const posteriorRate = priorRate + sumX;
    
    // Create posterior
    const posterior = new GammaPosterior(posteriorShape, posteriorRate);
    
    // Return result with diagnostics
    return {
      posterior,
      diagnostics: {
        converged: true,  // Always converges (exact inference)
        iterations: 1,    // Single update
        runtime: 0        // Near-instant
      }
    };
  }
  
  canHandle(data: DataInput): boolean {
    // Can handle positive continuous data
    if (Array.isArray(data.data)) {
      return data.data.length > 0 && data.data.every(x => x > 0);
    }
    
    // Can handle summary statistics
    if (data.data && typeof data.data === 'object') {
      return 'n' in data.data && 'sum' in data.data;
    }
    
    return false;
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