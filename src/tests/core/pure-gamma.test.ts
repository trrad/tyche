/**
 * Tests for pure Gamma distribution implementation
 */

import { describe, it, expect } from 'vitest';
import { GammaDistribution } from '../../core/distributions/GammaDistribution';
import { RNG } from '../../core/utils/math/random';

describe('GammaDistribution', () => {
  describe('constructor', () => {
    it('should create a valid Gamma distribution', () => {
      const gamma = new GammaDistribution(2, 1.5);
      expect(gamma.getParameters()).toEqual({ shape: 2, scale: 1.5 });
    });

    it('should throw error for invalid parameters', () => {
      expect(() => new GammaDistribution(0, 1)).toThrow('Invalid Gamma parameters');
      expect(() => new GammaDistribution(1, 0)).toThrow('Invalid Gamma parameters');
      expect(() => new GammaDistribution(-1, 1)).toThrow('Invalid Gamma parameters');
      expect(() => new GammaDistribution(1, -1)).toThrow('Invalid Gamma parameters');
    });
  });

  describe('mathematical properties', () => {
    it('should compute correct mean', () => {
      const gamma = new GammaDistribution(2, 3);
      // Mean = α * θ = 2 * 3 = 6
      expect(gamma.mean()).toBe(6);
    });

    it('should compute correct variance', () => {
      const gamma = new GammaDistribution(2, 3);
      // Variance = α * θ² = 2 * 3² = 18
      expect(gamma.variance()).toBe(18);
    });

    it('should compute correct standard deviation', () => {
      const gamma = new GammaDistribution(2, 3);
      // StdDev = √(variance) = √18 ≈ 4.2426
      expect(gamma.stdDev()).toBeCloseTo(Math.sqrt(18), 6);
    });

    it('should compute correct mode', () => {
      const gamma1 = new GammaDistribution(2, 3);
      // Mode = (α - 1) * θ = (2 - 1) * 3 = 3 (for α ≥ 1)
      expect(gamma1.mode()).toBe(3);

      const gamma2 = new GammaDistribution(0.5, 2);
      // Mode = 0 for α < 1
      expect(gamma2.mode()).toBe(0);
    });

    it('should return correct support', () => {
      const gamma = new GammaDistribution(2, 1);
      expect(gamma.support()).toEqual({ min: 0, max: Infinity });
    });

    it('should compute rate parameter', () => {
      const gamma = new GammaDistribution(2, 4);
      // Rate = 1/scale = 1/4 = 0.25
      expect(gamma.rate()).toBe(0.25);
    });

    it('should return shape-rate parameterization', () => {
      const gamma = new GammaDistribution(3, 2);
      expect(gamma.getShapeRate()).toEqual({ shape: 3, rate: 0.5 });
    });
  });

  describe('pdf and logPdf', () => {
    it('should compute PDF correctly', () => {
      const gamma = new GammaDistribution(2, 1);

      // PDF should be 0 for negative values
      expect(gamma.pdf(-1)).toBe(0);
      expect(gamma.pdf(0)).toBe(0);

      // PDF should be positive for positive values
      expect(gamma.pdf(1)).toBeGreaterThan(0);
      expect(gamma.pdf(2)).toBeGreaterThan(0);
    });

    it('should compute logPdf correctly', () => {
      const gamma = new GammaDistribution(2, 1);

      // logPdf should be -Infinity for non-positive values
      expect(gamma.logPdf(-1)).toBe(-Infinity);
      expect(gamma.logPdf(0)).toBe(-Infinity);

      // pdf and logPdf should be consistent for positive values
      const x = 1.5;
      expect(gamma.pdf(x)).toBeCloseTo(Math.exp(gamma.logPdf(x)), 10);
    });

    it('should handle different parameter values', () => {
      const gamma1 = new GammaDistribution(1, 1); // Exponential(1)
      const gamma2 = new GammaDistribution(3, 1); // Different shape

      // PDF at x=1 should be different for different parameters
      expect(gamma1.pdf(1)).not.toBeCloseTo(gamma2.pdf(1), 3);
    });
  });

  describe('cdf', () => {
    it('should compute CDF correctly at boundaries', () => {
      const gamma = new GammaDistribution(2, 1);

      expect(gamma.cdf(-1)).toBe(0);
      expect(gamma.cdf(0)).toBe(0);

      // CDF should approach 1 for large values
      expect(gamma.cdf(100)).toBeCloseTo(1, 3);
    });

    it('should be monotonic increasing', () => {
      const gamma = new GammaDistribution(2, 1);

      const x1 = 0.5;
      const x2 = 1.0;
      const x3 = 2.0;

      expect(gamma.cdf(x1)).toBeLessThan(gamma.cdf(x2));
      expect(gamma.cdf(x2)).toBeLessThan(gamma.cdf(x3));
    });

    it('should give reasonable values for known cases', () => {
      // Exponential(1) case: Gamma(1, 1)
      const exponential = new GammaDistribution(1, 1);

      // For exponential(1), CDF(x) = 1 - e^(-x)
      // So CDF(1) = 1 - e^(-1) ≈ 0.632
      expect(exponential.cdf(1)).toBeCloseTo(0.632, 2);
    });
  });

  describe('sampling', () => {
    it('should generate samples in correct range', () => {
      const gamma = new GammaDistribution(2, 1);
      const rng = new RNG(12345);

      // Single sample
      const sample = gamma.sample(1, rng) as number;
      expect(sample).toBeGreaterThan(0);

      // Multiple samples
      const samples = gamma.sample(100, rng) as number[];
      expect(samples).toHaveLength(100);

      for (const s of samples) {
        expect(s).toBeGreaterThan(0);
      }
    });

    it('should generate samples with approximately correct mean', () => {
      const gamma = new GammaDistribution(3, 2);
      const rng = new RNG(12345);

      const samples = gamma.sample(10000, rng) as number[];
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;

      // Should be close to theoretical mean (6)
      expect(sampleMean).toBeCloseTo(gamma.mean(), 0.5);
    });

    it('should generate samples with approximately correct variance', () => {
      const gamma = new GammaDistribution(4, 1.5);
      const rng = new RNG(12345);

      const samples = gamma.sample(10000, rng) as number[];
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
      const sampleVariance =
        samples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / (samples.length - 1);

      // Should be reasonably close to theoretical variance (sampling variation is expected)
      const expectedVariance = gamma.variance();
      const difference = Math.abs(sampleVariance - expectedVariance);
      expect(difference).toBeLessThan(expectedVariance * 0.1); // Within 10% is reasonable for sampling
    });
  });

  describe('special cases', () => {
    it('should handle exponential distribution case (shape=1)', () => {
      const exponential = new GammaDistribution(1, 2);

      // For exponential with rate λ=1/2 (scale=2):
      // Mean = 2, Variance = 4
      expect(exponential.mean()).toBe(2);
      expect(exponential.variance()).toBe(4);
      expect(exponential.mode()).toBe(0);
    });

    it('should handle shape close to 1', () => {
      const gamma = new GammaDistribution(1.01, 1);

      // Should not throw errors and give reasonable values
      expect(gamma.pdf(1)).toBeGreaterThan(0);
      expect(gamma.cdf(1)).toBeGreaterThan(0);
      expect(gamma.cdf(1)).toBeLessThan(1);
    });
  });

  describe('parameterization consistency', () => {
    it('should be consistent between shape-scale and shape-rate', () => {
      const shape = 3;
      const scale = 2;
      const rate = 1 / scale;

      const gammaScaleParam = new GammaDistribution(shape, scale);
      const shapeRate = gammaScaleParam.getShapeRate();

      expect(shapeRate.shape).toBe(shape);
      expect(shapeRate.rate).toBeCloseTo(rate, 10);
    });
  });

  describe('direct construction', () => {
    it('should create Gamma distribution via constructor', () => {
      const gamma = new GammaDistribution(2.5, 1.5);
      expect(gamma.getParameters()).toEqual({ shape: 2.5, scale: 1.5 });
      expect(gamma.mean()).toBeCloseTo(3.75, 6);
    });
  });
});
