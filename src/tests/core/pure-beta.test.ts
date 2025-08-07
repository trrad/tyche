/**
 * Tests for pure Beta distribution implementation
 */

import { describe, it, expect } from 'vitest';
import { BetaDistribution } from '../../core/distributions/BetaDistribution';
import { RNG } from '../../core/utils/math/random';

describe('BetaDistribution', () => {
  describe('constructor', () => {
    it('should create a valid Beta distribution', () => {
      const beta = new BetaDistribution(2, 3);
      expect(beta.getParameters()).toEqual({ alpha: 2, beta: 3 });
    });

    it('should throw error for invalid parameters', () => {
      expect(() => new BetaDistribution(0, 1)).toThrow('Invalid Beta parameters');
      expect(() => new BetaDistribution(1, -1)).toThrow('Invalid Beta parameters');
      expect(() => new BetaDistribution(-1, 1)).toThrow('Invalid Beta parameters');
    });
  });

  describe('mathematical properties', () => {
    it('should compute correct mean', () => {
      const beta = new BetaDistribution(2, 3);
      // Mean of Beta(2,3) = 2/(2+3) = 0.4
      expect(beta.mean()).toBeCloseTo(0.4, 6);
    });

    it('should compute correct variance', () => {
      const beta = new BetaDistribution(2, 3);
      // Variance of Beta(2,3) = 2*3/((2+3)²*(2+3+1)) = 6/(25*6) = 0.04
      expect(beta.variance()).toBeCloseTo(0.04, 6);
    });

    it('should compute correct mode', () => {
      const beta = new BetaDistribution(2, 3);
      // Mode of Beta(2,3) = (2-1)/(2+3-2) = 1/3
      expect(beta.mode()).toBeCloseTo(1 / 3, 6);
    });

    it('should return correct support', () => {
      const beta = new BetaDistribution(2, 3);
      expect(beta.support()).toEqual({ min: 0, max: 1 });
    });
  });

  describe('pdf and logPdf', () => {
    it('should compute PDF correctly', () => {
      const beta = new BetaDistribution(2, 3);

      // PDF should be 0 outside [0,1]
      expect(beta.pdf(-0.1)).toBe(0);
      expect(beta.pdf(1.1)).toBe(0);
      expect(beta.pdf(0)).toBe(0);
      expect(beta.pdf(1)).toBe(0);

      // PDF should be positive inside (0,1)
      expect(beta.pdf(0.5)).toBeGreaterThan(0);
    });

    it('should compute logPdf correctly', () => {
      const beta = new BetaDistribution(2, 3);

      // logPdf should be -Infinity outside [0,1]
      expect(beta.logPdf(-0.1)).toBe(-Infinity);
      expect(beta.logPdf(1.1)).toBe(-Infinity);
      expect(beta.logPdf(0)).toBe(-Infinity);
      expect(beta.logPdf(1)).toBe(-Infinity);

      // logPdf should be finite inside (0,1)
      const logPdfValue = beta.logPdf(0.5);
      expect(logPdfValue).not.toBe(Infinity);
      expect(logPdfValue).not.toBe(-Infinity);
      expect(logPdfValue).not.toBe(NaN);

      // pdf and logPdf should be consistent
      const x = 0.3;
      expect(beta.pdf(x)).toBeCloseTo(Math.exp(beta.logPdf(x)), 10);
    });
  });

  describe('cdf', () => {
    it('should compute CDF correctly at boundaries', () => {
      const beta = new BetaDistribution(2, 3);

      expect(beta.cdf(-0.1)).toBe(0);
      expect(beta.cdf(0)).toBe(0);
      expect(beta.cdf(1)).toBe(1);
      expect(beta.cdf(1.1)).toBe(1);
    });

    it('should be monotonic increasing', () => {
      const beta = new BetaDistribution(2, 3);

      const x1 = 0.2;
      const x2 = 0.5;
      const x3 = 0.8;

      expect(beta.cdf(x1)).toBeLessThan(beta.cdf(x2));
      expect(beta.cdf(x2)).toBeLessThan(beta.cdf(x3));
    });
  });

  describe('sampling', () => {
    it('should generate samples in correct range', () => {
      const beta = new BetaDistribution(2, 3);
      const rng = new RNG(12345); // Fixed seed for reproducibility

      // Single sample
      const samples = beta.sample(1, rng);
      expect(samples).toHaveLength(1);
      expect(samples[0]).toBeGreaterThan(0);
      expect(samples[0]).toBeLessThan(1);

      // Multiple samples
      const moreSamples = beta.sample(100, rng);
      expect(moreSamples).toHaveLength(100);

      for (const s of moreSamples) {
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
      }
    });

    it('should generate samples with approximately correct mean', () => {
      const beta = new BetaDistribution(2, 3);
      const rng = new RNG(12345); // Fixed seed

      const samples = beta.sample(10000, rng) as number[];
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;

      // Should be close to theoretical mean (0.4) with large sample
      expect(sampleMean).toBeCloseTo(beta.mean(), 1);
    });
  });

  describe('direct construction', () => {
    it('should create Beta distribution via constructor', () => {
      const beta = new BetaDistribution(2, 3);
      expect(beta.getParameters()).toEqual({ alpha: 2, beta: 3 });
      expect(beta.mean()).toBeCloseTo(0.4, 6);
    });
  });
});
