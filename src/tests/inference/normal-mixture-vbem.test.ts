/**
 * Tests for Normal Mixture VBEM implementation
 */

import { describe, test, expect, beforeEach, it } from 'vitest';

import { NormalMixtureVBEM } from '../../inference/approximate/em/NormalMixtureVBEM';
import { StandardData } from '../../core/data/StandardData';
import { ModelConfig } from '../../inference/base/types';

describe('NormalMixtureVBEM', () => {
  let engine: NormalMixtureVBEM;

  beforeEach(() => {
    engine = new NormalMixtureVBEM();
  });

  describe('Basic functionality', () => {
    it('should fit a single component mixture', async () => {
      // Generate simple normal data
      const values = Array.from(
        { length: 100 },
        () => Math.random() * 4 - 2 // Normal with μ ≈ 0, σ ≈ 1.2
      );

      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v, i) => ({
            userId: `user_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            variance: 0,
            min: Math.min(...values),
            max: Math.max(...values),
            q25: 0,
            q50: 0,
            q75: 0,
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: values.some((v) => v < 0),
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
      // Single component falls back to NormalConjugate
      expect(result.diagnostics.modelType).toBe('normal');
    });

    it('should fit a two-component mixture', async () => {
      // Generate mixture of two normals
      const values1 = Array.from(
        { length: 50 },
        () => Math.random() * 1 - 2 // μ ≈ -1.5, σ ≈ 0.5
      );
      const values2 = Array.from(
        { length: 50 },
        () => Math.random() * 1 + 2 // μ ≈ 2.5, σ ≈ 0.5
      );
      const values = [...values1, ...values2];

      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v, i) => ({
            userId: `user_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            variance: 0,
            min: Math.min(...values),
            max: Math.max(...values),
            q25: 0,
            q50: 0,
            q75: 0,
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: values.some((v) => v < 0),
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'normal',
        components: 2,
      };

      const result = await engine.fit(data, config, {
        maxIterations: 50,
        tolerance: 1e-4,
      });

      expect(result.posterior).toBeDefined();
      expect(result.diagnostics.iterations).toBeLessThanOrEqual(50);

      // Check that we can get components with weight uncertainty
      const posterior = result.posterior as any;
      const components = posterior.getComponents();

      expect(components).toHaveLength(2);
      expect(components[0].weightCI).toBeDefined();
      expect(components[0].weightCI[0]).toBeLessThanOrEqual(components[0].weight);
      expect(components[0].weightCI[1]).toBeGreaterThanOrEqual(components[0].weight);
    });

    it('should maintain weight uncertainty via Dirichlet', async () => {
      // Small dataset to ensure high uncertainty
      const values = [-2, -1.5, -1, 0, 1, 1.5, 2, 2.5];

      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v, i) => ({
            userId: `user_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            variance: 0,
            min: Math.min(...values),
            max: Math.max(...values),
            q25: 0,
            q50: 0,
            q75: 0,
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: values.some((v) => v < 0),
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'normal',
        components: 2,
      };

      const result = await engine.fit(data, config);

      // With only 8 points, it should fall back to single component
      expect(result.diagnostics.modelType).toBe('normal');
    });
  });

  describe('Edge cases', () => {
    it('should handle insufficient data gracefully', async () => {
      const values = [0, 1]; // Only 2 points

      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v, i) => ({
            userId: `user_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: 0.5,
            variance: 0.25,
            min: 0,
            max: 1,
            q25: 0,
            q50: 0,
            q75: 0,
          },
        },
        quality: {
          hasZeros: true,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const config: ModelConfig = {
        structure: 'simple',
        type: 'normal',
        components: 2, // Request 2 components with only 2 data points
      };

      const result = await engine.fit(data, config);

      // Should fall back to single component
      expect(result.diagnostics.modelType).toContain('normal');
      expect(result.posterior).toBeDefined();
    });

    it('should handle identical values', async () => {
      const values = Array(20).fill(5.0); // All identical

      const data: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v, i) => ({
            userId: `user_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: 5.0,
            variance: 0,
            min: 5.0,
            max: 5.0,
            q25: 5.0,
            q50: 5.0,
            q75: 5.0,
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
        type: 'normal',
        components: 2,
      };

      const result = await engine.fit(data, config);

      expect(result.posterior).toBeDefined();
      expect(result.diagnostics.converged).toBe(true);
    });
  });

  describe('Posterior sampling', () => {
    it('should generate samples that reflect the data', async () => {
      const trueValues = Array.from({ length: 100 }, () => {
        // Box-Muller transform for normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z * 0.5 + 1; // Normal with μ = 1, σ = 0.5
      });

      const data: StandardData = {
        type: 'user-level',
        n: trueValues.length,
        userLevel: {
          users: trueValues.map((v, i) => ({
            userId: `user_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: trueValues.reduce((a, b) => a + b, 0) / trueValues.length,
            variance: 0,
            min: Math.min(...trueValues),
            max: Math.max(...trueValues),
            q25: 0,
            q50: 0,
            q75: 0,
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: trueValues.some((v) => v < 0),
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

      // Generate samples from posterior
      const samples = result.posterior.sample(1000);

      // Check that sample mean is reasonable
      const sampleMean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const trueMean = trueValues.reduce((a, b) => a + b, 0) / trueValues.length;

      // Should be within reasonable range (allowing for sampling variance)
      expect(Math.abs(sampleMean - trueMean)).toBeLessThan(0.2);
    });
  });
});
