// src/tests/inference/inference-engine.test.ts
import { describe, test, expect } from 'vitest';
import { InferenceEngine } from '../../inference/InferenceEngine';
import { TestScenarios, Tolerances, isWithinTolerance } from '../scenarios/testscenarios';
import { BusinessScenarios } from '../utilities/synthetic/BusinessScenarios';
import { CompoundDataInput } from '../../inference/base/types';
import { CompoundPosterior } from '../../models/compound/CompoundModel';

describe('InferenceEngine - Unified API', () => {
  const engine = new InferenceEngine();
  const scenarios = new BusinessScenarios(12345); // Fixed seed for reproducibility

  describe('Model Selection', () => {
    test('auto-detects beta-binomial for conversion data', async () => {
      const data = { successes: 150, trials: 5000 };
      const result = await engine.fit('auto', { data });
      
      expect(result.posterior).toBeDefined();
      expect(result.posterior.mean()[0]).toBeGreaterThan(0);
      expect(result.posterior.mean()[0]).toBeLessThan(1);
    });
    
    test('auto-detects lognormal for revenue data', async () => {
      const data = scenarios.ecommerce({
        baseConversionRate: 1.0, // All converted for revenue test
        conversionLift: 0,
        revenueDistribution: 'lognormal',
        revenueParams: { mean: 50, variance: 400 },
        revenueLift: 0,
        sampleSize: 1000
      });
      
      const revenueData = data.control.map(u => u.value).filter(v => v > 0);
      const result = await engine.fit('auto', { data: revenueData });
      
      expect(result.posterior).toBeDefined();
      expect(result.posterior.mean()[0]).toBeGreaterThan(0);
    });
    
    test('handles compound models', async () => {
      const users = TestScenarios.compound.controlVariant.generateUsers(500);
      const result = await engine.fit('auto', { data: users } as CompoundDataInput) as { posterior: CompoundPosterior; diagnostics: any };
      
      expect(result.posterior).toHaveProperty('frequency');
      expect(result.posterior).toHaveProperty('severity');
      
      // Check compound metrics
      const rpu = result.posterior.expectedValuePerUser();
      expect(rpu).toBeGreaterThan(0);
      expect(rpu).toBeLessThan(10); // Sanity check
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
      expect(mean).toBeGreaterThan(0.5);
      expect(mean).toBeLessThan(0.8);
    });
    
    test('uses sensible defaults when no prior specified', async () => {
      // Use fixed seed for reproducible test
      const testScenarios = new BusinessScenarios(42);
      const data = testScenarios.ecommerce({
        baseConversionRate: 0.03,
        conversionLift: 0,
        revenueDistribution: 'lognormal',
        revenueParams: { mean: 50, variance: 400 },
        revenueLift: 0,
        sampleSize: 10000
      });
      
      const conversions = data.control.filter(u => u.converted).length;
      const binomialData = { successes: conversions, trials: data.control.length };
      
      const result = await engine.fit('beta-binomial', { data: binomialData });
      
      // Should get reasonable estimate - use wider tolerance for stochastic data
      const mean = result.posterior.mean()[0];
      expect(isWithinTolerance(mean, 0.03, Tolerances.PARAMETER_RECOVERY)).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    test('rejects invalid model type', async () => {
      await expect(
        engine.fit('invalid-model' as any, { data: [1, 2, 3] })
      ).rejects.toThrow(/unknown|invalid|supported/i);
    });
    
    test('validates data format for beta-binomial', async () => {
      await expect(
        engine.fit('beta-binomial', { data: [1, 2, 3] }) // Wrong format
      ).rejects.toThrow(/requires.*successes.*trials/i);
    });
    
    test('validates data format for continuous models', async () => {
      await expect(
        engine.fit('lognormal', { data: { successes: 5, trials: 10 } }) // Wrong format
      ).rejects.toThrow(/requires.*array/i);
    });
    
    test('handles empty data gracefully', async () => {
      await expect(
        engine.fit('lognormal', { data: [] })
      ).rejects.toThrow(/empty|no data/i);
    });
  });
  
  describe('Diagnostics', () => {
    test('provides convergence diagnostics', async () => {
      const data = TestScenarios.revenue.ecommerce.generateData(500);
      const result = await engine.fit('lognormal', { data });
      
      const diag = result.diagnostics;
      expect(diag).toHaveProperty('converged');
      expect(diag).toHaveProperty('iterations');
      
      // For iterative methods
      if (diag.iterations > 1) {
        expect(diag.finalELBO ?? diag.finalLogLikelihood).toBeDefined();
      }
    });
    
    test('warns about convergence issues', async () => {
      // Very small sample might cause convergence issues
      const data = TestScenarios.revenue.ecommerce.generateData(5);
      const result = await engine.fit('lognormal', { data });
      
      // Just check convergence status
      expect(typeof result.diagnostics.converged).toBe('boolean');
      
      // Runtime should be measured if available
      if (result.diagnostics.runtime !== undefined) {
        expect(result.diagnostics.runtime).toBeGreaterThanOrEqual(0);
      }
    });
  });
});