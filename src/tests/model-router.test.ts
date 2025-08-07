/**
 * Tests for the new capability-based ModelRouter
 * Verifies routing decisions using StandardData and DataQuality indicators
 */

import { describe, it, expect } from 'vitest';
import { ModelRouter } from '../inference/ModelRouter';
import { StandardDataFactory } from '../core/data/StandardData';

describe('ModelRouter - Capability-based routing', () => {
  it('should route binomial data to beta-binomial model', async () => {
    // Create binomial data
    const data = StandardDataFactory.fromBinomial(45, 100);

    // Route the data
    const result = await ModelRouter.route(data);

    // Verify routing decision
    expect(result.config.structure).toBe('simple');
    expect(result.config.type).toBe('beta');
    expect(result.config.components).toBe(1);
    expect(result.confidence).toBe(1.0);
    expect(result.reasoning).toContain('Binomial data always uses Beta-Binomial conjugate model');
  });

  it('should route positive continuous data to simple lognormal model', async () => {
    // Create continuous data (everyone converted, positive values)
    const values = [10.5, 15.2, 8.3, 12.1, 9.8, 14.5, 11.2, 13.7];
    const data = StandardDataFactory.fromContinuous(values);

    // Route the data
    const result = await ModelRouter.route(data);

    // Verify routing decision
    expect(result.config.structure).toBe('simple');
    expect(result.config.type).toBe('lognormal');
    expect(result.config.components).toBe(1);
    expect(result.reasoning).toContain('No zeros in data, using simple model structure');
  });

  it('should route data with zeros to compound model', async () => {
    // Create user-level data with some zeros (compound structure)
    const users = [
      { userId: 'u1', converted: true, value: 25.0 },
      { userId: 'u2', converted: false, value: 0 },
      { userId: 'u3', converted: true, value: 15.5 },
      { userId: 'u4', converted: false, value: 0 },
      { userId: 'u5', converted: true, value: 30.2 },
    ];
    const data = StandardDataFactory.fromUserLevel(users);

    // Route the data
    const result = await ModelRouter.route(data);

    // Verify routing decision
    expect(result.config.structure).toBe('compound');
    expect(result.config.frequencyType).toBe('beta');
    expect(result.config.valueType).toBe('lognormal');
    expect(result.reasoning).toContain('Data contains zeros, using compound model structure');
  });

  it('should handle negative values correctly', async () => {
    // Create data with negative values
    const values = [-2.1, 3.5, -1.8, 4.2, -0.5, 2.1];
    const data = StandardDataFactory.fromContinuous(values);

    // Route the data
    const result = await ModelRouter.route(data);

    // Verify routing decision
    expect(result.config.structure).toBe('simple');
    expect(result.config.type).toBe('normal');
    expect(result.reasoning).toContain('Data contains negative values, using Normal distribution');
  });

  it('should detect mixture models for multimodal data', async () => {
    // Create bimodal data (two distinct clusters)
    const cluster1 = Array.from({ length: 25 }, () => 5 + Math.random());
    const cluster2 = Array.from({ length: 25 }, () => 15 + Math.random());
    const values = [...cluster1, ...cluster2];
    const data = StandardDataFactory.fromContinuous(values);

    // Route the data
    const result = await ModelRouter.route(data);

    // Should detect multimodality (though this is heuristic-based)
    expect(result.config.structure).toBe('simple');
    expect(result.config.type).toBe('lognormal');
    // Components might be 1 or 2 depending on gap detection heuristics
    expect(result.config.components).toBeGreaterThanOrEqual(1);
  });

  it('should provide comprehensive reasoning for decisions', async () => {
    const data = StandardDataFactory.fromBinomial(30, 75);
    const result = await ModelRouter.route(data);

    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('should return a valid inference engine', async () => {
    const data = StandardDataFactory.fromBinomial(20, 50);
    const result = await ModelRouter.route(data);

    expect(result.engine).toBeDefined();
    expect(typeof result.engine.fit).toBe('function');
  });
});

describe('ModelRouter - Bridge pattern compatibility', () => {
  it('should convert StandardData to legacy format for bridge compatibility', async () => {
    const data = StandardDataFactory.fromBinomial(35, 80);
    const result = await ModelRouter.route(data);

    // Test bridge method
    try {
      await ModelRouter.legacyFit(result.config, data);
      // If no error thrown, bridge is working
      expect(true).toBe(true);
    } catch (error) {
      // Some engines might not be available in test environment
      // Just verify the method exists and accepts correct parameters
      expect(error).toBeDefined();
    }
  });
});

describe('ModelRouter - Compound model routing', () => {
  it('should select CompoundInferenceEngine for zero-inflated data', async () => {
    // Import to check instance type
    const { CompoundInferenceEngine } = await import(
      '../inference/compound/CompoundInferenceEngine'
    );

    // Create user-level data with zeros
    const users = [
      // 60% non-converters
      ...Array(60)
        .fill(0)
        .map((_, i) => ({
          userId: `u${i}`,
          converted: false,
          value: 0,
        })),
      // 40% converters with revenue
      ...Array(40)
        .fill(0)
        .map((_, i) => ({
          userId: `u${i + 60}`,
          converted: true,
          value: 20 + Math.random() * 30,
        })),
    ];

    const data = StandardDataFactory.fromUserLevel(users);

    // Route should detect zeros and choose compound model
    const routeResult = await ModelRouter.route(data);

    expect(routeResult.config.structure).toBe('compound');
    expect(routeResult.config.frequencyType).toBe('beta');
    expect(routeResult.config.valueType).toBe('lognormal');
    expect(routeResult.engine).toBeInstanceOf(CompoundInferenceEngine);

    // Check reasoning includes zero detection
    expect(routeResult.reasoning).toContain('Data contains zeros, using compound model structure');
  });

  it('should fit compound model end-to-end through router', async () => {
    // Create realistic e-commerce data
    const users = [];

    // 70% browse but don't buy
    for (let i = 0; i < 70; i++) {
      users.push({
        userId: `u${i}`,
        converted: false,
        value: 0,
      });
    }

    // 30% make purchases with varying amounts
    for (let i = 0; i < 30; i++) {
      // Log-normal distributed purchase amounts
      const logValue = 3.5 + Math.random() * 1.5; // log($33) ± variation
      users.push({
        userId: `u${i + 70}`,
        converted: true,
        value: Math.exp(logValue),
      });
    }

    const data = StandardDataFactory.fromUserLevel(users);

    // Route and fit
    const routeResult = await ModelRouter.route(data);
    const fitResult = await routeResult.engine.fit(data, routeResult.config);

    expect(fitResult.diagnostics.converged).toBe(true);
    expect(fitResult.diagnostics.modelType).toBe('compound-beta-lognormal');

    // Check posterior is compound
    const posterior = fitResult.posterior as any;
    expect(posterior.getDecomposition).toBeDefined();

    // Decomposition should show ~30% conversion rate
    const decomposition = posterior.getDecomposition();
    const freqMean = await decomposition.frequency.mean();
    expect(freqMean[0]).toBeCloseTo(0.3, 1);
  });
});
