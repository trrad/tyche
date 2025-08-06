/**
 * Tests for pure LogNormal distribution implementation
 */

import { describe, it, expect } from 'vitest';
import { LogNormalDistribution } from '../../core/distributions/LogNormalDistribution';

describe('LogNormalDistribution', () => {
  describe('constructor', () => {
    it('should create a valid LogNormal distribution', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      expect(lognormal).toBeDefined();
      expect(lognormal.mu()).toBe(0);
      expect(lognormal.sigma()).toBe(1);
    });

    it('should throw error for invalid parameters', () => {
      expect(() => new LogNormalDistribution(0, -1)).toThrow('Invalid LogNormal parameters');
    });

    it('should allow sigma = 0 (degenerate case)', () => {
      const lognormal = new LogNormalDistribution(1, 0);
      expect(lognormal.sigma()).toBe(0);
    });
  });

  describe('mathematical properties', () => {
    it('should compute correct mean', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      // For μ=0, σ=1: mean = exp(0 + 1²/2) = exp(0.5) ≈ 1.649
      expect(lognormal.mean()).toBeCloseTo(Math.exp(0.5), 6);
    });

    it('should compute correct variance', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      // For μ=0, σ=1: var = (exp(1) - 1) * exp(0 + 1) = (e - 1) * e ≈ 4.67
      const expected = (Math.exp(1) - 1) * Math.exp(1);
      expect(lognormal.variance()).toBeCloseTo(expected, 6);
    });

    it('should compute correct mode', () => {
      const lognormal = new LogNormalDistribution(1, 0.5);
      // For μ=1, σ=0.5: mode = exp(1 - 0.5²) = exp(0.75) ≈ 2.117
      expect(lognormal.mode()).toBeCloseTo(Math.exp(0.75), 6);
    });

    it('should compute correct median', () => {
      const lognormal = new LogNormalDistribution(1, 0.5);
      // For μ=1, σ=0.5: median = exp(1) ≈ 2.718
      expect(lognormal.median()).toBeCloseTo(Math.exp(1), 6);
    });

    it('should return correct support', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      const support = lognormal.support();
      expect(support.min).toBe(0);
      expect(support.max).toBe(Infinity);
    });

    it('should compute standard deviation', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      expect(lognormal.stdDev()).toBeCloseTo(Math.sqrt(lognormal.variance()), 6);
    });

    it('should compute coefficient of variation', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      // For σ=1: CV = sqrt(exp(1) - 1) ≈ 1.275
      const expected = Math.sqrt(Math.exp(1) - 1);
      expect(lognormal.coefficientOfVariation()).toBeCloseTo(expected, 6);
    });
  });

  describe('pdf and logPdf', () => {
    it('should compute PDF correctly', () => {
      const lognormal = new LogNormalDistribution(0, 1);

      // PDF at x=1 for standard lognormal should be 1/(1*1*sqrt(2π)) * exp(-0/2) = 1/sqrt(2π)
      expect(lognormal.pdf(1)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 6);

      // PDF should be 0 for x <= 0
      expect(lognormal.pdf(0)).toBe(0);
      expect(lognormal.pdf(-1)).toBe(0);
    });

    it('should compute logPdf correctly', () => {
      const lognormal = new LogNormalDistribution(0, 1);

      // logPdf at x=1 should be log(PDF(1))
      expect(lognormal.logPdf(1)).toBeCloseTo(Math.log(lognormal.pdf(1)), 6);

      // logPdf should be -Infinity for x <= 0
      expect(lognormal.logPdf(0)).toBe(-Infinity);
      expect(lognormal.logPdf(-1)).toBe(-Infinity);
    });

    it('should handle different parameter values', () => {
      const lognormal1 = new LogNormalDistribution(0, 1);
      const lognormal2 = new LogNormalDistribution(1, 0.5);

      // PDF at x=1 should be different for different parameters
      expect(lognormal1.pdf(1)).not.toBeCloseTo(lognormal2.pdf(1), 3);
    });

    it('should handle degenerate case (sigma=0)', () => {
      const lognormal = new LogNormalDistribution(1, 0);
      const pointMass = Math.exp(1);

      expect(lognormal.pdf(pointMass)).toBe(Infinity);
      expect(lognormal.pdf(pointMass + 0.1)).toBe(0);
      expect(lognormal.logPdf(pointMass)).toBe(Infinity);
      expect(lognormal.logPdf(pointMass + 0.1)).toBe(-Infinity);
    });
  });

  describe('cdf and quantile', () => {
    it('should compute CDF correctly at boundaries', () => {
      const lognormal = new LogNormalDistribution(0, 1);

      expect(lognormal.cdf(0)).toBe(0);
      expect(lognormal.cdf(-1)).toBe(0);
    });

    it('should be monotonic increasing', () => {
      const lognormal = new LogNormalDistribution(0, 1);

      const x1 = 0.5;
      const x2 = 1.0;
      const x3 = 2.0;

      expect(lognormal.cdf(x1)).toBeLessThan(lognormal.cdf(x2));
      expect(lognormal.cdf(x2)).toBeLessThan(lognormal.cdf(x3));
    });

    it('should have CDF = 0.5 at median', () => {
      const lognormal = new LogNormalDistribution(1, 0.5);
      const median = lognormal.median();
      expect(lognormal.cdf(median)).toBeCloseTo(0.5, 6);
    });

    it('should have quantile and CDF as inverses', () => {
      const lognormal = new LogNormalDistribution(0, 1);

      // CDF and quantile should be inverses
      const p = 0.75;
      const q = lognormal.quantile(p);
      expect(lognormal.cdf(q)).toBeCloseTo(p, 4);
    });

    it('should handle edge cases for quantile', () => {
      const lognormal = new LogNormalDistribution(0, 1);

      expect(lognormal.quantile(0)).toBe(0);
      expect(lognormal.quantile(1)).toBe(Infinity);
    });

    it('should handle degenerate case in CDF', () => {
      const lognormal = new LogNormalDistribution(1, 0);
      const pointMass = Math.exp(1);

      expect(lognormal.cdf(pointMass - 0.1)).toBe(0);
      expect(lognormal.cdf(pointMass)).toBe(1);
      expect(lognormal.cdf(pointMass + 0.1)).toBe(1);
    });
  });

  describe('sampling', () => {
    it('should generate samples in correct range', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      const samples = lognormal.sample(100) as number[];

      // All samples should be positive
      for (const sample of samples) {
        expect(sample).toBeGreaterThan(0);
        expect(sample).not.toBe(Infinity);
        expect(sample).not.toBe(NaN);
      }
    });

    it('should generate samples with approximately correct mean', () => {
      const lognormal = new LogNormalDistribution(0, 0.5); // Smaller variance for better convergence
      const samples = lognormal.sample(5000) as number[];
      const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length;

      // Should be close to theoretical mean
      expect(sampleMean).toBeCloseTo(lognormal.mean(), 1);
    });

    it('should return single number when n=1', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      const sample = lognormal.sample(1);

      expect(typeof sample).toBe('number');
      expect(sample).toBeGreaterThan(0);
    });

    it('should handle degenerate case in sampling', () => {
      const lognormal = new LogNormalDistribution(1, 0);
      const samples = lognormal.sample(10) as number[];
      const expected = Math.exp(1);

      for (const sample of samples) {
        expect(sample).toBeCloseTo(expected, 10);
      }
    });
  });

  describe('parameter access', () => {
    it('should return correct parameters', () => {
      const lognormal = new LogNormalDistribution(1.5, 0.8);

      expect(lognormal.mu()).toBe(1.5);
      expect(lognormal.sigma()).toBe(0.8);

      const params = lognormal.getParameters();
      expect(params.mu).toBe(1.5);
      expect(params.sigma).toBe(0.8);

      const normalParams = lognormal.getNormalParameters();
      expect(normalParams.mean).toBe(1.5);
      expect(normalParams.stdDev).toBe(0.8);
    });
  });

  describe('special properties', () => {
    it('should satisfy relationship with underlying normal', () => {
      const lognormal = new LogNormalDistribution(1, 0.5);

      // The median should equal exp(μ)
      expect(lognormal.median()).toBeCloseTo(Math.exp(1), 6);

      // For lognormal, mode < median < mean (when σ > 0)
      expect(lognormal.mode()).toBeLessThan(lognormal.median());
      expect(lognormal.median()).toBeLessThan(lognormal.mean());
    });

    it('should have correct coefficient of variation', () => {
      const lognormal = new LogNormalDistribution(0, 0.5);
      const cv = lognormal.coefficientOfVariation();
      const meanVal = lognormal.mean();
      const stdVal = lognormal.stdDev();

      // CV should equal stdDev / mean
      expect(cv).toBeCloseTo(stdVal / meanVal, 6);
    });
  });

  describe('direct construction', () => {
    it('should create LogNormal distribution via constructor', () => {
      const lognormal = new LogNormalDistribution(0, 1);
      expect(lognormal.mu()).toBe(0);
      expect(lognormal.sigma()).toBe(1);
    });
  });
});
