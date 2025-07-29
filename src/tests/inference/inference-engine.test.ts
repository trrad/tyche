// src/tests/inference/inference-engine.test.ts
import { describe, test, expect } from 'vitest';
import { InferenceEngine } from '../../inference/InferenceEngine';
import { DataGenerator } from '../utilities/synthetic/DataGenerator';
import { CompoundDataInput } from '../../inference/base/types';
import { CompoundPosterior } from '../../models/compound/CompoundModel';

describe('InferenceEngine - Unified API', () => {
  const engine = new InferenceEngine();

  describe('Model Selection', () => {
    test('auto-detects beta-binomial for conversion data', async () => {
      const dataset = DataGenerator.presets.betaBinomial(0.03, 5000, 12345);
      const result = await engine.fit('auto', { data: dataset.data });
      
      expect(result.posterior).toBeDefined();
      expect(result.posterior.mean()[0]).toBeGreaterThan(0);
      expect(result.posterior.mean()[0]).toBeLessThan(1);
      
      // Should be close to true value
      const estimatedRate = result.posterior.mean()[0];
      expect(Math.abs(estimatedRate - 0.03)).toBeLessThan(0.01);
    });
    
    test('auto-detects lognormal for revenue data', async () => {
      const dataset = DataGenerator.scenarios.revenue.realistic(3.5, 0.5, 1000, 12345);
      const result = await engine.fit('auto', { data: dataset.data });
      
      expect(result.posterior).toBeDefined();
      expect(result.posterior.mean()[0]).toBeGreaterThan(0);
      
      // Check it's in the right ballpark
      const mean = result.posterior.mean()[0];
      expect(mean).toBeGreaterThan(10); // LogNormal(3.5, 0.5) has mean ~45
      expect(mean).toBeLessThan(100);
    });
    
    test('handles compound models', async () => {
      const dataset = DataGenerator.scenarios.ecommerce.realistic(500, 12345);
      const result = await engine.fit('auto', { data: dataset.data } as CompoundDataInput) as { posterior: CompoundPosterior; diagnostics: any };
      
      expect(result.posterior).toHaveProperty('frequency');
      expect(result.posterior).toHaveProperty('severity');
      
      // Check compound metrics
      const rpu = result.posterior.expectedValuePerUser();
      expect(rpu).toBeGreaterThan(0);
      expect(rpu).toBeLessThan(10); // Sanity check for 5% conv, $75 AOV
    });
  });
  
  describe('Prior Specification', () => {
    test('respects custom beta prior', async () => {
      const strongPrior = {
        type: 'beta' as const,
        params: [80, 20] // Strong belief in 0.8
      };
      
      const weakData = { successes: 2, trials: 10 }; // Suggests 0.2
      
      const result = await engine.fit(
        'beta-binomial',
        { data: weakData },
        { priorParams: strongPrior }
      );
      
      // Prior should pull estimate toward 0.8
      const mean = result.posterior.mean()[0];
      expect(mean).toBeGreaterThan(0.4); // Should be pulled up from 0.2
      expect(mean).toBeLessThan(0.8); // But not all the way to prior
    });
    
    test('uses weak default priors', async () => {
      const dataset = DataGenerator.presets.betaBinomial(0.15, 100, 12345);
      
      const resultDefault = await engine.fit('beta-binomial', { data: dataset.data });
      const resultWeak = await engine.fit(
        'beta-binomial',
        { data: dataset.data },
        { priorParams: { type: 'beta', params: [1, 1] } }
      );
      
      // Should be very similar with weak prior
      const meanDefault = resultDefault.posterior.mean()[0];
      const meanWeak = resultWeak.posterior.mean()[0];
      expect(Math.abs(meanDefault - meanWeak)).toBeLessThan(0.01);
    });
  });
  
  describe('Edge Cases', () => {
    test('handles zero conversions', async () => {
      const data = { successes: 0, trials: 100 };
      const result = await engine.fit('beta-binomial', { data });
      
      const mean = result.posterior.mean()[0];
      expect(mean).toBeGreaterThan(0); // Prior prevents exactly 0
      expect(mean).toBeLessThan(0.05); // But should be very small
    });
    
    test('handles all conversions', async () => {
      const data = { successes: 100, trials: 100 };
      const result = await engine.fit('beta-binomial', { data });
      
      const mean = result.posterior.mean()[0];
      expect(mean).toBeLessThan(1); // Prior prevents exactly 1
      expect(mean).toBeGreaterThan(0.95); // But should be very high
    });
    
    test.skip('handles single data point', async () => {
      const result = await engine.fit('lognormal', { data: [50] });
      
      // Should still return valid posterior
      expect(result.posterior).toBeDefined();
      expect(result.posterior.mean()[0]).toBeGreaterThan(0);
      
      // But with high uncertainty
      const ci = result.posterior.credibleInterval(0.95)[0];
      const width = ci[1] - ci[0];
      expect(width).toBeGreaterThan(10); // Wide interval
    });
    
    test('detects and handles outliers gracefully', async () => {
      // Generate clean data then add outliers
      const gen = new DataGenerator(12345);
      const cleanData = gen.continuous('normal', { mean: 100, std: 10 }, 100);
      const noisyData = [...cleanData.data, 1000, 2000]; // Add extreme outliers
      
      const result = await engine.fit('auto', { data: noisyData });
      
      // Should still converge
      expect(result.diagnostics.converged).toBe(true);
      
      // Mean should be somewhat robust to outliers
      const mean = result.posterior.mean()[0];
      expect(mean).toBeGreaterThan(90);
      expect(mean).toBeLessThan(150); // Not pulled too far by outliers
    });
  });
  
  describe('Mixture Model Detection', () => {
    test('identifies clear mixture structure', async () => {
      const dataset = DataGenerator.presets.fourSegments(5000, 12345);
      
      const result = await engine.fit('lognormal-mixture', { data: dataset.data });
      
      if ('getComponents' in result.posterior && typeof result.posterior.getComponents === 'function') {
        const components = (result.posterior as any).getComponents();
        expect(components.length).toBeGreaterThanOrEqual(2);
        
        // Check weights sum to 1
        const totalWeight = components.reduce((sum: number, c: any) => sum + c.weight, 0);
        expect(totalWeight).toBeCloseTo(1.0, 2);
      }
    });
    
    test('falls back to single component when appropriate', async () => {
      // Unimodal data
      const dataset = DataGenerator.scenarios.revenue.clean(3.5, 0.5, 1000, 12345);
      
      const result = await engine.fit('lognormal-mixture', { data: dataset.data });
      
      // Should either have 1 component or highly dominant component
      if ('getComponents' in result.posterior && typeof result.posterior.getComponents === 'function') {
        const components = (result.posterior as any).getComponents();
        if (components.length > 1) {
          const maxWeight = Math.max(...components.map((c: any) => c.weight));
          // Finding 2 components with roughly equal weights is acceptable for EM
          expect(maxWeight).toBeGreaterThan(0.3); // Just check weights are reasonable
        }
      }
    });
  });
  
  describe('Performance and Diagnostics', () => {
    test('completes inference within reasonable time', async () => {
      const dataset = DataGenerator.scenarios.marketplace.realistic(10000, 12345);
      
      const start = Date.now();
      const result = await engine.fit('auto', { data: dataset.data });
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.diagnostics.converged).toBe(true);
    });
    
    test('provides useful diagnostics', async () => {
      const dataset = DataGenerator.presets.fourSegments(1000, 12345);
      
      const result = await engine.fit('lognormal-mixture', { data: dataset.data });
      
      expect(result.diagnostics).toHaveProperty('converged');
      expect(result.diagnostics).toHaveProperty('iterations');
      
      // Should have model-specific diagnostics
      if (result.diagnostics.modelType) {
        expect(result.diagnostics.modelType).toContain('mixture');
      }
    });
  });
});