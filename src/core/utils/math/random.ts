// src/core/math/random.ts
/**
 * Better random number generation for statistical applications
 */

// Note: You'll need to install this package:
// npm install --save random-js

import { Random, MersenneTwister19937 } from 'random-js';

/**
 * Seeded random number generator using Mersenne Twister
 */
export class RNG {
  private random: Random;
  private engine: MersenneTwister19937;
  
  constructor(seed?: number) {
    this.engine = seed !== undefined 
      ? MersenneTwister19937.seed(seed)
      : MersenneTwister19937.autoSeed();
    this.random = new Random(this.engine);
  }
  
  /**
   * Reset the RNG with a new seed
   */
  setSeed(seed: number): void {
    this.engine = MersenneTwister19937.seed(seed);
    this.random = new Random(this.engine);
  }
  
  /**
   * Uniform random in [0, 1)
   */
  uniform(): number {
    return this.random.real(0, 1, false);
  }
  
  /**
   * Integer in range [min, max] inclusive
   */
  integer(min: number, max: number): number {
    return this.random.integer(min, max);
  }
  
  /**
   * Standard normal using Box-Muller transform
   * Caches the second value for efficiency
   */
  private normalCache: number | null = null;
  
  normal(): number {
    // Use cached value if available
    if (this.normalCache !== null) {
      const value = this.normalCache;
      this.normalCache = null;
      return value;
    }
    
    // Box-Muller transform generates two values
    const u1 = this.uniform();
    const u2 = this.uniform();
    
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    
    // Cache the second value
    this.normalCache = r * Math.sin(theta);
    
    // Return the first value
    return r * Math.cos(theta);
  }
  
  /**
   * Normal distribution with mean and standard deviation
   */
  normalDistribution(mean: number, stdDev: number): number {
    return mean + stdDev * this.normal();
  }
  
  /**
   * Exponential distribution
   */
  exponential(rate: number = 1): number {
    return -Math.log(1 - this.uniform()) / rate;
  }
  
  /**
   * Gamma distribution using Marsaglia and Tsang's method
   */
  gamma(shape: number, scale: number = 1): number {
    if (shape <= 0 || scale <= 0) {
      throw new Error('Gamma parameters must be positive');
    }
    
    if (shape < 1) {
      // Use Johnk's method for shape < 1
      const u = this.uniform();
      return this.gamma(shape + 1, scale) * Math.pow(u, 1 / shape);
    }
    
    // Marsaglia and Tsang's method for shape >= 1
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x, v;
      
      do {
        x = this.normal();
        v = 1 + c * x;
      } while (v <= 0);
      
      v = v * v * v;
      const u = this.uniform();
      
      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v * scale;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }
  
  /**
   * Beta distribution using gamma ratio
   */
  beta(alpha: number, beta: number): number {
    if (alpha <= 0 || beta <= 0) {
      throw new Error('Beta parameters must be positive');
    }
    
    const x = this.gamma(alpha);
    const y = this.gamma(beta);
    return x / (x + y);
  }
  
  /**
   * Binomial distribution
   */
  binomial(n: number, p: number): number {
    if (n < 0 || n !== Math.floor(n)) {
      throw new Error('n must be a non-negative integer');
    }
    if (p < 0 || p > 1) {
      throw new Error('p must be between 0 and 1');
    }
    
    // Special cases
    if (n === 0 || p === 0) return 0;
    if (p === 1) return n;
    
    // For small n, use direct method
    if (n < 30) {
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (this.uniform() < p) count++;
      }
      return count;
    }
    
    // For large n, check if normal approximation is appropriate
    const mean = n * p;
    const stdDev = Math.sqrt(n * p * (1 - p));
    
    if (mean > 10 && stdDev > 3) {
      // Use normal approximation with continuity correction
      let sample;
      do {
        sample = Math.round(this.normalDistribution(mean, stdDev));
      } while (sample < 0 || sample > n);
      return sample;
    }
    
    // For moderate n or extreme p, use direct method
    let count = 0;
    for (let i = 0; i < n; i++) {
      if (this.uniform() < p) count++;
    }
    return count;
  }
  
  /**
   * Poisson distribution (for future use)
   */
  poisson(lambda: number): number {
    if (lambda <= 0) {
      throw new Error('Lambda must be positive');
    }
    
    if (lambda < 30) {
      // Direct method for small lambda
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      
      do {
        k++;
        p *= this.uniform();
      } while (p > L);
      
      return k - 1;
    } else {
      // For large lambda, use normal approximation
      return Math.max(0, Math.round(this.normalDistribution(lambda, Math.sqrt(lambda))));
    }
  }
  
  /**
   * Sample from discrete distribution with given probabilities
   */
  discrete(probabilities: number[]): number {
    const sum = probabilities.reduce((a, b) => a + b, 0);
    const u = this.uniform() * sum;
    
    let cumsum = 0;
    for (let i = 0; i < probabilities.length; i++) {
      cumsum += probabilities[i];
      if (u <= cumsum) return i;
    }
    
    return probabilities.length - 1;
  }
  
  /**
   * Shuffle array in place (Fisher-Yates)
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.integer(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  
  /**
   * Sample k items from array without replacement
   */
  sample<T>(array: T[], k: number): T[] {
    if (k > array.length) {
      throw new Error('Cannot sample more items than array length');
    }
    
    const indices = Array.from({ length: array.length }, (_, i) => i);
    const shuffled = this.shuffle(indices);
    return shuffled.slice(0, k).map(i => array[i]);
  }
}

// Default RNG instance (unseeded)
export const defaultRNG = new RNG();

// Convenience functions using default RNG
export const uniform = () => defaultRNG.uniform();
export const normal = () => defaultRNG.normal();
export const exponential = (rate?: number) => defaultRNG.exponential(rate);
export const gamma = (shape: number, scale?: number) => defaultRNG.gamma(shape, scale);
export const beta = (alpha: number, beta: number) => defaultRNG.beta(alpha, beta);
export const binomial = (n: number, p: number) => defaultRNG.binomial(n, p);
export const poisson = (lambda: number) => defaultRNG.poisson(lambda);