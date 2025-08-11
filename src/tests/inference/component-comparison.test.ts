import { describe, it, expect } from 'vitest';
import { ModelRouter } from '../../inference/ModelRouter';
import { StandardDataFactory } from '../../core/data/StandardData';

describe('Component Comparison', () => {
  it('should run component comparison for mixture-capable models', async () => {
    // Generate multimodal data that should suggest k=2
    const values: number[] = [];
    // First mode around 10
    for (let i = 0; i < 50; i++) {
      values.push(10 + Math.random() * 5);
    }
    // Second mode around 30
    for (let i = 0; i < 50; i++) {
      values.push(30 + Math.random() * 5);
    }

    const standardData = StandardDataFactory.fromContinuous(values);

    // Route without forcing config (auto mode)
    const routeResult = await ModelRouter.route(standardData);

    // Should have a component comparison promise
    expect(routeResult.componentComparison).toBeDefined();
    expect(routeResult.componentComparison?.promise).toBeDefined();

    // Wait for the comparison to complete
    const comparisonResult = await routeResult.componentComparison!.promise;

    // Verify the result structure
    expect(comparisonResult.selectedK).toBeDefined();
    expect(comparisonResult.optimalK).toBeDefined();
    expect(comparisonResult.models).toBeDefined();
    expect(comparisonResult.models.length).toBeGreaterThan(1);
    expect(comparisonResult.confidence).toBeGreaterThan(0);
    expect(comparisonResult.confidence).toBeLessThanOrEqual(1);
    expect(comparisonResult.computeTimeMs).toBeGreaterThan(0);

    // Check that models have required fields
    comparisonResult.models.forEach((model) => {
      expect(model.k).toBeDefined();
      expect(model.waic).toBeDefined();
      expect(model.deltaWAIC).toBeDefined();
      expect(model.weight).toBeDefined();
    });

    // First model should have deltaWAIC = 0
    const sortedByWAIC = [...comparisonResult.models].sort((a, b) => a.waic - b.waic);
    expect(sortedByWAIC[0].deltaWAIC).toBe(0);

    console.log('Component comparison result:', {
      selectedK: comparisonResult.selectedK,
      optimalK: comparisonResult.optimalK,
      confidence: comparisonResult.confidence,
      models: comparisonResult.models,
    });
  });

  it('should not run comparison for small datasets', async () => {
    // Small dataset (< 50 points)
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const standardData = StandardDataFactory.fromContinuous(values);

    const routeResult = await ModelRouter.route(standardData);

    // Should not have component comparison
    expect(routeResult.componentComparison).toBeUndefined();
  });

  it('should not run comparison when config is forced', async () => {
    const values = Array.from({ length: 100 }, () => Math.random() * 100);
    const standardData = StandardDataFactory.fromContinuous(values);

    const routeResult = await ModelRouter.route(standardData, {
      forceConfig: {
        structure: 'simple',
        type: 'lognormal',
        components: 2,
      },
    });

    // Should not have component comparison when config is forced
    expect(routeResult.componentComparison).toBeUndefined();
  });

  it('should work with compound models', async () => {
    // Generate compound data with clear value tiers
    const users = [];
    for (let i = 0; i < 100; i++) {
      const converted = Math.random() < 0.3;
      const value = converted
        ? Math.random() < 0.5
          ? 10 + Math.random() * 10 // Low tier
          : 50 + Math.random() * 20 // High tier
        : 0;
      users.push({ userId: `user${i}`, converted, value });
    }

    const standardData = StandardDataFactory.fromUserLevel(users);

    const routeResult = await ModelRouter.route(standardData);

    // Compound models with enough data should have comparison
    if (routeResult.config.structure === 'compound') {
      expect(routeResult.componentComparison).toBeDefined();

      if (routeResult.componentComparison) {
        const comparisonResult = await routeResult.componentComparison.promise;

        console.log('Compound model comparison:', {
          selectedK: comparisonResult.selectedK,
          optimalK: comparisonResult.optimalK,
          models: comparisonResult.models,
        });

        // Should be comparing value distribution components
        expect(comparisonResult.models.length).toBeGreaterThan(0);
      }
    }
  });
});
