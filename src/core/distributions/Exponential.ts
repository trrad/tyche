// src/core/distributions/Exponential.ts
/**
 * Exponential distribution
 * 
 * The exponential distribution models time between events in a Poisson process.
 * It's memoryless and commonly used for modeling waiting times, lifetimes, and
 * simple revenue/conversion values.
 * 
 * Parameterization: rate (λ)
 * - Mean: 1/λ
 * - Variance: 1/λ²
 * - PDF: λ * e^(-λx) for x ≥ 0
 * 
 * Note: Exponential(λ) = Gamma(1, 1/λ)
 */

import { RandomVariable, log, multiply } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';
import { RNG } from '../utils/math/random';

export class ExponentialRV extends RandomVariable {
  private rng: RNG;
  
  constructor(
    private rate: RandomVariable,  // λ (lambda)
    graph?: ComputationGraph,
    rng?: RNG
  ) {
    const node = (graph || ComputationGraph.current()).createNode(
      'exponential',
      [rate.getNode()],
      (inputs) => {
        if (inputs.length < 1) return 0;
        const lambda = inputs[0];
        // Validate parameter
        if (lambda <= 0) {
          throw new Error(`Invalid Exponential rate: ${lambda}. Must be positive.`);
        }
        // Forward pass returns mean: 1/λ
        return 1 / lambda;
      },
      (grad, inputs) => {
        if (inputs.length < 1) return [0];
        const lambda = inputs[0];
        
        // d(1/λ)/dλ = -1/λ²
        return [-grad / (lambda * lambda)];
      }
    );
    
    super(node, [], graph || ComputationGraph.current());
    this.rng = rng || new RNG();
  }
  
  /**
   * Sample from the distribution
   */
  override sample(customRng?: () => number): number {
    const rateVal = this.rate.forward();
    
    if (rateVal <= 0) {
      throw new Error(`Invalid Exponential rate: ${rateVal}`);
    }
    
    if (customRng) {
      // Inverse transform sampling: -log(U) / λ
      const u = customRng();
      return -Math.log(1 - u) / rateVal;
    }
    
    // Use the better RNG implementation
    return this.rng.exponential(rateVal);
  }
  
  /**
   * Sample multiple values
   */
  sampleMultiple(n: number, customRng?: () => number): number[] {
    const samples: number[] = new Array(n);
    
    for (let i = 0; i < n; i++) {
      samples[i] = this.sample(customRng);
    }
    
    return samples;
  }
  
  /**
   * Log probability density function
   * log p(x) = log(λ) - λx for x ≥ 0
   */
  override logProb(value: number | RandomVariable): RandomVariable {
    const x = RandomVariable.constant(value);
    const xVal = typeof value === 'number' ? value : value.forward();
    
    // Validate x ≥ 0
    if (xVal < 0) {
      return RandomVariable.constant(-Infinity);
    }
    
    // log(λ) - λx
    const term1 = log(this.rate);
    const term2 = multiply(this.rate, x).neg();
    
    return term1.add(term2);
  }
  
  /**
   * Mean: E[X] = 1/λ
   */
  mean(): RandomVariable {
    return RandomVariable.constant(1).divide(this.rate);
  }
  
  /**
   * Variance: Var[X] = 1/λ²
   */
  variance(): RandomVariable {
    return RandomVariable.constant(1).divide(this.rate.pow(2));
  }
  
  /**
   * Standard deviation: 1/λ
   */
  stdDev(): RandomVariable {
    return RandomVariable.constant(1).divide(this.rate);
  }
  
  /**
   * Mode: always 0 for exponential distribution
   */
  mode(): RandomVariable {
    return RandomVariable.constant(0);
  }
  
  /**
   * Scale parameter (inverse rate): 1/λ
   * This is the mean and also the scale if viewing as Gamma(1, scale)
   */
  scale(): RandomVariable {
    return RandomVariable.constant(1).divide(this.rate);
  }
  
  /**
   * Get parameters
   */
  getParameters(): { rate: RandomVariable } {
    return { rate: this.rate };
  }
  
  /**
   * Probability density function (non-log)
   */
  pdf(value: number): number {
    if (value < 0) return 0;
    
    const rateVal = this.rate.forward();
    return rateVal * Math.exp(-rateVal * value);
  }
  
  /**
   * Cumulative distribution function
   * F(x) = 1 - e^(-λx) for x ≥ 0
   */
  cdf(value: number): number {
    if (value < 0) return 0;
    
    const rateVal = this.rate.forward();
    return 1 - Math.exp(-rateVal * value);
  }
  
  /**
   * Inverse CDF (quantile function)
   * F^(-1)(p) = -log(1 - p) / λ
   */
  inverseCDF(p: number): number {
    if (p < 0 || p > 1) {
      throw new Error(`Invalid probability: ${p}. Must be in [0, 1].`);
    }
    
    if (p === 0) return 0;
    if (p === 1) return Infinity;
    
    const rateVal = this.rate.forward();
    return -Math.log(1 - p) / rateVal;
  }
  
  /**
   * Memoryless property: P(X > s + t | X > s) = P(X > t)
   * Returns the probability that the event occurs after time t,
   * given that it hasn't occurred by time s
   */
  memorylessProb(s: number, t: number): number {
    // Due to memoryless property, this equals P(X > t)
    return 1 - this.cdf(t);
  }
}

/**
 * Factory function for Exponential distribution
 */
export function exponential(
  rate: number | RandomVariable,
  rng?: RNG
): ExponentialRV {
  const rateRV = RandomVariable.constant(rate);
  
  return new ExponentialRV(rateRV, undefined, rng);
}