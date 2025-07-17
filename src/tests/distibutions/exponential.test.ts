// tests/distributions/Exponential.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { exponential, ExponentialRV } from '../../../src/core/distributions/Exponential';
import { RandomVariable } from '../../../src/core/RandomVariable';
import { ComputationGraph } from '../../../src/core/ComputationGraph';
import { RNG } from '../../../src/core/math/random';

describe('Exponential Distribution', () => {
  let graph: ComputationGraph;
  let rng: RNG;
  
  beforeEach(() => {
    graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);
    rng = new RNG(42); // Fixed seed for reproducibility
  });
  
  describe('Parameter Validation', () => {
    it('should accept valid positive rates', () => {
      expect(() => exponential(1)).not.toThrow();
      expect(() => exponential(0.5)).not.toThrow();
      expect(() => exponential(10)).not.toThrow();
    });
    
    it('should throw for non-positive rate', () => {
      const dist1 = exponential(-1);
      const dist2 = exponential(0);
      
      expect(() => dist1.sample()).toThrow('Invalid Exponential rate');
      expect(() => dist2.sample()).toThrow('Invalid Exponential rate');
    });
  });
  
  describe('Mean and Variance', () => {
    it('should compute correct mean', () => {
      const testCases = [
        { rate: 1, expectedMean: 1 },
        { rate: 2, expectedMean: 0.5 },
        { rate: 0.1, expectedMean: 10 },
        { rate: 5, expectedMean: 0.2 }
      ];
      
      testCases.forEach(({ rate, expectedMean }) => {
        const dist = exponential(rate);
        expect(dist.mean().forward()).toBeCloseTo(expectedMean);
      });
    });
    
    it('should compute correct variance', () => {
      const testCases = [
        { rate: 1, expectedVar: 1 },      // 1/1²
        { rate: 2, expectedVar: 0.25 },   // 1/2²
        { rate: 0.5, expectedVar: 4 },    // 1/0.5²
      ];
      
      testCases.forEach(({ rate, expectedVar }) => {
        const dist = exponential(rate);
        expect(dist.variance().forward()).toBeCloseTo(expectedVar);
      });
    });
    
    it('should compute correct standard deviation', () => {
      const dist = exponential(2);
      expect(dist.stdDev().forward()).toBeCloseTo(0.5); // 1/2
    });
    
    it('should have mode at 0', () => {
      const dist = exponential(3);
      expect(dist.mode().forward()).toBe(0);
    });
  });
  
  describe('Sampling', () => {
    it('should generate non-negative samples', () => {
      const dist = exponential(2, rng);
      const samples = dist.sampleMultiple(100);
      
      samples.forEach(sample => {
        expect(sample).toBeGreaterThanOrEqual(0);
      });
    });
    
    it('should generate samples with correct mean and variance', () => {
      const rate = 2;
      const dist = exponential(rate, rng);
      const samples = dist.sampleMultiple(10000);
      
      const sampleMean = samples.reduce((a, b) => a + b) / samples.length;
      const expectedMean = 1 / rate;
      
      const sampleVar = samples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / (samples.length - 1);
      const expectedVar = 1 / (rate * rate);
      
      // With 10k samples, should be within 5% of true values
      expect(sampleMean).toBeCloseTo(expectedMean, 1);
      expect(sampleVar).toBeCloseTo(expectedVar, 1);
    });
    
    it('should use inverse transform sampling with custom RNG', () => {
      let counter = 0;
      const customRng = () => {
        counter++;
        return 0.5; // Always return 0.5
      };
      
      const rate = 2;
      const dist = exponential(rate);
      const sample = dist.sample(customRng);
      
      // For U = 0.5, X = -log(0.5) / 2 ≈ 0.3466
      expect(sample).toBeCloseTo(-Math.log(0.5) / rate, 6);
      expect(counter).toBe(1);
    });
  });
  
  describe('Log Probability', () => {
    it('should return -Infinity for negative values', () => {
      const dist = exponential(2);
      expect(dist.logProb(-1).forward()).toBe(-Infinity);
      expect(dist.logProb(-0.001).forward()).toBe(-Infinity);
    });
    
    it('should compute correct log probabilities', () => {
      const rate = 2;
      const dist = exponential(rate);
      
      // log p(x) = log(λ) - λx
      // For x = 0: log(2) - 0 = log(2)
      expect(dist.logProb(0).forward()).toBeCloseTo(Math.log(rate));
      
      // For x = 1: log(2) - 2*1 = log(2) - 2
      expect(dist.logProb(1).forward()).toBeCloseTo(Math.log(rate) - rate);
      
      // For x = 0.5: log(2) - 2*0.5 = log(2) - 1
      expect(dist.logProb(0.5).forward()).toBeCloseTo(Math.log(rate) - 1);
    });
    
    it('should decrease linearly with x', () => {
      const dist = exponential(3);
      const logProb1 = dist.logProb(1).forward();
      const logProb2 = dist.logProb(2).forward();
      const logProb3 = dist.logProb(3).forward();
      
      // Differences should be constant (equal to -rate)
      expect(logProb2 - logProb1).toBeCloseTo(-3);
      expect(logProb3 - logProb2).toBeCloseTo(-3);
    });
  });
  
  describe('PDF and CDF', () => {
    it('should compute correct PDF', () => {
      const rate = 2;
      const dist = exponential(rate);
      
      // PDF at 0 should equal rate
      expect(dist.pdf(0)).toBeCloseTo(rate);
      
      // PDF should decay exponentially
      expect(dist.pdf(1)).toBeCloseTo(rate * Math.exp(-rate));
      
      // Should return 0 for negative values
      expect(dist.pdf(-1)).toBe(0);
    });
    
    it('should compute correct CDF', () => {
      const rate = 1;
      const dist = exponential(rate);
      
      // CDF at 0 should be 0
      expect(dist.cdf(0)).toBe(0);
      
      // CDF at mean should be 1 - e^(-1) ≈ 0.632
      expect(dist.cdf(1)).toBeCloseTo(1 - Math.exp(-1));
      
      // Should return 0 for negative values
      expect(dist.cdf(-1)).toBe(0);
      
      // Should approach 1 for large values
      expect(dist.cdf(10)).toBeCloseTo(1, 4);
    });
    
    it('should satisfy CDF properties', () => {
      const dist = exponential(2);
      
      // Monotonic increasing
      expect(dist.cdf(1)).toBeLessThan(dist.cdf(2));
      expect(dist.cdf(2)).toBeLessThan(dist.cdf(3));
      
      // Bounded between 0 and 1
      for (let x = 0; x < 10; x += 0.5) {
        const cdfVal = dist.cdf(x);
        expect(cdfVal).toBeGreaterThanOrEqual(0);
        expect(cdfVal).toBeLessThanOrEqual(1);
      }
    });
  });
  
  describe('Inverse CDF', () => {
    it('should compute correct quantiles', () => {
      const rate = 2;
      const dist = exponential(rate);
      
      // Q(0) = 0
      expect(dist.inverseCDF(0)).toBe(0);
      
      // Q(1) = ∞
      expect(dist.inverseCDF(1)).toBe(Infinity);
      
      // Q(0.5) = -log(0.5) / 2 = log(2) / 2
      expect(dist.inverseCDF(0.5)).toBeCloseTo(Math.log(2) / rate);
      
      // Verify inverse relationship
      const p = 0.7;
      const x = dist.inverseCDF(p);
      expect(dist.cdf(x)).toBeCloseTo(p);
    });
    
    it('should throw for invalid probabilities', () => {
      const dist = exponential(1);
      expect(() => dist.inverseCDF(-0.1)).toThrow('Invalid probability');
      expect(() => dist.inverseCDF(1.1)).toThrow('Invalid probability');
    });
  });
  
  describe('Memoryless Property', () => {
    it('should satisfy memoryless property', () => {
      const dist = exponential(1);
      
      // P(X > s + t | X > s) = P(X > t)
      const s = 2;
      const t = 3;
      
      const probAfterT = dist.memorylessProb(s, t);
      const probGreaterThanT = 1 - dist.cdf(t);
      
      expect(probAfterT).toBeCloseTo(probGreaterThanT);
    });
  });
  
  describe('Automatic Differentiation', () => {
    it('should compute gradients w.r.t. rate', () => {
      const rate = RandomVariable.parameter(2, 'rate');
      const dist = new ExponentialRV(rate);
      
      const loss = dist.logProb(1);
      const tape = loss.backward();
      const rateGrad = tape.get(rate.getNode());
      
      expect(rateGrad).toBeDefined();
      expect(rateGrad).not.toBe(0);
    });
    
    it('should handle gradient flow through mean computation', () => {
      const rate = RandomVariable.parameter(2);
      const dist = new ExponentialRV(rate);
      
      const mean = dist.mean();
      const loss = mean.pow(2);
      
      const tape = loss.backward();
      const rateGrad = tape.get(rate.getNode());
      
      // d(loss)/d(rate) = d((1/rate)²)/d(rate) = -2/(rate³)
      // For rate=2: -2/8 = -0.25
      expect(rateGrad).toBeCloseTo(-0.25);
    });
  });
  
  describe('Parameter Access', () => {
    it('should return parameters correctly', () => {
      const rate = RandomVariable.parameter(3);
      const dist = new ExponentialRV(rate);
      
      const params = dist.getParameters();
      expect(params.rate).toBe(rate);
    });
    
    it('should return scale correctly', () => {
      const dist = exponential(4);
      expect(dist.scale().forward()).toBeCloseTo(0.25); // 1/4
    });
  });
  
  describe('Relationship to Gamma', () => {
    it('should have same mean as Gamma(1, 1/rate)', () => {
      const rate = 2;
      const expDist = exponential(rate);
      
      // Exponential(2) should have mean 1/2
      // Gamma(1, 1/2) should also have mean 1 * 0.5 = 0.5
      expect(expDist.mean().forward()).toBeCloseTo(0.5);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle very large rates', () => {
      const dist = exponential(1000, rng);
      const sample = dist.sample();
      expect(sample).toBeDefined();
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThan(0.1); // Should be very small
    });
    
    it('should handle very small rates', () => {
      const dist = exponential(0.001, rng);
      const sample = dist.sample();
      expect(sample).toBeDefined();
      expect(sample).toBeGreaterThanOrEqual(0);
    });
  });
});