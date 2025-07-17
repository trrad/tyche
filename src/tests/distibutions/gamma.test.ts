// tests/distributions/Gamma.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { gamma, GammaRV } from '../../../src/core/distributions/Gamma';
import { RandomVariable } from '../../../src/core/RandomVariable';
import { ComputationGraph } from '../../../src/core/ComputationGraph';
import { RNG } from '../../../src/core/math/random';

describe('Gamma Distribution', () => {
  let graph: ComputationGraph;
  let rng: RNG;
  
  beforeEach(() => {
    graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);
    rng = new RNG(42); // Fixed seed for reproducibility
  });
  
  describe('Parameter Validation', () => {
    it('should accept valid positive parameters', () => {
      expect(() => gamma(2, 3)).not.toThrow();
      expect(() => gamma(0.5, 1)).not.toThrow();
      expect(() => gamma(10, 0.1)).not.toThrow();
    });
    
    it('should throw for non-positive shape', () => {
      const dist = gamma(-1, 2);
      expect(() => dist.forward()).toThrow('Invalid Gamma parameters');
      expect(() => dist.sample()).toThrow('Invalid Gamma parameters');
    });
    
    it('should throw for non-positive scale', () => {
      const dist = gamma(2, -1);
      expect(() => dist.forward()).toThrow('Invalid Gamma parameters');
      expect(() => dist.sample()).toThrow('Invalid Gamma parameters');
    });
    
    it('should throw for zero parameters', () => {
      const dist1 = gamma(0, 2);
      const dist2 = gamma(2, 0);
      expect(() => dist1.sample()).toThrow();
      expect(() => dist2.sample()).toThrow();
    });
  });
  
  describe('Mean and Variance', () => {
    it('should compute correct mean', () => {
      const testCases = [
        { shape: 1, scale: 1, expectedMean: 1 },
        { shape: 2, scale: 3, expectedMean: 6 },
        { shape: 0.5, scale: 4, expectedMean: 2 },
        { shape: 10, scale: 0.1, expectedMean: 1 }
      ];
      
      testCases.forEach(({ shape, scale, expectedMean }) => {
        const dist = gamma(shape, scale);
        expect(dist.mean().forward()).toBeCloseTo(expectedMean);
      });
    });
    
    it('should compute correct variance', () => {
      const testCases = [
        { shape: 1, scale: 1, expectedVar: 1 },
        { shape: 2, scale: 3, expectedVar: 18 }, // 2 * 3²
        { shape: 4, scale: 0.5, expectedVar: 1 }, // 4 * 0.5²
      ];
      
      testCases.forEach(({ shape, scale, expectedVar }) => {
        const dist = gamma(shape, scale);
        expect(dist.variance().forward()).toBeCloseTo(expectedVar);
      });
    });
    
    it('should compute correct mode', () => {
      // Mode = (α - 1) * θ for α >= 1
      const dist1 = gamma(3, 2);
      expect(dist1.mode().forward()).toBeCloseTo(4); // (3-1) * 2
      
      const dist2 = gamma(1, 5);
      expect(dist2.mode().forward()).toBeCloseTo(0); // (1-1) * 5
      
      // Mode = 0 for α < 1
      const dist3 = gamma(0.5, 2);
      expect(dist3.mode().forward()).toBe(0);
    });
  });
  
  describe('Sampling', () => {
    it('should generate positive samples', () => {
      const dist = gamma(2, 3, rng);
      const samples = dist.sampleMultiple(100);
      
      samples.forEach(sample => {
        expect(sample).toBeGreaterThan(0);
      });
    });
    
    it('should generate samples with correct mean and variance', () => {
      const shape = 3;
      const scale = 2;
      const dist = gamma(shape, scale, rng);
      const samples = dist.sampleMultiple(10000);
      
      const sampleMean = samples.reduce((a, b) => a + b) / samples.length;
      const expectedMean = shape * scale;
      
      const sampleVar = samples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / (samples.length - 1);
      const expectedVar = shape * scale * scale;
      
      // With 10k samples, should be within 5% of true values
      expect(sampleMean).toBeCloseTo(expectedMean, 1);
      expect(sampleVar).toBeCloseTo(expectedVar, 0);
    });
    
    it('should handle shape < 1 (using Johnk method)', () => {
      const dist = gamma(0.5, 2, rng);
      const samples = dist.sampleMultiple(100);
      
      samples.forEach(sample => {
        expect(sample).toBeGreaterThan(0);
        expect(sample).toBeLessThan(Infinity);
      });
    });
    
    it('should handle shape >= 1 (using Marsaglia-Tsang)', () => {
      const dist = gamma(2.5, 1.5, rng);
      const samples = dist.sampleMultiple(100);
      
      samples.forEach(sample => {
        expect(sample).toBeGreaterThan(0);
        expect(sample).toBeLessThan(Infinity);
      });
    });
    
    it('should work with custom RNG', () => {
      let counter = 0;
      const customRng = () => {
        counter++;
        return (counter * 0.123) % 1;
      };
      
      const dist = gamma(2, 1);
      const sample = dist.sample(customRng);
      expect(sample).toBeGreaterThan(0);
      expect(counter).toBeGreaterThan(0); // Ensure custom RNG was used
    });
  });
  
  describe('Log Probability', () => {
    it('should return -Infinity for non-positive values', () => {
      const dist = gamma(2, 3);
      expect(dist.logProb(0).forward()).toBe(-Infinity);
      expect(dist.logProb(-1).forward()).toBe(-Infinity);
    });
    
    it('should compute correct log probabilities', () => {
      const dist = gamma(2, 3); // shape=2, scale=3
      
      // For Gamma(2, 3), mode is at (2-1)*3 = 3
      // PDF should be higher near the mode
      const logProb1 = dist.logProb(1).forward();
      const logProb2 = dist.logProb(3).forward();
      const logProb3 = dist.logProb(10).forward();
      
      expect(logProb2).toBeGreaterThan(logProb1);
      expect(logProb2).toBeGreaterThan(logProb3);
      
      // All should be finite negative numbers
      expect(logProb1).toBeLessThan(0);
      expect(logProb2).toBeLessThan(0);
      expect(logProb3).toBeLessThan(0);
    });
    
    it('should handle extreme shape values', () => {
      // Very small shape - highly skewed
      const dist1 = gamma(0.1, 1);
      expect(dist1.logProb(0.01).forward()).toBeLessThan(Infinity);
      
      // Large shape - more symmetric
      const dist2 = gamma(50, 1);
      expect(dist2.logProb(50).forward()).toBeLessThan(Infinity);
    });
  });
  
  describe('PDF', () => {
    it('should compute correct probability density', () => {
      const dist = gamma(2, 1); // Exponential-like
      
      // Should integrate to approximately 1
      let integral = 0;
      const dx = 0.01;
      for (let x = 0; x < 20; x += dx) {
        integral += dist.pdf(x) * dx;
      }
      expect(integral).toBeCloseTo(1, 1);
    });
    
    it('should return 0 for non-positive values', () => {
      const dist = gamma(2, 3);
      expect(dist.pdf(0)).toBe(0);
      expect(dist.pdf(-1)).toBe(0);
    });
  });
  
  describe('Automatic Differentiation', () => {
    it('should compute gradients w.r.t. shape', () => {
      const shape = RandomVariable.parameter(2, 'shape');
      const scale = RandomVariable.constant(3);
      const dist = new GammaRV(shape, scale);
      
      const loss = dist.logProb(5);
      const tape = loss.backward();
      const shapeGrad = tape.get(shape.getNode());
      
      expect(shapeGrad).toBeLessThan(Infinity);
      expect(shapeGrad).not.toBe(0);
    });
    
    it('should compute gradients w.r.t. scale', () => {
      const shape = RandomVariable.constant(2);
      const scale = RandomVariable.parameter(3, 'scale');
      const dist = new GammaRV(shape, scale);
      
      const loss = dist.logProb(5);
      const tape = loss.backward();
      const scaleGrad = tape.get(scale.getNode());

      
      expect(scaleGrad).toBeLessThan(Infinity);
      expect(scaleGrad).not.toBe(0);
    });
    
    it('should handle gradient flow through mean computation', () => {
      const shape = RandomVariable.parameter(2);
      const scale = RandomVariable.parameter(3);
      const dist = new GammaRV(shape, scale);
      
      const mean = dist.mean();
      const loss = mean.pow(2);
      
      const tape = loss.backward();
      const shapeGrad = tape.get(shape.getNode());
      const scaleGrad = tape.get(scale.getNode());
      
      // d(loss)/d(shape) = 2 * mean * scale = 2 * 6 * 3 = 36
      expect(shapeGrad).toBeCloseTo(36);
      
      // d(loss)/d(scale) = 2 * mean * shape = 2 * 6 * 2 = 24
      expect(scaleGrad).toBeCloseTo(24);
    });
  });
  
  describe('Special Cases', () => {
    it('should handle Exponential as Gamma(1, scale)', () => {
      // Exponential(λ) = Gamma(1, 1/λ)
      const rate = 2;
      const dist = gamma(1, 1/rate, rng);
      
      // Should have mean = 1/rate
      expect(dist.mean().forward()).toBeCloseTo(1/rate);
      
      // Should have variance = 1/rate²
      expect(dist.variance().forward()).toBeCloseTo(1/(rate * rate));
    });
    
    it('should handle Chi-squared as Gamma(k/2, 2)', () => {
      // Chi-squared(k) = Gamma(k/2, 2)
      const k = 4; // degrees of freedom
      const dist = gamma(k/2, 2);
      
      // Should have mean = k
      expect(dist.mean().forward()).toBeCloseTo(k);
      
      // Should have variance = 2k
      expect(dist.variance().forward()).toBeCloseTo(2 * k);
    });
  });
  
  describe('Rate Parameter', () => {
    it('should correctly compute rate from scale', () => {
      const dist = gamma(2, 4);
      expect(dist.rate().forward()).toBeCloseTo(0.25); // 1/4
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle very large shape parameters', () => {
      const dist = gamma(100, 0.1, rng);
      const sample = dist.sample();
      expect(sample).toBeLessThan(Infinity);
      expect(sample).toBeGreaterThan(0);
    });
    
    it('should handle very small shape parameters', () => {
      const dist = gamma(0.01, 10, rng);
      const sample = dist.sample();
      expect(sample).toBeLessThan(Infinity);
      expect(sample).toBeGreaterThan(0);
    });
  });
});