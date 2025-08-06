/**
 * Tests for pure Normal and HalfNormal distribution implementations
 */

import { describe, it, expect } from 'vitest';
import { NormalDistribution } from '../../core/distributions/NormalDistribution';
import { HalfNormalDistribution } from '../../core/distributions/HalfNormalDistribution';
import { RNG } from '../../core/utils/math/random';

describe('NormalDistribution', () => {
  describe('constructor', () => {
    it('should create a valid Normal distribution', () => {
      const normal = new NormalDistribution(0, 1);
      expect(normal.getParameters()).toEqual({ mean: 0, stdDev: 1 });
    });

    it('should throw error for invalid parameters', () => {
      expect(() => new NormalDistribution(0, 0)).toThrow('Invalid Normal parameters');
      expect(() => new NormalDistribution(0, -1)).toThrow('Invalid Normal parameters');
    });
  });

  describe('mathematical properties', () => {
    it('should compute correct mean', () => {
      const normal = new NormalDistribution(5, 2);
      expect(normal.mean()).toBe(5);
    });

    it('should compute correct variance', () => {
      const normal = new NormalDistribution(5, 2);
      // Variance = σ² = 2² = 4
      expect(normal.variance()).toBe(4);
    });

    it('should compute correct mode', () => {
      const normal = new NormalDistribution(5, 2);
      // Mode equals mean for normal distribution
      expect(normal.mode()).toBe(5);
    });

    it('should return correct support', () => {
      const normal = new NormalDistribution(0, 1);
      expect(normal.support()).toEqual({ min: -Infinity, max: Infinity });
    });

    it('should compute standard deviation', () => {
      const normal = new NormalDistribution(0, 2.5);
      expect(normal.stdDev()).toBe(2.5);
    });

    it('should compute precision', () => {
      const normal = new NormalDistribution(0, 2);
      // Precision = 1/variance = 1/4 = 0.25
      expect(normal.precision()).toBe(0.25);
    });
  });

  describe('pdf and logPdf', () => {
    it('should compute PDF correctly for standard normal', () => {
      const normal = new NormalDistribution(0, 1);

      // PDF at mean should be 1/sqrt(2π) ≈ 0.3989
      expect(normal.pdf(0)).toBeCloseTo(0.3989422804, 5);

      // PDF should be symmetric
      expect(normal.pdf(1)).toBeCloseTo(normal.pdf(-1), 10);
    });

    it('should compute logPdf correctly', () => {
      const normal = new NormalDistribution(0, 1);

      // logPdf and pdf should be consistent
      const x = 1.5;
      expect(normal.pdf(x)).toBeCloseTo(Math.exp(normal.logPdf(x)), 10);
    });

    it('should handle different parameters', () => {
      const normal = new NormalDistribution(10, 5);

      // PDF should be maximized at the mean
      const meanPdf = normal.pdf(10);
      const offMeanPdf = normal.pdf(15);
      expect(meanPdf).toBeGreaterThan(offMeanPdf);
    });
  });

  describe('cdf and quantile', () => {
    it('should compute CDF correctly for standard normal', () => {
      const normal = new NormalDistribution(0, 1);

      // CDF at mean should be 0.5
      expect(normal.cdf(0)).toBeCloseTo(0.5, 8);

      // CDF should be monotonic
      expect(normal.cdf(-1)).toBeLessThan(normal.cdf(0));
      expect(normal.cdf(0)).toBeLessThan(normal.cdf(1));
    });

    it('should compute quantiles correctly', () => {
      const normal = new NormalDistribution(0, 1);

      // Median (50th percentile) should equal mean
      expect(normal.quantile(0.5)).toBeCloseTo(0, 10);

      // CDF and quantile should be inverses
      const p = 0.75;
      const q = normal.quantile(p);
      expect(normal.cdf(q)).toBeCloseTo(p, 4);
    });

    it('should handle edge cases', () => {
      const normal = new NormalDistribution(0, 1);

      expect(normal.quantile(0)).toBe(-Infinity);
      expect(normal.quantile(1)).toBe(Infinity);
    });
  });

  describe('sampling', () => {
    it('should generate samples in reasonable range', () => {
      const normal = new NormalDistribution(0, 1);
      const rng = new RNG(12345);

      // Single sample
      const sample = normal.sample(1, rng) as number;
      expect(typeof sample).toBe('number');

      // Multiple samples
      const samples = normal.sample(100, rng) as number[];
      expect(samples).toHaveLength(100);
    });

    it('should generate samples with approximately correct mean', () => {
      const normal = new NormalDistribution(5, 2);
      const rng = new RNG(12345);

      const samples = normal.sample(10000, rng) as number[];
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;

      // Should be close to theoretical mean
      expect(sampleMean).toBeCloseTo(normal.mean(), 1);
    });
  });

  describe('utility functions', () => {
    it('should standardize values correctly', () => {
      const normal = new NormalDistribution(10, 5);

      // Standardizing the mean should give 0
      expect(normal.standardize(10)).toBe(0);

      // Standardizing mean + 1 stddev should give 1
      expect(normal.standardize(15)).toBe(1);

      // Standardizing mean - 1 stddev should give -1
      expect(normal.standardize(5)).toBe(-1);
    });
  });

  describe('direct construction', () => {
    it('should create Normal distribution via constructor', () => {
      const normal = new NormalDistribution(3, 1.5);
      expect(normal.getParameters()).toEqual({ mean: 3, stdDev: 1.5 });
    });

    it('should create Standard Normal via constructor', () => {
      const normal = new NormalDistribution(0, 1);
      expect(normal.getParameters()).toEqual({ mean: 0, stdDev: 1 });
    });
  });
});

