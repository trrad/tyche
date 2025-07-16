/**
 * Normal (Gaussian) Distribution - Pragmatic implementation
 */

import { RandomVariable, log, subtract, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';

const LOG_TWO_PI = Math.log(2 * Math.PI);

/**
 * Error function approximation
 */
function erf(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
}

/**
 * Standard normal CDF
 */
function standardNormalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Inverse CDF for standard normal (simplified)
 */
function standardNormalInvCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  
  // Simple approximation for demonstration
  // In production, use a more accurate method
  const sign = p > 0.5 ? 1 : -1;
  const q = p > 0.5 ? 1 - p : p;
  const r = Math.sqrt(-2 * Math.log(q));
  
  return sign * r;
}

/**
 * Normal distribution random variable
 */
export class NormalRV extends RandomVariable {
  constructor(
    private mean: RandomVariable,
    private stdDev: RandomVariable,
    graph?: ComputationGraph
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
  }
  
  /**
   * Sample from Normal distribution
   */
  override sample(rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    
    // Box-Muller transform
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    return meanVal + stdDevVal * z0;
  }
  
  /**
   * Sample multiple values
   */
  sampleMultiple(n: number, rng: () => number): number[] {
    const samples: number[] = [];
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    for (let i = 0; i < n; i += 2) {
      const u1 = rng();
      const u2 = rng();
      
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      
      samples.push(meanVal + stdDevVal * z0);
      if (i + 1 < n) {
        samples.push(meanVal + stdDevVal * z1);
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
    const term2 = log(this.stdDev).multiply(-1);
    
    // -0.5 * ((x - μ) / σ)²
    const standardized = subtract(x, this.mean).divide(this.stdDev);
    const term3 = standardized.pow(2).multiply(-0.5);
    
    return add(term1, add(term2, term3));
  }
  
  /**
   * CDF
   */
  cdf(value: number): number {
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    const standardized = (value - meanVal) / stdDevVal;
    return standardNormalCDF(standardized);
  }
  
  /**
   * Inverse CDF
   */
  inverseCDF(p: number): number {
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    const standardizedQuantile = standardNormalInvCDF(p);
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
   * Standardize a value
   */
  standardize(value: number | RandomVariable): RandomVariable {
    const x = RandomVariable.constant(value);
    return subtract(x, this.mean).divide(this.stdDev);
  }
}

/**
 * Factory function for Normal distribution
 */
export function normal(
  mean: number | RandomVariable,
  stdDev: number | RandomVariable
): NormalRV {
  const meanRV = RandomVariable.constant(mean);
  const stdDevRV = RandomVariable.constant(stdDev);
  
  return new NormalRV(meanRV, stdDevRV);
}

/**
 * Standard Normal N(0, 1)
 */
export function standardNormal(): NormalRV {
  return normal(0, 1);
}

/**
 * Half-Normal distribution
 */
export class HalfNormalRV extends NormalRV {
  constructor(stdDev: RandomVariable, graph?: ComputationGraph) {
    super(RandomVariable.constant(0), stdDev, graph);
  }
  
  override sample(rng: () => number): number {
    return Math.abs(super.sample(rng));
  }
  
  override logProb(value: number | RandomVariable): RandomVariable {
    const xVal = typeof value === 'number' ? value : value.forward();
    
    if (xVal < 0) {
      return RandomVariable.constant(-Infinity);
    }
    
    // Add log(2) to normal log prob
    const normalLogProb = super.logProb(value);
    return add(normalLogProb, RandomVariable.constant(Math.log(2)));
  }
}

/**
 * Factory for Half-Normal
 */
export function halfNormal(stdDev: number | RandomVariable): HalfNormalRV {
  const stdDevRV = RandomVariable.constant(stdDev);
  return new HalfNormalRV(stdDevRV);
}