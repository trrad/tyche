// src/tests/inference/inference-engine.test.ts
import { describe, test, expect } from 'vitest';
import { BetaBinomialConjugate } from '../../inference/exact/BetaBinomialConjugate';
import { LogNormalConjugate } from '../../inference/exact/LogNormalConjugate';
import { NormalConjugate } from '../../inference/exact/NormalConjugate';
import { NormalMixtureEM } from '../../inference/approximate/em/NormalMixtureEM';
import { LogNormalMixtureEM } from '../../inference/approximate/em/LogNormalMixtureEM';
import { StandardData } from '../../core/data/StandardData';
import { ModelConfig } from '../../inference/base/types';
import { TycheError } from '../../core/errors';

describe('InferenceEngine Base Class Tests', () => {
  describe('BetaBinomialConjugate', () => {
    test('should have correct capabilities', () => {
      const engine = new BetaBinomialConjugate();

      expect(engine.capabilities.structures).toContain('simple');
      expect(engine.capabilities.types).toContain('beta');
      expect(engine.capabilities.dataTypes).toContain('binomial');
      expect(engine.capabilities.components).toEqual([1]);
      expect(engine.capabilities.exact).toBe(true);
      expect(engine.capabilities.fast).toBe(true);
    });

    test('should handle binomial data correctly', async () => {
      const engine = new BetaBinomialConjugate();

      const data: StandardData = {
        type: 'binomial',
        n: 100,
        binomial: { successes: 30, trials: 100 },
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'beta',
        components: 1,
      };

      const result = await engine.fit(data, config);

      expect(result.posterior).toBeDefined();
      expect(result.diagnostics.converged).toBe(true);
      expect(result.diagnostics.iterations).toBe(1);
      expect(result.diagnostics.modelType).toBe('beta-binomial');

      // Check posterior mean is reasonable (should be around 0.3)
      const mean = result.posterior.mean()[0];
      expect(mean).toBeGreaterThan(0.25);
      expect(mean).toBeLessThan(0.35);
    });

    test('should respect prior parameters', async () => {
      const engine = new BetaBinomialConjugate();

      const data: StandardData = {
        type: 'binomial',
        n: 10,
        binomial: { successes: 2, trials: 10 }, // 20% success rate
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'beta',
        components: 1,
      };

      // Strong prior believing in 80% success rate
      const options = {
        priorParams: {
          type: 'beta' as const,
          params: [80, 20],
        },
      };

      const result = await engine.fit(data, config, options);

      // Prior should pull estimate up from 0.2
      const mean = result.posterior.mean()[0];
      expect(mean).toBeGreaterThan(0.4);
      expect(mean).toBeLessThan(0.8);
    });

    test('should reject non-binomial data', async () => {
      const engine = new BetaBinomialConjugate();

      const data: StandardData = {
        type: 'user-level',
        n: 100,
        userLevel: {
          users: [{ value: 10, converted: true }],
          empiricalStats: { mean: 10, variance: 0 },
        },
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'beta',
        components: 1,
      };

      await expect(engine.fit(data, config)).rejects.toThrow(TycheError);
    });
  });

  describe('LogNormalConjugate', () => {
    test('should have correct capabilities', () => {
      const engine = new LogNormalConjugate();

      expect(engine.capabilities.structures).toContain('simple');
      expect(engine.capabilities.structures).toContain('compound');
      expect(engine.capabilities.types).toContain('lognormal');
      expect(engine.capabilities.dataTypes).toContain('user-level');
      expect(engine.capabilities.components).toEqual([1]);
      expect(engine.capabilities.exact).toBe(true);
    });

    test('should handle positive continuous data', async () => {
      const engine = new LogNormalConjugate();

      const values = [10, 15, 20, 25, 30, 35, 40];
      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v) => ({ value: v, converted: true })),
          empiricalStats: {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            variance: 0,
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 1,
      };

      const result = await engine.fit(data, config);

      expect(result.posterior).toBeDefined();
      expect(result.diagnostics.converged).toBe(true);
      expect(result.diagnostics.modelType).toBe('lognormal');

      // Check posterior mean is reasonable
      const mean = result.posterior.mean()[0];
      expect(mean).toBeGreaterThan(15);
      expect(mean).toBeLessThan(35);
    });

    test('should filter out non-positive values', async () => {
      const engine = new LogNormalConjugate();

      const values = [10, 0, 20, -5, 30]; // Some invalid values
      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v) => ({ value: v, converted: true })),
          empiricalStats: {
            mean: 20,
            variance: 100,
          },
        },
        quality: {
          hasZeros: true,
          hasNegatives: true,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 1,
      };

      const result = await engine.fit(data, config);

      // Should still work with only positive values
      expect(result.posterior).toBeDefined();
      expect(result.diagnostics.converged).toBe(true);
    });
  });

  describe('NormalConjugate', () => {
    test('should have correct capabilities', () => {
      const engine = new NormalConjugate();

      expect(engine.capabilities.structures).toContain('simple');
      expect(engine.capabilities.types).toContain('normal');
      expect(engine.capabilities.dataTypes).toContain('user-level');
      expect(engine.capabilities.components).toEqual([1]);
      expect(engine.capabilities.exact).toBe(true);
    });

    test('should handle continuous data including negatives', async () => {
      const engine = new NormalConjugate();

      const values = [-10, -5, 0, 5, 10];
      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v) => ({ value: v, converted: true })),
          empiricalStats: {
            mean: 0,
            variance: 50,
          },
        },
        quality: {
          hasZeros: true,
          hasNegatives: true,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'normal',
        components: 1,
      };

      const result = await engine.fit(data, config);

      expect(result.posterior).toBeDefined();
      expect(result.diagnostics.converged).toBe(true);
      expect(result.diagnostics.modelType).toBe('normal');

      // Check posterior mean is around 0
      const mean = result.posterior.mean()[0];
      expect(Math.abs(mean)).toBeLessThan(2);
    });
  });

  describe('Mixture Models', () => {
    test('NormalMixtureEM should support multiple components', () => {
      const engine = new NormalMixtureEM();

      expect(engine.capabilities.components).toEqual([1, 2, 3, 4]);
      expect(engine.capabilities.exact).toBe(false);
      expect(engine.algorithm).toBe('em');
    });

    test('LogNormalMixtureEM should handle mixture data', async () => {
      const engine = new LogNormalMixtureEM({ useFastMStep: true });

      // Create bimodal data
      const values = [
        ...Array(50)
          .fill(0)
          .map(() => 10 + Math.random() * 5),
        ...Array(50)
          .fill(0)
          .map(() => 50 + Math.random() * 10),
      ];

      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v) => ({ value: v, converted: true })),
          empiricalStats: {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            variance: 0,
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 2,
      };

      const result = await engine.fit(data, config);

      expect(result.posterior).toBeDefined();
      // With well-separated data, EM can converge very quickly
      expect(result.diagnostics.iterations).toBeGreaterThanOrEqual(1);
      expect(result.diagnostics.converged).toBe(true);

      // Check if mixture components were found
      const posterior = result.posterior as any;
      if (posterior.getComponents) {
        const components = posterior.getComponents();
        expect(components.length).toBeGreaterThanOrEqual(1);
        expect(components.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('canHandle method', () => {
    test('engines should correctly identify what they can handle', () => {
      const betaEngine = new BetaBinomialConjugate();
      const logNormalEngine = new LogNormalConjugate();
      const normalEngine = new NormalConjugate();

      const binomialData: StandardData = {
        type: 'binomial',
        n: 100,
        binomial: { successes: 30, trials: 100 },
        quality: { hasZeros: false, hasNegatives: false, hasOutliers: false, missingData: 0 },
      };

      const userLevelData: StandardData = {
        type: 'user-level',
        n: 10,
        userLevel: {
          users: [{ value: 10, converted: true }],
          empiricalStats: { mean: 10, variance: 0 },
        },
        quality: { hasZeros: false, hasNegatives: false, hasOutliers: false, missingData: 0 },
      };

      const betaConfig: ModelConfig = { structure: 'simple', type: 'beta', components: 1 };
      const logNormalConfig: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 1,
      };
      const normalConfig: ModelConfig = { structure: 'simple', type: 'normal', components: 1 };

      // Beta engine should only handle binomial data with beta type
      expect(betaEngine.canHandle(betaConfig, binomialData)).toBe(true);
      expect(betaEngine.canHandle(betaConfig, userLevelData)).toBe(false);
      expect(betaEngine.canHandle(logNormalConfig, binomialData)).toBe(false);

      // LogNormal engine should only handle user-level data with lognormal type
      expect(logNormalEngine.canHandle(logNormalConfig, userLevelData)).toBe(true);
      expect(logNormalEngine.canHandle(logNormalConfig, binomialData)).toBe(false);
      expect(logNormalEngine.canHandle(betaConfig, userLevelData)).toBe(false);

      // Normal engine should only handle user-level data with normal type
      expect(normalEngine.canHandle(normalConfig, userLevelData)).toBe(true);
      expect(normalEngine.canHandle(normalConfig, binomialData)).toBe(false);
      expect(normalEngine.canHandle(betaConfig, userLevelData)).toBe(false);
    });
  });
});
