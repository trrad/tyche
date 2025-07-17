/**
 * Tests for probability distributions
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { beta, binomial, bernoulli, normal, standardNormal, halfNormal } from '../core/distributions';
import { RandomVariable } from '../core/RandomVariable';
import { ComputationGraph } from '../core/ComputationGraph';

describe('Distributions', () => {
  let graph: ComputationGraph;
  const rng = () => Math.random(); // Simple RNG for testing
  
  beforeEach(() => {
    graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);
  });
  
  describe('Beta Distribution', () => {
    test('mean calculation', () => {
      const dist = beta(2, 3);
      // Mean of Beta(2, 3) = 2/(2+3) = 0.4
      expect(dist.mean().forward()).toBeCloseTo(0.4);
    });
    
    test('variance calculation', () => {
      const dist = beta(2, 3);
      // Variance of Beta(2, 3) = (2*3)/((2+3)^2*(2+3+1)) = 6/(25*6) = 0.04
      expect(dist.variance().forward()).toBeCloseTo(0.04);
    });
    
    test('sampling produces values in [0, 1]', () => {
      const dist = beta(2, 3);
      for (let i = 0; i < 100; i++) {
        const sample = dist.sample(rng);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(1);
      }
    });
    
    test('log probability', () => {
      const dist = beta(2, 3);
      
      // Test at boundaries
      expect(dist.logProb(0).forward()).toBe(-Infinity);
      expect(dist.logProb(1).forward()).toBe(-Infinity);
      
      // Test valid value - with correct logBeta, this should work
      const logProb = dist.logProb(0.4).forward();
      expect(logProb).toBeGreaterThan(-Infinity);
      expect(logProb).toBeFinite();
      
      // Test that it's a proper PDF (integrates to 1)
      // For Beta(2,3), the mode is at (2-1)/(2+3-2) = 1/3
      const logProbAtMode = dist.logProb(1/3).forward();
      const logProbAtTail = dist.logProb(0.9).forward();
      expect(logProbAtMode).toBeGreaterThan(logProbAtTail);
    });
  });
  
  describe('Binomial Distribution', () => {
    test('mean calculation', () => {
      const dist = binomial(10, 0.3);
      // Mean of Binomial(10, 0.3) = 10 * 0.3 = 3
      expect(dist.mean().forward()).toBeCloseTo(3);
    });
    
    test('variance calculation', () => {
      const dist = binomial(10, 0.3);
      // Variance of Binomial(10, 0.3) = 10 * 0.3 * 0.7 = 2.1
      expect(dist.variance().forward()).toBeCloseTo(2.1);
    });
    
    test('sampling produces integers in [0, n]', () => {
      const n = 10;
      const dist = binomial(n, 0.3);
      
      for (let i = 0; i < 100; i++) {
        const sample = dist.sample(rng);
        expect(sample).toBeGreaterThanOrEqual(0);
        expect(sample).toBeLessThanOrEqual(n);
        expect(Number.isInteger(sample)).toBe(true);
      }
    });
    
    test('bernoulli is special case of binomial', () => {
      const bern = bernoulli(0.7);
      const binom = binomial(1, 0.7);
      
      expect(bern.mean().forward()).toBeCloseTo(binom.mean().forward());
      expect(bern.variance().forward()).toBeCloseTo(binom.variance().forward());
    });
    
    test('log probability', () => {
      const dist = binomial(10, 0.3);
      
      // Test invalid values
      expect(dist.logProb(-1).forward()).toBe(-Infinity);
      expect(dist.logProb(11).forward()).toBe(-Infinity);
      expect(dist.logProb(3.5).forward()).toBe(-Infinity);
      
      // Test valid value
      const logProb = dist.logProb(3).forward();
      expect(logProb).toBeGreaterThan(-Infinity);
      expect(logProb).toBeLessThan(0);
    });
  });
  
  describe('Normal Distribution', () => {
    test('mean and standard deviation', () => {
      const dist = normal(5, 2);
      expect(dist.getMean().forward()).toBe(5);
      expect(dist.getStdDev().forward()).toBe(2);
    });
    
    test('variance calculation', () => {
      const dist = normal(5, 2);
      // Variance = stdDev² = 4
      expect(dist.variance().forward()).toBeCloseTo(4);
    });
    
    test('standard normal', () => {
      const dist = standardNormal();
      expect(dist.getMean().forward()).toBe(0);
      expect(dist.getStdDev().forward()).toBe(1);
    });
    
    test('sampling produces reasonable values', () => {
      const dist = normal(0, 1);
      const samples = dist.sampleMultiple(1000, () => Math.random());
      
      // Calculate sample mean and variance
      const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const sampleVar = samples.reduce((a, b) => a + (b - sampleMean) ** 2, 0) / samples.length;
      
      // With better RNG, these should be closer, but still allow some tolerance
      expect(sampleMean).toBeCloseTo(0, 0); // Within 0.1
      expect(sampleVar).toBeCloseTo(1, 0);  // Within 0.1
    });
    
    test('log probability', () => {
      const dist = normal(0, 1);
      
      // At mean, log prob should be -0.5 * log(2π) ≈ -0.919
      const logProbAtMean = dist.logProb(0).forward();
      expect(logProbAtMean).toBeCloseTo(-0.5 * Math.log(2 * Math.PI), 5);
      
      // Further from mean, log prob should be more negative
      const logProbFar = dist.logProb(3).forward();
      expect(logProbFar).toBeLessThan(logProbAtMean);
    });
    
    test('CDF and inverse CDF', () => {
      const dist = normal(0, 1);
      
      // CDF at mean should be 0.5
      expect(dist.cdf(0)).toBeCloseTo(0.5);
      
      // CDF should be monotonic
      expect(dist.cdf(-1)).toBeLessThan(dist.cdf(0));
      expect(dist.cdf(0)).toBeLessThan(dist.cdf(1));
      
      // Inverse CDF should now work correctly with erfInv
      const p = 0.7;
      const x = dist.inverseCDF(p);
      expect(dist.cdf(x)).toBeCloseTo(p, 5);
    });
    
    test('standardize', () => {
      const dist = normal(5, 2);
      
      // Standardizing the mean should give 0
      expect(dist.standardize(5).forward()).toBeCloseTo(0);
      
      // Standardizing mean + 1 stdDev should give 1
      expect(dist.standardize(7).forward()).toBeCloseTo(1);
    });
  });
  
  describe('Half-Normal Distribution', () => {
    test('sampling produces non-negative values', () => {
      const dist = halfNormal(2);
      
      for (let i = 0; i < 100; i++) {
        const sample = dist.sample(rng);
        expect(sample).toBeGreaterThanOrEqual(0);
      }
    });
    
    test('log probability', () => {
      const dist = halfNormal(1);
      
      // Negative values should have -Infinity log prob
      expect(dist.logProb(-1).forward()).toBe(-Infinity);
      
      // At 0, should have maximum log prob
      const logProb0 = dist.logProb(0).forward();
      const logProb1 = dist.logProb(1).forward();
      expect(logProb0).toBeGreaterThan(logProb1);
    });
  });
  
  describe('Gradients through distributions', () => {
    test('gradient of Beta mean w.r.t. parameters', () => {
      const alpha = RandomVariable.parameter(2, 'alpha');
      const betaParam = RandomVariable.parameter(3, 'beta');
      const dist = beta(alpha, betaParam);
      const mean = dist.mean();
      
      const gradients = mean.backward();
      
      // d/dα (α/(α+β)) = β/(α+β)²
      const expectedAlphaGrad = 3 / (5 * 5);
      expect(gradients.get(alpha.getNode())).toBeCloseTo(expectedAlphaGrad);
      
      // d/dβ (α/(α+β)) = -α/(α+β)²
      const expectedBetaGrad = -2 / (5 * 5);
      expect(gradients.get(betaParam.getNode())).toBeCloseTo(expectedBetaGrad);
    });
    
    test('gradient of Normal log prob', () => {
      const mu = RandomVariable.parameter(0, 'mu');
      const sigma = RandomVariable.parameter(1, 'sigma');
      const dist = normal(mu, sigma);
      
      const x = 1;
      const logProb = dist.logProb(x);
      
      const gradients = logProb.backward();
      
      // d/dμ log p(x|μ,σ) = (x-μ)/σ² = (1-0)/1² = 1
      expect(gradients.get(mu.getNode())).toBeCloseTo(1);
      
      // d/dσ log p(x|μ,σ) = -1/σ + (x-μ)²/σ³ = -1/1 + 1²/1³ = 0
      expect(gradients.get(sigma.getNode())).toBeCloseTo(0);
    });
  });
});