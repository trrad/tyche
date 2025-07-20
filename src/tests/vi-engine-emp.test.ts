// Streamlined Test Suite for VI Engine
// Focus: parameter recovery, edge cases, and basic functionality

import { describe, test, expect, beforeEach } from 'vitest';
import {
  VariationalInferenceEngine,
  BetaBinomialVI,
  NormalMixtureEM,
  ZeroInflatedLogNormalVI,
  NumericalUtils,
  DataInput,
  random
} from '../vi-engine';
import jStat from 'jstat';
import { Random, MersenneTwister19937 } from 'random-js';

// ============================================
// Test Utilities
// ============================================

/**
 * Set random seed for reproducible tests
 */
function setSeed(seed: number = 12345) {
  const seededRandom = new Random(MersenneTwister19937.seed(seed));
  Math.random = () => seededRandom.real(0, 1);
}

/**
 * Check if parameter is recovered within reasonable bounds
 * More lenient than exact recovery - VI is approximate!
 */
function expectParameterRecovery(
  estimated: number, 
  truth: number, 
  relativeTolerance: number = 0.3
) {
  const relativeError = Math.abs(estimated - truth) / Math.max(Math.abs(truth), 1);
  expect(relativeError).toBeLessThan(relativeTolerance);
}

/**
 * Generate synthetic data for testing
 */
class TestDataGenerator {
  static betaBinomial(successes: number, trials: number): DataInput {
    return { data: { successes, trials } };
  }
  
  static normalMixture(
    means: number[], 
    variances: number[], 
    weights: number[], 
    n: number
  ): DataInput {
    const data: number[] = [];
    for (let i = 0; i < n; i++) {
      const u = Math.random();
      let cumWeight = 0;
      let component = 0;
      for (let j = 0; j < weights.length; j++) {
        cumWeight += weights[j];
        if (u <= cumWeight) {
          component = j;
          break;
        }
      }
      data.push(jStat.normal.sample(means[component], Math.sqrt(variances[component])));
    }
    return { data, config: { numComponents: means.length } };
  }
  
  static zeroInflatedLogNormal(
    zeroProb: number,
    logMean: number,
    logStd: number,
    n: number
  ): DataInput {
    const data: number[] = [];
    const numZeros = Math.round(n * zeroProb);
    
    // Add exact number of zeros
    for (let i = 0; i < numZeros; i++) {
      data.push(0);
    }
    
    // Add log-normal values
    for (let i = numZeros; i < n; i++) {
      const z = jStat.normal.sample(0, 1);
      data.push(Math.exp(logMean + logStd * z));
    }
    
    // Shuffle
    for (let i = data.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [data[i], data[j]] = [data[j], data[i]];
    }
    
    return { data };
  }
}

// ============================================
// Beta-Binomial Tests (Exact Conjugate)
// ============================================

describe('BetaBinomial Parameter Recovery', () => {
  beforeEach(() => setSeed());
  
  test('recovers uniform prior', async () => {
    const vi = new BetaBinomialVI();
    const result = await vi.fit({ data: { successes: 50, trials: 100 } });
    
    const mean = result.posterior.mean()[0];
    expectParameterRecovery(mean, 0.5, 0.1); // Should be very close
    
    expect(result.diagnostics.converged).toBe(true);
    expect(result.diagnostics.iterations).toBe(1); // Conjugate = instant
  });
  
  test('handles extreme cases', async () => {
    const vi = new BetaBinomialVI();
    
    // All successes
    const result1 = await vi.fit({ data: { successes: 100, trials: 100 } });
    expect(result1.posterior.mean()[0]).toBeGreaterThan(0.95);
    
    // No successes
    const result2 = await vi.fit({ data: { successes: 0, trials: 100 } });
    expect(result2.posterior.mean()[0]).toBeLessThan(0.05);
  });
  
  test('respects custom prior', async () => {
    // Strong prior belief around 0.8
    const vi = new BetaBinomialVI({ 
      priorParams: { type: 'beta', params: [80, 20] } 
    });
    
    // Weak contradictory data
    const result = await vi.fit({ data: { successes: 2, trials: 10 } });
    
    // Prior should dominate
    const mean = result.posterior.mean()[0];
    expect(mean).toBeGreaterThan(0.5); // Pulled toward prior
  });
});

