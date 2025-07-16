/**
 * Binomial Distribution
 * 
 * The Binomial distribution models the number of successes in a fixed number
 * of independent Bernoulli trials. It's fundamental for A/B testing and 
 * conversion rate analysis.
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';

/**
 * Log factorial using Stirling's approximation for large n
 * log(n!) ≈ n*log(n) - n + 0.5*log(2πn)
 */
function logFactorial(n: number): number {
  if (n < 0) return -Infinity;
  if (n === 0 || n === 1) return 0;
  
  // For small n, compute exactly
  if (n < 20) {
    let result = 0;
    for (let i = 2; i <= n; i++) {
      result += Math.log(i);
    }
    return result;
  }
  
  // Stirling's approximation for large n
  const logTwoPi = Math.log(2 * Math.PI);
  return n * Math.log(n) - n + 0.5 * Math.log(n) + 0.5 * logTwoPi;
}

/**
 * Log binomial coefficient: log(n choose k)
 */
function logBinomialCoefficient(n: number, k: number): number {
  if (k > n || k < 0) return -Infinity;
  if (k === 0 || k === n) return 0;
  
  // Use symmetry: (n choose k) = (n choose n-k)
  if (k > n - k) {
    k = n - k;
  }
  
  // For small values, compute exactly to avoid approximation errors
  if (n < 20) {
    let result = 0;
    for (let i = 0; i < k; i++) {
      result += Math.log(n - i) - Math.log(i + 1);
    }
    return result;
  }
  
  // Use log factorial for larger values
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/**
 * Binomial distribution random variable
 */
export class BinomialRV extends RandomVariable<number> {
  constructor(
    private n: RandomVariable<number> | number,
    private p: RandomVariable<number>,
    graph?: ComputationGraph
  ) {
    // Convert n to RandomVariable if needed
    const nRV = typeof n === 'number' ? RandomVariable.constant(n) : n;
    
    // Create a node that represents the Binomial distribution
    const node = (graph || ComputationGraph.current()).createNode(
      'binomial',
      [nRV.getNode(), p.getNode()],
      (inputs) => {
        // Forward pass returns mean: n * p
        return inputs[0] * inputs[1];
      },
      (grad, inputs) => {
        // Gradient of mean w.r.t. n and p
        const [n, p] = inputs;
        return [
          grad * p,  // d(np)/dn = p
          grad * n   // d(np)/dp = n
        ];
      }
    );
    
    super(node, [], graph || ComputationGraph.current());
  }
  
  /**
   * Sample from Binomial distribution
   * Sum of n Bernoulli trials
   */
  sample(rng: () => number): number {
    const nVal = typeof this.n === 'number' ? this.n : this.n.forward();
    const pVal = this.p.forward();
    
    // For small n, use direct method
    if (nVal < 30) {
      let successes = 0;
      for (let i = 0; i < nVal; i++) {
        if (rng() < pVal) {
          successes++;
        }
      }
      return successes;
    }
    
    // For large n, use normal approximation if appropriate
    if (nVal * pVal > 10 && nVal * (1 - pVal) > 10) {
      // Normal approximation: Binomial(n,p) ≈ N(np, np(1-p))
      const mean = nVal * pVal;
      const stdDev = Math.sqrt(nVal * pVal * (1 - pVal));
      const z = this.sampleNormal(0, 1, rng);
      const sample = Math.round(mean + stdDev * z);
      
      // Ensure sample is within valid range
      return Math.max(0, Math.min(nVal, sample));
    }
    
    // For moderate n or extreme p, use inverse CDF method
    return this.sampleInverseCDF(nVal, pVal, rng);
  }
  
  /**
   * Sample using inverse CDF method (more accurate for extreme p)
   */
  private sampleInverseCDF(n: number, p: number, rng: () => number): number {
    const u = rng();
    let cdf = Math.pow(1 - p, n); // P(X = 0)
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
  
  /**
   * Sample from standard normal using Box-Muller transform
   */
  private sampleNormal(mean: number, stdDev: number, rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
  
  /**
   * Log probability mass function
   * log P(k | n, p) = log(n choose k) + k*log(p) + (n-k)*log(1-p)
   */
  logProb(k: number | RandomVariable<number>): RandomVariable<number> {
    const kRV = RandomVariable.constant(k);
    const nVal = typeof this.n === 'number' ? this.n : this.n.forward();
    
    // Check if k is valid
    if (typeof k === 'number' && (k < 0 || k > nVal || k !== Math.floor(k))) {
      return RandomVariable.constant(-Infinity);
    }
    
    // log(n choose k) - constant w.r.t. p
    const logBinCoeff = logBinomialCoefficient(nVal, typeof k === 'number' ? k : k.forward());
    
    // k*log(p)
    const successTerm = multiply(kRV, log(this.p));
    
    // (n-k)*log(1-p)
    const nRV = RandomVariable.constant(nVal);
    const failureTerm = multiply(
      subtract(nRV, kRV),
      log(subtract(1, this.p))
    );
    
    // Combine terms
    return add(
      RandomVariable.constant(logBinCoeff),
      add(successTerm, failureTerm)
    );
  }
  
  /**
   * Get the parameters of this distribution
   */
  getParameters(): { n: number | RandomVariable<number>, p: RandomVariable<number> } {
    return { n: this.n, p: this.p };
  }
  
  /**
   * Mean of the Binomial distribution: n * p
   */
  mean(): RandomVariable<number> {
    if (typeof this.n === 'number') {
      return this.p.multiply(this.n);
    }
    return this.n.multiply(this.p);
  }
  
  /**
   * Variance of the Binomial distribution: n * p * (1 - p)
   */
  variance(): RandomVariable<number> {
    const mean = this.mean();
    const oneMinus = subtract(1, this.p);
    
    if (typeof this.n === 'number') {
      return mean.multiply(oneMinus);
    }
    return mean.multiply(oneMinus);
  }
  
  /**
   * Mode of the Binomial distribution
   * For integer (n+1)p: both floor((n+1)p) and floor((n+1)p)-1
   * Otherwise: floor((n+1)p)
   */
  mode(): number {
    const nVal = typeof this.n === 'number' ? this.n : this.n.forward();
    const pVal = this.p.forward();
    
    const value = (nVal + 1) * pVal;
    return Math.floor(value);
  }
}

/**
 * Factory function for creating Binomial distributions
 */
export function binomial(
  n: number | RandomVariable<number>,
  p: number | RandomVariable<number>
): BinomialRV {
  const pRV = RandomVariable.constant(p);
  return new BinomialRV(n, pRV);
}

/**
 * Bernoulli distribution (special case of Binomial with n=1)
 */
export function bernoulli(p: number | RandomVariable<number>): BinomialRV {
  return binomial(1, p);
}