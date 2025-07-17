/**
 * Normal (Gaussian) Distribution - Updated to use math libraries
 */

import { RandomVariable, log, subtract, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';
import { erf, erfInv } from '../math/special';
import { RNG } from '../math/random';

const LOG_TWO_PI = Math.log(2 * Math.PI);
const SQRT_TWO = Math.sqrt(2);

/**
 * Normal distribution random variable
 */
export class NormalRV extends RandomVariable {
  private rng: RNG;
  
  constructor(
    private mean: RandomVariable,
    private stdDev: RandomVariable,
    graph?: ComputationGraph,
    rng?: RNG
  ) {
    const node = (graph || ComputationGraph.current()).createNode(
      'normal',
      [mean.getNode(), stdDev.getNode()],
      (inputs) => {
        // Forward pass returns mean
        return inputs.length > 0 ? inputs[0] : 0;
      },
      () => [1, 0]  // Gradient w.r.t mean is 1, w.r.t stdDev is 0
    );
    
    super(node, [], graph || ComputationGraph.current());
    this.rng = rng || new RNG();
  }
  
  /**
   * Sample from Normal distribution using better RNG
   */
  override sample(customRng?: () => number): number {
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    // Validate parameters
    if (stdDevVal < 0) {
      throw new Error(`Invalid standard deviation: ${stdDevVal}. Must be non-negative.`);
    }
    
    if (customRng) {
      // Use Box-Muller for backward compatibility
      const u1 = customRng();
      const u2 = customRng();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return meanVal + stdDevVal * z0;
    }
    
    // Use the better RNG
    return meanVal + stdDevVal * this.rng.normal();
  }
  
  /**
   * Sample multiple values efficiently
   */
  sampleMultiple(n: number, customRng?: () => number): number[] {
    const samples: number[] = new Array(n);
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    if (customRng) {
      // Box-Muller generates pairs, so we can be more efficient
      for (let i = 0; i < n; i += 2) {
        const u1 = customRng();
        const u2 = customRng();
        
        const r = Math.sqrt(-2 * Math.log(u1));
        const theta = 2 * Math.PI * u2;
        
        samples[i] = meanVal + stdDevVal * r * Math.cos(theta);
        if (i + 1 < n) {
          samples[i + 1] = meanVal + stdDevVal * r * Math.sin(theta);
        }
      }
    } else {
      // Use better RNG
      for (let i = 0; i < n; i++) {
        samples[i] = meanVal + stdDevVal * this.rng.normal();
      }
    }
    
    return samples;
  }
  
  /**
   * Log probability density function
   */
  override logProb(value: number | RandomVariable): RandomVariable {
    const x = RandomVariable.constant(value);
    
    // -0.5 * log(2π)
    const term1 = RandomVariable.constant(-0.5 * LOG_TWO_PI);
    
    // -log(σ)
    const term2 = log(this.stdDev).neg();
    
    // -0.5 * ((x - μ) / σ)²
    const diff = x.subtract(this.mean);
    const standardized = diff.divide(this.stdDev);
    const term3 = standardized.pow(2).multiply(-0.5);
    
    return term1.add(term2).add(term3);
  }
  
  /**
   * Cumulative distribution function using imported erf
   */
  cdf(value: number): number {
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    if (stdDevVal === 0) {
      // Degenerate case: point mass at mean
      return value >= meanVal ? 1 : 0;
    }
    
    const standardized = (value - meanVal) / (stdDevVal * SQRT_TWO);
    return 0.5 * (1 + erf(standardized));
  }
  
  /**
   * Inverse CDF (quantile function) using imported erfInv
   */
  inverseCDF(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    if (stdDevVal === 0) {
      // Degenerate case: point mass at mean
      return meanVal;
    }
    
    // Φ^(-1)(p) = μ + σ * √2 * erf^(-1)(2p - 1)
    const standardizedQuantile = SQRT_TWO * erfInv(2 * p - 1);
    return meanVal + stdDevVal * standardizedQuantile;
  }
  
  /**
   * Get parameters
   */
  getParameters(): { mean: RandomVariable, stdDev: RandomVariable } {
    return { mean: this.mean, stdDev: this.stdDev };
  }
  
  /**
   * Mean
   */
  getMean(): RandomVariable {
    return this.mean;
  }
  
  /**
   * Variance: σ²
   */
  variance(): RandomVariable {
    return this.stdDev.pow(2);
  }
  
  /**
   * Standard deviation
   */
  getStdDev(): RandomVariable {
    return this.stdDev;
  }
  
  /**
   * Precision: 1/σ²
   */
  precision(): RandomVariable {
    return RandomVariable.constant(1).divide(this.variance());
  }
  
  /**
   * Standardize a value: (x - μ) / σ
   */
  standardize(value: number | RandomVariable): RandomVariable {
    const x = RandomVariable.constant(value);
    return x.subtract(this.mean).divide(this.stdDev);
  }
  
  /**
   * Probability density function (non-log version)
   */
  pdf(value: number): number {
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    if (stdDevVal === 0) {
      // Degenerate case
      return value === meanVal ? Infinity : 0;
    }
    
    const standardized = (value - meanVal) / stdDevVal;
    const coefficient = 1 / (stdDevVal * Math.sqrt(2 * Math.PI));
    return coefficient * Math.exp(-0.5 * standardized * standardized);
  }
}

/**
 * Factory function for Normal distribution
 */
export function normal(
  mean: number | RandomVariable,
  stdDev: number | RandomVariable,
  rng?: RNG
): NormalRV {
  const meanRV = RandomVariable.constant(mean);
  const stdDevRV = RandomVariable.constant(stdDev);
  
  return new NormalRV(meanRV, stdDevRV, undefined, rng);
}

/**
 * Standard Normal N(0, 1)
 */
export function standardNormal(rng?: RNG): NormalRV {
  return normal(0, 1, rng);
}

/**
 * Half-Normal distribution
 */
export class HalfNormalRV extends NormalRV {
  constructor(
    stdDev: RandomVariable, 
    graph?: ComputationGraph,
    rng?: RNG
  ) {
    super(RandomVariable.constant(0), stdDev, graph, rng);
  }
  
  override sample(customRng?: () => number): number {
    // Take absolute value of normal sample
    return Math.abs(super.sample(customRng));
  }
  
  override sampleMultiple(n: number, customRng?: () => number): number[] {
    // More efficient than sampling one by one
    const samples = super.sampleMultiple(n, customRng);
    return samples.map(s => Math.abs(s));
  }
  
  override logProb(value: number | RandomVariable): RandomVariable {
    const xVal = typeof value === 'number' ? value : value.forward();
    
    if (xVal < 0) {
      return RandomVariable.constant(-Infinity);
    }
    
    // For half-normal: log(2) + normal_logprob(x)
    const normalLogProb = super.logProb(value);
    const log2 = RandomVariable.constant(Math.log(2));
    return log2.add(normalLogProb);
  }
  
  override cdf(value: number): number {
    if (value < 0) return 0;
    
    // For half-normal: 2 * Φ(x/σ) - 1
    const normalCDF = super.cdf(value);
    return 2 * normalCDF - 1;
  }
  
  override pdf(value: number): number {
    if (value < 0) return 0;
    
    // For half-normal: 2 * φ(x/σ) / σ
    return 2 * super.pdf(value);
  }
  
  /**
   * Mean of half-normal: σ * sqrt(2/π)
   */
  override getMean(): RandomVariable {
    const sigma = this.getStdDev();
    const coeff = Math.sqrt(2 / Math.PI);
    return sigma.multiply(coeff);
  }
  
  /**
   * Variance of half-normal: σ² * (1 - 2/π)
   */
  override variance(): RandomVariable {
    const sigma2 = this.getStdDev().pow(2);
    const coeff = 1 - 2 / Math.PI;
    return sigma2.multiply(coeff);
  }
}

/**
 * Factory for Half-Normal
 */
export function halfNormal(
  stdDev: number | RandomVariable,
  rng?: RNG
): HalfNormalRV {
  const stdDevRV = RandomVariable.constant(stdDev);
  return new HalfNormalRV(stdDevRV, undefined, rng);
}