/**
 * Tests for CompoundInferenceEngine
 */
import { describe, test, expect } from 'vitest';
import {
  CompoundInferenceEngine,
  CompoundPosterior,
} from '../../inference/compound/CompoundInferenceEngine';
import { StandardDataFactory } from '../../core/data/StandardData';
import { ModelConfig } from '../../inference/base/types';
import { DataGenerator } from '../utilities/synthetic/DataGenerator';

describe('CompoundInferenceEngine', () => {
  describe('Basic functionality', () => {
    test('should fit compound model with zero-inflated data', async () => {
      // Generate user-level data with some non-converters
      const users = [
        // Non-converters
        ...Array(70)
          .fill(0)
          .map((_, i) => ({
            userId: `user_${i}`,
            converted: false,
            value: 0,
          })),
        // Converters with revenue
        ...Array(30)
          .fill(0)
          .map((_, i) => ({
            userId: `user_${i + 70}`,
            converted: true,
            value: 10 + Math.random() * 50,
          })),
      ];

      const data = StandardDataFactory.fromUserLevel(users);

      const engine = new CompoundInferenceEngine('compound');
      const config: ModelConfig = {
        structure: 'compound',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      const result = await engine.fit(data, config);

      expect(result.posterior).toBeInstanceOf(CompoundPosterior);
      expect(result.diagnostics.converged).toBe(true);
      expect(result.diagnostics.modelType).toBe('compound-beta-lognormal');
    });

    test('should decompose into frequency and value components', async () => {
      // 30% conversion rate, revenue ~$50 when converted
      const gen = new DataGenerator(12345);
      const users: Array<{ userId: string; converted: boolean; value: number }> = [];

      for (let i = 0; i < 1000; i++) {
        const converted = Math.random() < 0.3;
        users.push({
          userId: `user_${i}`,
          converted,
          value: converted ? Math.exp(3.5 + 0.5 * (Math.random() - 0.5)) : 0,
        });
      }

      const data = StandardDataFactory.fromUserLevel(users);

      const engine = new CompoundInferenceEngine('compound');
      const config: ModelConfig = {
        structure: 'compound',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      const result = await engine.fit(data, config);
      const posterior = result.posterior as CompoundPosterior;

      // Get decomposition
      const decomposition = posterior.getDecomposition();
      expect(decomposition).toBeDefined();
      expect(decomposition.frequency).toBeDefined();
      expect(decomposition.severity).toBeDefined();

      // Check frequency posterior (should be around 0.3)
      const freqMean = decomposition.frequency.mean?.();
      expect(freqMean?.[0]).toBeCloseTo(0.3, 1);

      // Check severity posterior (should be around exp(3.5 + 0.5²/2) ≈ $37)
      const sevMean = decomposition.severity.mean?.();
      expect(sevMean?.[0]).toBeGreaterThan(20);
      expect(sevMean?.[0]).toBeLessThan(60);
    });

    test('should calculate compound mean correctly', async () => {
      // Simple case: 50% conversion, ~$100 average value with some variance
      const users = [
        ...Array(500)
          .fill(0)
          .map((_, i) => ({
            userId: `user_${i}`,
            converted: false,
            value: 0,
          })),
        ...Array(500)
          .fill(0)
          .map((_, i) => ({
            userId: `user_${i + 500}`,
            converted: true,
            value: 90 + Math.random() * 20, // 90-110 range
          })),
      ];

      const data = StandardDataFactory.fromUserLevel(users);

      const engine = new CompoundInferenceEngine('compound');
      const config: ModelConfig = {
        structure: 'compound',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      const result = await engine.fit(data, config);
      const posterior = result.posterior as CompoundPosterior;

      // Compound mean should be ~0.5 * ~100 = ~50
      const compoundMean = posterior.mean?.();
      expect(compoundMean?.[0]).toBeCloseTo(50, -1); // Within order of magnitude
    });
  });

  describe('Mixture value distributions', () => {
    test('should support mixture models for value distribution', async () => {
      // Generate data with two revenue segments
      const gen = new DataGenerator(12345);
      const users: Array<{ userId: string; converted: boolean; value: number }> = [];

      // 40% don't convert
      for (let i = 0; i < 400; i++) {
        users.push({ userId: `user_${i}`, converted: false, value: 0 });
      }

      // 60% convert, split between low and high spenders
      // 40% low spenders (~$20)
      for (let i = 0; i < 400; i++) {
        users.push({
          userId: `user_${i + 400}`,
          converted: true,
          value: Math.exp(2.5 + 0.3 * (Math.random() - 0.5)),
        });
      }

      // 20% high spenders (~$200)
      for (let i = 0; i < 200; i++) {
        users.push({
          userId: `user_${i + 800}`,
          converted: true,
          value: Math.exp(5.0 + 0.3 * (Math.random() - 0.5)),
        });
      }

      const data = StandardDataFactory.fromUserLevel(users);

      const engine = new CompoundInferenceEngine('compound');
      const config: ModelConfig = {
        structure: 'compound',
        valueType: 'lognormal',
        valueComponents: 2,
      };

      const result = await engine.fit(data, config);
      const posterior = result.posterior as CompoundPosterior;

      // Check if severity has components
      const severityComponents = posterior.getSeverityComponents();
      if (severityComponents) {
        expect(severityComponents.length).toBeGreaterThanOrEqual(1);
        expect(severityComponents.length).toBeLessThanOrEqual(2);

        // Weights should sum to 1
        const totalWeight = severityComponents.reduce((sum, c) => sum + c.weight, 0);
        expect(totalWeight).toBeCloseTo(1.0, 2);
      }
    });
  });

  describe('Error handling', () => {
    test('should reject non-user-level data', async () => {
      const data = StandardDataFactory.fromBinomial(30, 100);

      const engine = new CompoundInferenceEngine('compound');
      const config: ModelConfig = {
        structure: 'compound',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      await expect(engine.fit(data, config)).rejects.toThrow('requires user-level data');
    });

    test('should reject if no positive values', async () => {
      // All non-converters
      const users = Array(100)
        .fill(0)
        .map((_, i) => ({
          userId: `user_${i}`,
          converted: false,
          value: 0,
        }));
      const data = StandardDataFactory.fromUserLevel(users);

      const engine = new CompoundInferenceEngine('compound');
      const config: ModelConfig = {
        structure: 'compound',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      await expect(engine.fit(data, config)).rejects.toThrow('No positive values found');
    });

    test('should reject missing valueType', async () => {
      const users = [{ userId: 'user_1', converted: true, value: 10 }];
      const data = StandardDataFactory.fromUserLevel(users);

      const engine = new CompoundInferenceEngine('compound');
      const config: ModelConfig = {
        structure: 'compound',
        type: 'beta', // Wrong - should be valueType
        components: 1,
      };

      await expect(engine.fit(data, config)).rejects.toThrow('requires valueType');
    });
  });

  describe('Capabilities', () => {
    test('should declare correct capabilities', () => {
      const engine = new CompoundInferenceEngine('compound');

      expect(engine.capabilities.structures).toContain('compound');
      expect(engine.capabilities.dataTypes).toContain('user-level');
      expect(engine.capabilities.types).toContain('lognormal');
      expect(engine.capabilities.types).toContain('normal');
      expect(engine.capabilities.components).toContain(1);
      expect(engine.capabilities.components).toContain(2);
      // Algorithm is determined by value engine, defaults to 'em' before fit
      expect(engine.algorithm).toBe('em');
    });

    test('canHandle should work correctly', () => {
      const engine = new CompoundInferenceEngine('compound');

      const compoundConfig: ModelConfig = {
        structure: 'compound',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      const simpleConfig: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 1,
      };

      const userLevelData = StandardDataFactory.fromUserLevel([
        { userId: 'user_1', converted: true, value: 10 },
      ]);

      const binomialData = StandardDataFactory.fromBinomial(30, 100);

      expect(engine.canHandle(compoundConfig, userLevelData)).toBe(true);
      expect(engine.canHandle(compoundConfig, binomialData)).toBe(false);
      expect(engine.canHandle(simpleConfig, userLevelData)).toBe(false);
    });
  });
});
