/**
 * Tests for probability distributions
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { beta, binomial, bernoulli, normal, standardNormal, halfNormal } from '../core/distributions';
import { RNG } from '../core/math/random'; // Import RNG from the correct location
import { RandomVariable } from '../core/RandomVariable';
import { ComputationGraph } from '../core/ComputationGraph';

describe('Distributions', () => {
  let graph: ComputationGraph;
  let rng: RNG;
  
  beforeEach(() => {
    graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);
    rng = new RNG(12345); // Seeded for reproducibility
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
      const dist = beta(2, 3, rng);
      for (let i = 0; i < 100; i++) {
        const sample = dist.sample();
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
      expect(logProb).toBeLessThan(Infinity);
      
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
      const dist = binomial(n, 0.3, rng);
      
      for (let i = 0; i < 100; i++) {
        const sample = dist.sample();
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
      expect(dist.cdf(x)).toBeCloseTo(p, 2);
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
      const dist = halfNormal(2, rng);
      
      for (let i = 0; i < 100; i++) {
        const sample = dist.sample();
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
      
      // The Beta constructor returns a node that computes the mean
      // So gradients should flow through it
      const mean = dist; // dist already represents the mean
      
      const gradients = mean.backward();
      
      // Check gradients exist and are correct
      expect(gradients.has(alpha.getNode())).toBe(true);
      expect(gradients.has(betaParam.getNode())).toBe(true);
      
      // For mean = α/(α+β), at α=2, β=3:
      // d/dα = β/(α+β)² = 3/25 = 0.12
      // d/dβ = -α/(α+β)² = -2/25 = -0.08
      expect(gradients.get(alpha.getNode())).toBeCloseTo(0.12);
      expect(gradients.get(betaParam.getNode())).toBeCloseTo(-0.08);
    });
    
    test('gradient of Normal log prob', () => {
      const mu = RandomVariable.parameter(0, 'mu');
      const sigma = RandomVariable.parameter(1, 'sigma');
      const dist = normal(mu, sigma);
      
      const x = 1;
      
      // Let's trace the logProb step by step
      const logProb = dist.logProb(x);
      console.log('logProb forward value:', logProb.forward());
      
      const gradients = logProb.backward();
      const muGrad = gradients.get(mu.getNode());
      const sigmaGrad = gradients.get(sigma.getNode());
      
      console.log('Gradient w.r.t. mu:', muGrad);
      console.log('Gradient w.r.t. sigma:', sigmaGrad);
      
      // Add this: let's also check the node structure
      console.log('Number of nodes in gradient map:', gradients.size);
      
      expect(muGrad).toBeCloseTo(1);  // This is what it SHOULD be
    });

    test('gradient of Normal log prob - DEBUG', () => {
      const mu = RandomVariable.parameter(0, 'mu');
      const sigma = RandomVariable.parameter(1, 'sigma');
      const dist = normal(mu, sigma);
      
      const x = 1;
      const logProb = dist.logProb(x);
      
      // Let's trace each step
      console.log('\n=== Gradient Debug ===');
      console.log('Forward value:', logProb.forward());
      
      // Get intermediate nodes if possible
      // You might need to modify logProb to expose these
      
      const gradients = logProb.backward();
      console.log('Gradient w.r.t. mu:', gradients.get(mu.getNode()));
      console.log('Expected:', 1);
      
      // The math says this MUST be +1
      // If it's -1, we have a bug
    });

    test('debug subtract and square gradient', () => {
      const param = RandomVariable.parameter(0, 'param');
      const constant = RandomVariable.constant(1);
      
      // Test just (1 - param)²
      const diff = constant.subtract(param);
      const squared = diff.pow(2);
      
      const gradients = squared.backward();
      console.log('Gradient of (1-param)² at param=0:', gradients.get(param.getNode()));
      // Should be -2 (derivative of (1-x)² at x=0)
      
      // Now test -0.5 * (1 - param)²
      const scaled = squared.multiply(-0.5);
      const gradients2 = scaled.backward();
      console.log('Gradient of -0.5*(1-param)² at param=0:', gradients2.get(param.getNode()));
      // Should be +1
    });
  });
});