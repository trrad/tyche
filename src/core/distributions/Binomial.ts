/**
 * Binomial Distribution - Pragmatic implementation
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';

/**
 * Log factorial using simple iteration for small n, Stirling for large
 */
function logFactorial(n: number): number {
  if (n < 0) return -Infinity;
  if (n === 0 || n === 1) return 0;
  
  if (n < 20) {
    let result = 0;
    for (let i = 2; i <= n; i++) {
      result += Math.log(i);
    }
    return result;
  }
  
  // Stirling's approximation
  const logTwoPi = Math.log(2 * Math.PI);
  return n * Math.log(n) - n + 0.5 * Math.log(n) + 0.5 * logTwoPi;
}

/**
 * Log binomial coefficient
 */
function logBinomialCoefficient(n: number, k: number): number {
  if (k > n || k < 0) return -Infinity;
  if (k === 0 || k === n) return 0;
  
  // Use symmetry
  if (k > n - k) {
    k = n - k;
  }
  
  if (n < 20) {
    let result = 0;
    for (let i = 0; i < k; i++) {
      result += Math.log(n - i) - Math.log(i + 1);
    }
    return result;
  }
  
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/**
 * Binomial distribution random variable
 */
export class BinomialRV extends RandomVariable {
  private nValue: number;
  
  constructor(
    n: number | RandomVariable,
    private p: RandomVariable,
    graph?: ComputationGraph
  ) {
    // Store n as a number for simplicity
    const nRV = RandomVariable.constant(n);
    const nVal = nRV.forward();
    
    const node = (graph || ComputationGraph.current()).createNode(
      'binomial',
      [nRV.getNode(), p.getNode()],
      (inputs) => {
        if (inputs.length < 2) return 0;
        // Forward pass returns mean: n * p
        return inputs[0] * inputs[1];
      },
      (grad, inputs) => {
        if (inputs.length < 2) return [0, 0];
        const [n, p] = inputs;
        return [
          grad * p,  // d(np)/dn = p
          grad * n   // d(np)/dp = n
        ];
      }
    );
    
    super(node, [], graph || ComputationGraph.current());
    this.nValue = nVal;
  }
  
  /**
   * Sample from Binomial distribution
   */
  override sample(rng: () => number): number {
    const n = this.nValue;
    const p = this.p.forward();
    
    // Validate
    if (n < 0 || n !== Math.floor(n)) {
      throw new Error('n must be a non-negative integer');
    }
    
    // Direct method for small n
    if (n < 30) {
      let successes = 0;
      for (let i = 0; i < n; i++) {
        if (rng() < p) {
          successes++;
        }
      }
      return successes;
    }
    
    // Normal approximation for large n
    if (n * p > 10 && n * (1 - p) > 10) {
      const mean = n * p;
      const stdDev = Math.sqrt(n * p * (1 - p));
      const z = this.sampleNormal(0, 1, rng);
      const sample = Math.round(mean + stdDev * z);
      
      return Math.max(0, Math.min(n, sample));
    }
    
    // Fallback to inverse CDF
    return this.sampleInverseCDF(n, p, rng);
  }
  
  private sampleInverseCDF(n: number, p: number, rng: () => number): number {
    const u = rng();
    let cdf = Math.pow(1 - p, n);
    let k = 0;
    
    while (u > cdf && k < n) {
      k++;
      const prob = Math.exp(
        logBinomialCoefficient(n, k) + 
        k * Math.log(p) + 
        (n - k) * Math.log(1 - p)
      );
      cdf += prob;
    }
    
    return k;
  }
  
  private sampleNormal(mean: number, stdDev: number, rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
  
  /**
   * Log probability mass function
   */
  override logProb(k: number | RandomVariable): RandomVariable {
    const kRV = RandomVariable.constant(k);
    const kVal = typeof k === 'number' ? k : k.forward();
    const n = this.nValue;
    
    // Validate
    if (kVal < 0 || kVal > n || kVal !== Math.floor(kVal)) {
      return RandomVariable.constant(-Infinity);
    }
    
    // log(n choose k)
    const logBinCoeff = logBinomialCoefficient(n, kVal);
    
    // k*log(p)
    const successTerm = multiply(kRV, log(this.p));
    
    // (n-k)*log(1-p)
    const failureTerm = multiply(
      subtract(n, kRV),
      log(subtract(1, this.p))
    );
    
    return add(
      RandomVariable.constant(logBinCoeff),
      add(successTerm, failureTerm)
    );
  }
  
  /**
   * Get the parameters
   */
  getParameters(): { n: number, p: RandomVariable } {
    return { n: this.nValue, p: this.p };
  }
  
  /**
   * Mean: n * p
   */
  mean(): RandomVariable {
    return this.p.multiply(this.nValue);
  }
  
  /**
   * Variance: n * p * (1 - p)
   */
  variance(): RandomVariable {
    return this.mean().multiply(subtract(1, this.p));
  }
  
  /**
   * Mode
   */
  mode(): number {
    const p = this.p.forward();
    return Math.floor((this.nValue + 1) * p);
  }
}

/**
 * Factory function for Binomial distribution
 */
export function binomial(n: number, p: number | RandomVariable): BinomialRV {
  const pRV = RandomVariable.constant(p);
  return new BinomialRV(n, pRV);
}

/**
 * Bernoulli distribution (Binomial with n=1)
 */
export function bernoulli(p: number | RandomVariable): BinomialRV {
  return binomial(1, p);
}