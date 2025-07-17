/**
 * Binomial Distribution - Updated to use math libraries
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';
import { logBinomial } from '../math/special';
import { RNG } from '../math/random';

/**
 * Binomial distribution random variable
 */
export class BinomialRV extends RandomVariable {
  private nValue: number;
  private rng: RNG;
  
  constructor(
    n: number | RandomVariable,
    private p: RandomVariable,
    graph?: ComputationGraph,
    rng?: RNG
  ) {
    // Store n as a number for simplicity
    const nRV = RandomVariable.constant(n);
    const nVal = nRV.forward();
    
    // Validate n
    if (nVal < 0 || nVal !== Math.floor(nVal)) {
      throw new Error(`Invalid binomial parameter n=${nVal}. Must be a non-negative integer.`);
    }
    
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
    this.rng = rng || new RNG();
  }
  
  /**
   * Sample from Binomial distribution using better RNG
   */
  override sample(customRng?: () => number): number {
    const n = this.nValue;
    const pVal = this.p.forward();
    
    // Validate p
    if (pVal < 0 || pVal > 1) {
      throw new Error(`Invalid probability p=${pVal}. Must be in [0, 1].`);
    }
    
    // If custom RNG provided, use basic implementation
    if (customRng) {
      return this.sampleBasic(n, pVal, customRng);
    }
    
    // Use the better RNG implementation
    return this.rng.binomial(n, pVal);
  }
  
  /**
   * Basic sampling for backward compatibility
   */
  private sampleBasic(n: number, p: number, rng: () => number): number {
    // For small n, use direct method
    if (n < 30) {
      let successes = 0;
      for (let i = 0; i < n; i++) {
        if (rng() < p) successes++;
      }
      return successes;
    }
    
    // For large n with appropriate p, use normal approximation
    const mean = n * p;
    const stdDev = Math.sqrt(n * p * (1 - p));
    
    if (mean > 10 && stdDev > 3) {
      const z = this.normalFromUniform(rng);
      const sample = Math.round(mean + stdDev * z);
      return Math.max(0, Math.min(n, sample));
    }
    
    // Otherwise, use direct method
    let successes = 0;
    for (let i = 0; i < n; i++) {
      if (rng() < p) successes++;
    }
    return successes;
  }
  
  private normalFromUniform(rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  /**
   * Sample multiple values efficiently
   */
  sampleMultiple(size: number, customRng?: () => number): number[] {
    const samples: number[] = new Array(size);
    const n = this.nValue;
    const pVal = this.p.forward();
    
    if (customRng) {
      for (let i = 0; i < size; i++) {
        samples[i] = this.sampleBasic(n, pVal, customRng);
      }
    } else {
      for (let i = 0; i < size; i++) {
        samples[i] = this.rng.binomial(n, pVal);
      }
    }
    
    return samples;
  }
  
  /**
   * Log probability mass function using imported logBinomial
   */
  override logProb(k: number | RandomVariable): RandomVariable {
    const kRV = RandomVariable.constant(k);
    const kVal = typeof k === 'number' ? k : k.forward();
    const n = this.nValue;
    
    // Validate k
    if (kVal < 0 || kVal > n || kVal !== Math.floor(kVal)) {
      return RandomVariable.constant(-Infinity);
    }
    
    // log(n choose k)
    const logBinCoeffNode = ComputationGraph.current().createNode(
      'logBinomial',
      [], // No dependencies on RandomVariables, just constants
      () => logBinomial(n, kVal),
      () => [] // No gradients for the binomial coefficient
    );
    const logBinCoeff = new RandomVariable(logBinCoeffNode);
    
    // k*log(p)
    const successTerm = multiply(kRV, log(this.p));
    
    // (n-k)*log(1-p)
    const failureTerm = multiply(
      subtract(n, kRV),
      log(subtract(1, this.p))
    );
    
    // Combine: log(n choose k) + k*log(p) + (n-k)*log(1-p)
    return add(logBinCoeff, add(successTerm, failureTerm));
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
   * Standard deviation
   */
  stdDev(): RandomVariable {
    return this.variance().pow(0.5);
  }
  
  /**
   * Mode: floor((n+1)*p)
   */
  mode(): number {
    const pVal = this.p.forward();
    return Math.floor((this.nValue + 1) * pVal);
  }
  
  /**
   * Probability of success
   */
  getP(): RandomVariable {
    return this.p;
  }
  
  /**
   * Number of trials
   */
  getN(): number {
    return this.nValue;
  }
}

/**
 * Factory function for Binomial distribution
 */
export function binomial(
  n: number, 
  p: number | RandomVariable,
  rng?: RNG
): BinomialRV {
  const pRV = RandomVariable.constant(p);
  return new BinomialRV(n, pRV, undefined, rng);
}

/**
 * Bernoulli distribution (Binomial with n=1)
 */
export function bernoulli(
  p: number | RandomVariable,
  rng?: RNG
): BinomialRV {
  return binomial(1, p, rng);
}