/**
 * Normal (Gaussian) Distribution
 * 
 * The Normal distribution is fundamental to statistics and appears naturally
 * in many contexts due to the Central Limit Theorem. It's essential for
 * HMC/NUTS samplers and many Bayesian models.
 */

import { RandomVariable, log, subtract, multiply, add, pow, exp } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';

/**
 * Constant for log(2π)
 */
const LOG_TWO_PI = Math.log(2 * Math.PI);

/**
 * Error function approximation using Abramowitz and Stegun formula
 * Maximum error: 1.5e-7
 */
function erf(x: number): number {
  // Constants
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  // Save the sign of x
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  
  // A&S formula 7.1.26
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
}

/**
 * Cumulative distribution function for standard normal
 */
function standardNormalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

/**
 * Inverse CDF (quantile function) for standard normal
 * Using rational approximation
 */
function standardNormalInvCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;
  
  // Coefficients in rational approximations
  const a = [-3.969683028665376e+01, 2.209460984245205e+02,
             -2.759285104469687e+02, 1.383577518672690e+02,
             -3.066479806614716e+01, 2.506628277459239e+00];
  
  const b = [-5.447609879822406e+01, 1.615858368580409e+02,
             -1.556989798598866e+02, 6.680131188771972e+01,
             -1.328068155288572e+01];
  
  const c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
              4.374664141464968e+00,  2.938163982698783e+00];
  
  const d = [7.784695709041462e-03, 3.224671290700398e-01,
             2.445134137142996e+00, 3.754408661907416e+00];
  
  // Define break-points
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  
  let q, r;
  
  if (p < pLow) {
    // Rational approximation for lower region
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    // Rational approximation for central region
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    // Rational approximation for upper region
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Normal distribution random variable
 */
export class NormalRV extends RandomVariable<number> {
  constructor(
    private mean: RandomVariable<number>,
    private stdDev: RandomVariable<number>,
    graph?: ComputationGraph
  ) {
    // Create a node that represents the Normal distribution
    const node = (graph || ComputationGraph.current()).createNode(
      'normal',
      [mean.getNode(), stdDev.getNode()],
      (inputs) => {
        // Forward pass returns mean
        return inputs[0];
      },
      (grad, inputs) => {
        // Gradient of mean w.r.t. mean and stdDev
        return [grad, 0];
      }
    );
    
    super(node, [], graph || ComputationGraph.current());
  }
  
  /**
   * Sample from Normal distribution using Box-Muller transform
   */
  sample(rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    
    // Box-Muller transform
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    // Transform to N(μ, σ²)
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    return meanVal + stdDevVal * z0;
  }
  
  /**
   * Sample multiple values efficiently
   */
  sampleMultiple(n: number, rng: () => number): number[] {
    const samples: number[] = [];
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    // Box-Muller generates two samples at a time
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
   * log p(x | μ, σ) = -0.5 * log(2π) - log(σ) - 0.5 * ((x - μ) / σ)²
   */
  logProb(value: number | RandomVariable<number>): RandomVariable<number> {
    const x = RandomVariable.constant(value);
    
    // -0.5 * log(2π)
    const term1 = RandomVariable.constant(-0.5 * LOG_TWO_PI);
    
    // -log(σ)
    const term2 = log(this.stdDev).multiply(-1);
    
    // -0.5 * ((x - μ) / σ)²
    const standardized = subtract(x, this.mean).divide(this.stdDev);
    const term3 = standardized.pow(2).multiply(-0.5);
    
    // Combine terms
    return add(term1, add(term2, term3));
  }
  
  /**
   * Cumulative distribution function
   * P(X ≤ x) = Φ((x - μ) / σ)
   */
  cdf(value: number): number {
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    const standardized = (value - meanVal) / stdDevVal;
    return standardNormalCDF(standardized);
  }
  
  /**
   * Inverse CDF (quantile function)
   * Returns x such that P(X ≤ x) = p
   */
  inverseCDF(p: number): number {
    const meanVal = this.mean.forward();
    const stdDevVal = this.stdDev.forward();
    
    const standardizedQuantile = standardNormalInvCDF(p);
    return meanVal + stdDevVal * standardizedQuantile;
  }
  
  /**
   * Get the parameters of this distribution
   */
  getParameters(): { mean: RandomVariable<number>, stdDev: RandomVariable<number> } {
    return { mean: this.mean, stdDev: this.stdDev };
  }
  
  /**
   * Mean of the Normal distribution
   */
  getMean(): RandomVariable<number> {
    return this.mean;
  }
  
  /**
   * Variance of the Normal distribution: σ²
   */
  variance(): RandomVariable<number> {
    return this.stdDev.pow(2);
  }
  
  /**
   * Standard deviation of the Normal distribution
   */
  getStdDev(): RandomVariable<number> {
    return this.stdDev;
  }
  
  /**
   * Precision (inverse variance): 1/σ²
   */
  precision(): RandomVariable<number> {
    return RandomVariable.constant(1).divide(this.variance());
  }
  
  /**
   * Standardize a value: (x - μ) / σ
   */
  standardize(value: number | RandomVariable<number>): RandomVariable<number> {
    const x = RandomVariable.constant(value);
    return subtract(x, this.mean).divide(this.stdDev);
  }
}

/**
 * Factory function for creating Normal distributions
 * Can specify using either (mean, stdDev) or (mean, variance) with useVariance flag
 */
export function normal(
  mean: number | RandomVariable<number>,
  stdDevOrVariance: number | RandomVariable<number>,
  useVariance: boolean = false
): NormalRV {
  const meanRV = RandomVariable.constant(mean);
  let stdDevRV: RandomVariable<number>;
  
  if (useVariance) {
    // Convert variance to standard deviation
    const varianceRV = RandomVariable.constant(stdDevOrVariance);
    stdDevRV = varianceRV.pow(0.5);
  } else {
    stdDevRV = RandomVariable.constant(stdDevOrVariance);
  }
  
  return new NormalRV(meanRV, stdDevRV);
}

/**
 * Standard Normal distribution N(0, 1)
 */
export function standardNormal(): NormalRV {
  return normal(0, 1);
}

/**
 * Half-Normal distribution (absolute value of Normal)
 * Useful as a prior for standard deviations
 */
export class HalfNormalRV extends NormalRV {
  constructor(stdDev: RandomVariable<number>, graph?: ComputationGraph) {
    super(RandomVariable.constant(0), stdDev, graph);
  }
  
  /**
   * Sample from Half-Normal distribution
   */
  sample(rng: () => number): number {
    return Math.abs(super.sample(rng));
  }
  
  /**
   * Log probability density function for Half-Normal
   * log p(x | σ) = log(2) - 0.5 * log(2π) - log(σ) - 0.5 * (x / σ)² for x ≥ 0
   */
  logProb(value: number | RandomVariable<number>): RandomVariable<number> {
    const x = RandomVariable.constant(value);
    
    // Check if value is non-negative
    if (typeof value === 'number' && value < 0) {
      return RandomVariable.constant(-Infinity);
    }
    
    // log(2) - 0.5 * log(2π)
    const term1 = RandomVariable.constant(Math.log(2) - 0.5 * LOG_TWO_PI);
    
    // Use parent's logProb and add log(2) to account for folding
    const normalLogProb = super.logProb(value);
    
    return add(normalLogProb, RandomVariable.constant(Math.log(2)));
  }
}

/**
 * Factory function for Half-Normal distribution
 */
export function halfNormal(
  stdDev: number | RandomVariable<number>
): HalfNormalRV {
  const stdDevRV = RandomVariable.constant(stdDev);
  return new HalfNormalRV(stdDevRV);
}