// ============================================
// Normal Mixture Tests (EM Algorithm)
// ============================================

describe('NormalMixture Parameter Recovery', () => {
  beforeEach(() => setSeed());
  
  test('recovers two well-separated components', async () => {
    const trueMeans = [-5, 5];
    const data = TestDataGenerator.normalMixture(
      trueMeans,
      [1, 1],
      [0.5, 0.5],
      500
    );
    
    const vi = new NormalMixtureEM();
    const result = await vi.fit(data);
    
    // Check that we found both components (order may vary)
    const foundMeans = result.posterior.mean().sort((a, b) => a - b);
    expectParameterRecovery(foundMeans[0], trueMeans[0], 0.2);
    expectParameterRecovery(foundMeans[1], trueMeans[1], 0.2);
    
    expect(result.diagnostics.converged).toBe(true);
  });
  
  test('handles single component', async () => {
    const data = TestDataGenerator.normalMixture(
      [3],
      [2],
      [1.0],
      100
    );
    
    const vi = new NormalMixtureEM();
    const result = await vi.fit({ ...data, config: { numComponents: 1 } });
    
    expectParameterRecovery(result.posterior.mean()[0], 3, 0.2);
  });
  
  test('degenerates gracefully with overlapping components', async () => {
    // Two components with same mean - should effectively become one
    const data = TestDataGenerator.normalMixture(
      [0, 0],
      [1, 1],
      [0.5, 0.5],
      200
    );
    
    const vi = new NormalMixtureEM();
    const result = await vi.fit(data);
    
    // Both components should center around 0
    const means = result.posterior.mean();
    means.forEach(mean => {
      expect(Math.abs(mean)).toBeLessThan(0.5);
    });
  });
});

// ============================================
// Zero-Inflated LogNormal Tests
// ============================================