describe('HalfNormalDistribution', () => {
  describe('constructor', () => {
    it('should create a valid HalfNormal distribution', () => {
      const halfNormal = new HalfNormalDistribution(1);
      expect(halfNormal.getParameters()).toEqual({ stdDev: 1 });
    });

    it('should throw error for invalid parameters', () => {
      expect(() => new HalfNormalDistribution(0)).toThrow('Invalid HalfNormal parameters');
      expect(() => new HalfNormalDistribution(-1)).toThrow('Invalid HalfNormal parameters');
    });
  });

  describe('mathematical properties', () => {
    it('should compute correct mean', () => {
      const halfNormal = new HalfNormalDistribution(1);
      // Mean = σ * sqrt(2/π) ≈ 1 * 0.7978845608
      expect(halfNormal.mean()).toBeCloseTo(0.7978845608, 6);
    });

    it('should compute correct variance', () => {
      const halfNormal = new HalfNormalDistribution(1);
      // Variance = σ² * (1 - 2/π) ≈ 1 * 0.3633802277
      expect(halfNormal.variance()).toBeCloseTo(0.3633802277, 6);
    });

    it('should compute correct mode', () => {
      const halfNormal = new HalfNormalDistribution(2);
      // Mode is always 0 for half-normal
      expect(halfNormal.mode()).toBe(0);
    });

    it('should return correct support', () => {
      const halfNormal = new HalfNormalDistribution(1);
      expect(halfNormal.support()).toEqual({ min: 0, max: Infinity });
    });
  });

  describe('pdf and logPdf', () => {
    it('should compute PDF correctly', () => {
      const halfNormal = new HalfNormalDistribution(1);

      // PDF should be 0 for negative values
      expect(halfNormal.pdf(-1)).toBe(0);
      expect(halfNormal.pdf(-0.1)).toBe(0);

      // PDF should be positive for non-negative values
      expect(halfNormal.pdf(0)).toBeGreaterThan(0);
      expect(halfNormal.pdf(1)).toBeGreaterThan(0);

      // PDF should be maximized at 0
      expect(halfNormal.pdf(0)).toBeGreaterThan(halfNormal.pdf(1));
    });

    it('should compute logPdf correctly', () => {
      const halfNormal = new HalfNormalDistribution(1);

      // logPdf should be -Infinity for negative values
      expect(halfNormal.logPdf(-1)).toBe(-Infinity);

      // pdf and logPdf should be consistent for positive values
      const x = 0.5;
      expect(halfNormal.pdf(x)).toBeCloseTo(Math.exp(halfNormal.logPdf(x)), 10);
    });
  });

  describe('cdf', () => {
    it('should compute CDF correctly', () => {
      const halfNormal = new HalfNormalDistribution(1);

      // CDF should be 0 for negative values
      expect(halfNormal.cdf(-1)).toBe(0);
      expect(halfNormal.cdf(0)).toBe(0);

      // CDF should be monotonic increasing for positive values
      expect(halfNormal.cdf(0.5)).toBeLessThan(halfNormal.cdf(1));
      expect(halfNormal.cdf(1)).toBeLessThan(halfNormal.cdf(2));
    });
  });

  describe('sampling', () => {
    it('should generate non-negative samples', () => {
      const halfNormal = new HalfNormalDistribution(1);
      const rng = new RNG(12345);

      // Single sample
      const sample = halfNormal.sample(1, rng) as number;
      expect(sample).toBeGreaterThanOrEqual(0);

      // Multiple samples
      const samples = halfNormal.sample(100, rng) as number[];
      expect(samples).toHaveLength(100);

      for (const s of samples) {
        expect(s).toBeGreaterThanOrEqual(0);
      }
    });

    it('should generate samples with approximately correct mean', () => {
      const halfNormal = new HalfNormalDistribution(2);
      const rng = new RNG(12345);

      const samples = halfNormal.sample(10000, rng) as number[];
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;

      // Should be close to theoretical mean
      expect(sampleMean).toBeCloseTo(halfNormal.mean(), 1);
    });
  });

  describe('direct construction', () => {
    it('should create HalfNormal distribution via constructor', () => {
      const halfNormal = new HalfNormalDistribution(1.5);
      expect(halfNormal.getParameters()).toEqual({ stdDev: 1.5 });
    });
  });
});
