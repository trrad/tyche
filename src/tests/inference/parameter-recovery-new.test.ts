/**
 * Parameter Recovery Tests for New Inference Engine Architecture
 * Tests that our engines can recover known parameters from synthetic data
 */
import { describe, test, expect } from 'vitest';
import { DataGenerator } from '../utilities/synthetic/DataGenerator';
import { BetaBinomialConjugate } from '../../inference/exact/BetaBinomialConjugate';
import { LogNormalConjugate } from '../../inference/exact/LogNormalConjugate';
import { NormalConjugate } from '../../inference/exact/NormalConjugate';
import { NormalMixtureEM } from '../../inference/approximate/em/NormalMixtureEM';
import { LogNormalMixtureEM } from '../../inference/approximate/em/LogNormalMixtureEM';
import { StandardData } from '../../core/data/StandardData';
import { ModelConfig } from '../../inference/base/types';
import { LegacyDataAdapter } from '../utilities/LegacyDataAdapter';

describe('Parameter Recovery - New Architecture', () => {
  describe('BetaBinomialConjugate', () => {
    test('recovers beta parameters from binomial data', async () => {
      // Generate data with known conversion rate
      const trueRate = 0.3;
      const n = 2000;
      const dataset = DataGenerator.presets.betaBinomial(trueRate, n, 12345);

      // Convert to StandardData
      const standardData = LegacyDataAdapter.toStandardData(dataset.data);

      // Create engine and fit
      const engine = new BetaBinomialConjugate();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'beta',
        components: 1,
      };

      const result = await engine.fit(standardData, config);

      // Check recovery
      const posteriorMean = result.posterior.mean?.()[0];
      expect(posteriorMean).toBeCloseTo(trueRate, 1); // Within 0.1

      // Check diagnostics
      expect(result.diagnostics.converged).toBe(true);
      expect(result.diagnostics.modelType).toBe('beta-binomial');
    });

    test('recovers with strong prior', async () => {
      // Generate data with 20% conversion rate
      const trueRate = 0.2;
      const n = 200; // Smaller sample
      const dataset = DataGenerator.presets.betaBinomial(trueRate, n, 12345);

      const standardData = LegacyDataAdapter.toStandardData(dataset.data);

      const engine = new BetaBinomialConjugate();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'beta',
        components: 1,
      };

      // Use strong prior believing in 80% conversion rate
      const options = {
        priorParams: {
          type: 'beta' as const,
          params: [80, 20], // Strong prior for 0.8
        },
      };

      const result = await engine.fit(standardData, config, options);

      // With strong prior and small data, should be pulled toward prior
      const posteriorMean = result.posterior.mean?.()[0];
      expect(posteriorMean).toBeGreaterThan(0.3); // Pulled up from 0.2
      expect(posteriorMean).toBeLessThan(0.7); // But not all the way to 0.8
    });
  });

  describe('LogNormalConjugate', () => {
    test('recovers lognormal parameters from revenue data', async () => {
      // Generate lognormal data with known parameters
      const logMean = 3.0; // ~$20 average
      const logStd = 0.5;
      const n = 10000;

      const gen = new DataGenerator(12345);
      const dataset = gen.continuous('lognormal', { logMean, logStd }, n);

      const standardData = LegacyDataAdapter.toStandardData(dataset.data);

      const engine = new LogNormalConjugate();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 1,
      };

      const result = await engine.fit(standardData, config);

      // Check if we recovered approximate mean
      const expectedMean = Math.exp(logMean + (logStd * logStd) / 2);
      const posteriorMean = result.posterior.mean?.()[0];

      expect(posteriorMean).toBeCloseTo(expectedMean, 0); // Within order of magnitude
      expect(result.diagnostics.converged).toBe(true);
    });

    test('handles zero-inflated revenue data', async () => {
      // Create data with some zeros (non-converters)
      const gen = new DataGenerator(12345);
      const values = [
        ...Array(200).fill(0), // Non-converters
        ...gen.continuous('lognormal', { logMean: 3.0, logStd: 0.5 }, 300).data,
      ];

      const standardData = LegacyDataAdapter.toStandardData(values);

      const engine = new LogNormalConjugate();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 1,
      };

      const result = await engine.fit(standardData, config);

      // Should handle by filtering out zeros
      expect(result.posterior).toBeDefined();
      expect(result.diagnostics.converged).toBe(true);
    });
  });

  describe('NormalConjugate', () => {
    test('recovers normal parameters', async () => {
      // Generate normal data
      const trueMean = 100;
      const trueStd = 15;
      const n = 4000;

      const gen = new DataGenerator(12345);
      const dataset = gen.continuous('normal', { mean: trueMean, std: trueStd }, n);

      const standardData = LegacyDataAdapter.toStandardData(dataset.data);

      const engine = new NormalConjugate();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'normal',
        components: 1,
      };

      const result = await engine.fit(standardData, config);

      const posteriorMean = result.posterior.mean?.()[0];
      expect(posteriorMean).toBeCloseTo(trueMean, 0); // Within 1
      expect(result.diagnostics.converged).toBe(true);
    });
  });

  describe('NormalMixtureEM', () => {
    test('recovers mixture components', async () => {
      // Generate clear bimodal data
      const gen = new DataGenerator(12345);
      const data = gen.mixture(
        [
          { distribution: 'normal', params: [50, 5], weight: 0.3 },
          { distribution: 'normal', params: [80, 5], weight: 0.7 },
        ],
        2000
      ).data;

      const standardData = LegacyDataAdapter.toStandardData(data);

      const engine = new NormalMixtureEM();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'normal',
        components: 2,
      };

      const result = await engine.fit(standardData, config);

      expect(result.diagnostics.converged).toBe(true);

      // Check if components were found
      const posterior = result.posterior as any;
      if (posterior.getComponents) {
        const components = posterior.getComponents();
        expect(components.length).toBe(2);

        // Sort by mean
        components.sort((a: any, b: any) => a.mean - b.mean);

        // Check means are approximately correct
        expect(components[0].mean).toBeCloseTo(50, 0);
        expect(components[1].mean).toBeCloseTo(80, 0);

        // Check weights sum to 1
        const totalWeight = components.reduce((sum: number, c: any) => sum + c.weight, 0);
        expect(totalWeight).toBeCloseTo(1.0, 2);
      }
    });

    test('handles unimodal data gracefully', async () => {
      // Generate unimodal data
      const gen = new DataGenerator(12345);
      const data = gen.continuous('normal', { mean: 50, std: 10 }, 4000).data;

      const standardData = LegacyDataAdapter.toStandardData(data);

      const engine = new NormalMixtureEM();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'normal',
        components: 2,
      };

      const result = await engine.fit(standardData, config);

      // Should still converge
      expect(result.posterior).toBeDefined();

      // Components should be similar or one should dominate
      const posterior = result.posterior as any;
      if (posterior.getComponents) {
        const components = posterior.getComponents();

        if (components.length === 2) {
          const weights = components.map((c: any) => c.weight);
          const maxWeight = Math.max(...weights);

          // Either one component dominates or means are close
          const means = components.map((c: any) => c.mean);
          const meanDiff = Math.abs(means[0] - means[1]);

          expect(maxWeight > 0.8 || meanDiff < 10).toBe(true);
        }
      }
    });
  });

  describe('LogNormalMixtureEM', () => {
    test('recovers revenue tiers', async () => {
      // Generate multi-tier revenue data
      const gen = new DataGenerator(12345);
      const component1 = gen.continuous('lognormal', { logMean: 2.0, logStd: 0.3 }, 600).data;
      const component2 = gen.continuous('lognormal', { logMean: 4.0, logStd: 0.3 }, 400).data;
      const data = [...component1, ...component2];

      const standardData = LegacyDataAdapter.toStandardData(data);

      const engine = new LogNormalMixtureEM({ useFastMStep: true });
      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 2,
      };

      const result = await engine.fit(standardData, config);

      expect(result.diagnostics.converged).toBe(true);

      // Check components
      const posterior = result.posterior as any;
      if (posterior.getComponents) {
        const components = posterior.getComponents();
        expect(components.length).toBeGreaterThanOrEqual(1);
        expect(components.length).toBeLessThanOrEqual(2);

        if (components.length === 2) {
          // Sort by mean
          components.sort((a: any, b: any) => a.mean - b.mean);

          // Check separation
          expect(components[1].mean).toBeGreaterThan(components[0].mean * 2);
        }
      }
    });

    test.skip('fast vs bayesian M-step consistency - Bayesian M-step needs implementation', async () => {
      // Test that both approaches give similar results
      const gen = new DataGenerator(12345);
      const data = gen.continuous('lognormal', { logMean: 3.0, logStd: 0.8 }, 200).data;

      const standardData = LegacyDataAdapter.toStandardData(data);
      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 2,
      };

      // Test with fast M-step
      const fastEngine = new LogNormalMixtureEM({ useFastMStep: true });
      const fastResult = await fastEngine.fit(standardData, config);

      // Test with Bayesian M-step
      const bayesEngine = new LogNormalMixtureEM({ useFastMStep: false });
      const bayesResult = await bayesEngine.fit(standardData, config);

      // Both should converge
      expect(fastResult.diagnostics.converged).toBe(true);
      expect(bayesResult.diagnostics.converged).toBe(true);

      // Results should be similar (not necessarily identical)
      const fastMeans = fastResult.posterior.mean?.();
      const bayesMeans = bayesResult.posterior.mean?.();

      // At least the number of components should match
      expect(fastMeans?.length).toBe(bayesMeans?.length);
    });
  });
});