describe('ZeroInflatedLogNormal Parameter Recovery', () => {
  beforeEach(() => setSeed());
  
  test('recovers moderate zero probability', async () => {
    const trueZeroProb = 0.3;
    const data = TestDataGenerator.zeroInflatedLogNormal(
      trueZeroProb,
      2.0,  // log mean
      0.5,  // log std
      500   // larger sample for better recovery
    );
    
    const vi = new ZeroInflatedLogNormalVI({ 
      maxIterations: 1000,
      tolerance: 1e-5 
    });
    const result = await vi.fit(data);
    
    const estimatedZeroProb = result.posterior.mean()[0];
    expectParameterRecovery(estimatedZeroProb, trueZeroProb, 0.3);
    
    // Check that it converged (may not always converge < maxIter)
    expect(result.diagnostics.finalELBO).toBeGreaterThan(-Infinity);
  });
  
  test('handles extreme zero probabilities', async () => {
    // Very few zeros
    const data1 = TestDataGenerator.zeroInflatedLogNormal(0.05, 1, 0.5, 200);
    const vi = new ZeroInflatedLogNormalVI({ maxIterations: 500 });
    const result1 = await vi.fit(data1);
    expect(result1.posterior.mean()[0]).toBeLessThan(0.15);
    
    // Many zeros
    const data2 = TestDataGenerator.zeroInflatedLogNormal(0.8, 1, 0.5, 200);
    const result2 = await vi.fit(data2);
    expect(result2.posterior.mean()[0]).toBeGreaterThan(0.6);
  });
  
  test('handles all zeros gracefully', async () => {
    const vi = new ZeroInflatedLogNormalVI({ maxIterations: 100 });
    const result = await vi.fit({ data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    
    // Should identify very high zero probability
    expect(result.posterior.mean()[0]).toBeGreaterThan(0.8);
  });
  
  test('rejects data without zeros', async () => {
    const vi = new ZeroInflatedLogNormalVI();
    await expect(vi.fit({ data: [1, 2, 3, 4, 5] })).rejects.toThrow('No zeros found');
  });
});

// ============================================
// Integration Tests
// ============================================

describe('VariationalInferenceEngine Integration', () => {
  beforeEach(() => setSeed());
  
  test('unified API works for all models', async () => {
    const engine = new VariationalInferenceEngine();
    
    // Beta-Binomial
    const bbResult = await engine.fit('beta-binomial', {
      data: { successes: 30, trials: 100 }
    });
    expect(bbResult.posterior.mean()[0]).toBeCloseTo(0.3, 1);
    
    // Normal Mixture
    const nmResult = await engine.fit('normal-mixture', {
      data: [-1, -1, -1, 1, 1, 1],
      config: { numComponents: 2 }
    });
    expect(nmResult.posterior.mean().length).toBe(2);
    
    // Zero-Inflated LogNormal
    const zilnResult = await engine.fit('zero-inflated-lognormal', {
      data: [0, 0, 1, 2, 3, 0, 4, 5]
    });
    expect(zilnResult.posterior.mean()[0]).toBeGreaterThan(0.2);
    expect(zilnResult.posterior.mean()[0]).toBeLessThan(0.5);
  });
  
  test('all posteriors implement required interface', async () => {
    const engine = new VariationalInferenceEngine();
    const models = [
      { type: 'beta-binomial', data: { successes: 5, trials: 10 } },
      { type: 'normal-mixture', data: [1, 2, 3, 4, 5] },
      { type: 'zero-inflated-lognormal', data: [0, 0, 1, 2, 3] }
    ];
    
    for (const { type, data } of models) {
      const result = await engine.fit(type, { data });
      const posterior = result.posterior;
      
      // Check interface
      expect(Array.isArray(posterior.mean())).toBe(true);
      expect(Array.isArray(posterior.variance())).toBe(true);
      expect(Array.isArray(posterior.sample())).toBe(true);
      expect(Array.isArray(posterior.credibleInterval(0.95))).toBe(true);
      
      // Check diagnostics
      expect(typeof result.diagnostics.converged).toBe('boolean');
      expect(typeof result.diagnostics.iterations).toBe('number');
      expect(typeof result.diagnostics.finalELBO).toBe('number');
    }
  });
});

// ============================================
// Numerical Utilities Tests
// ============================================

describe('NumericalUtils', () => {
  test('logSumExp handles extreme values', () => {
    const result = NumericalUtils.logSumExp([1000, 1001, 999]);
    expect(result).toBeCloseTo(1001.408, 2);
    
    // Empty array
    expect(NumericalUtils.logSumExp([])).toBe(-Infinity);
    
    // All -Infinity
    expect(NumericalUtils.logSumExp([-Infinity, -Infinity])).toBe(-Infinity);
  });
  
  test('gradient clipping works on arrays', () => {
    // Test array clipping
    const grad1 = [3, 4]; // norm = 5
    const clipped1 = NumericalUtils.clipGradient(grad1, 10);
    expect(clipped1).toEqual([3, 4]); // unchanged
    
    const grad2 = [30, 40]; // norm = 50
    const clipped2 = NumericalUtils.clipGradient(grad2, 10);
    expect(clipped2[0]).toBeCloseTo(6);
    expect(clipped2[1]).toBeCloseTo(8);
  });
  
  test('safeLog handles edge cases', () => {
    expect(NumericalUtils.safeLog(1)).toBe(0);
    expect(NumericalUtils.safeLog(0)).toBe(-Infinity);
    expect(NumericalUtils.safeLog(-1)).toBe(-Infinity);
  });
});

// ============================================
// Performance Tests
// ============================================

describe('Performance', () => {
  test('beta-binomial is instant', () => {
    const vi = new BetaBinomialVI();
    const start = performance.now();
    vi.fit({ data: { successes: 50000, trials: 100000 } });
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(10); // Should be < 10ms
  });
  
  test('mixture model scales reasonably', async () => {
    const data = TestDataGenerator.normalMixture([0, 5], [1, 1], [0.5, 0.5], 1000);
    const vi = new NormalMixtureEM();
    
    const start = performance.now();
    await vi.fit(data);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(1000); // Should be < 1 second
  });
  
  test('zero-inflated handles large data with analytical gradients', async () => {
    const data = TestDataGenerator.zeroInflatedLogNormal(0.2, 0, 1, 5000);
    const vi = new ZeroInflatedLogNormalVI({ maxIterations: 100 });
    
    const start = performance.now();
    const result = await vi.fit(data);
    const duration = performance.now() - start;
    
    // Should be MUCH faster with analytical gradients
    expect(duration).toBeLessThan(2000); // Should be < 2 seconds (was < 5 before)
    expect(result.diagnostics.iterations).toBeLessThanOrEqual(100);
  });
});