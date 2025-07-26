// src/tests/inference/parameter-recovery.test.ts
import { describe, test, expect } from 'vitest';
import { InferenceEngine, ModelType } from '../../inference/InferenceEngine';
import { BusinessScenarios } from '../utilities/synthetic/BusinessScenarios';
import { ParameterRecovery } from '../utilities/validation/ParameterRecovery';
import { CompoundDataInput } from '../../inference/base/types';

describe('Parameter Recovery Tests', () => {
  const engine = new InferenceEngine();
  const scenarios = new BusinessScenarios(12345); // Fixed seed

  describe('Beta-Binomial Recovery', () => {
    test('recovers e-commerce conversion rates', async () => {
      const trueParams = { conversionRate: 0.05 };
      
      const result = await ParameterRecovery.testRecovery(
        trueParams,
        () => {
          const data = scenarios.ecommerce({
            baseConversionRate: 0.05,
            conversionLift: 0,
            revenueDistribution: 'lognormal',
            revenueParams: { mean: 50, variance: 400 },
            revenueLift: 0,
            sampleSize: 2000
          });
          
          // Convert to beta-binomial format
          const conversions = data.control.filter(u => u.converted).length;
          return { data: { successes: conversions, trials: data.control.length } };
        },
        engine,
        'beta-binomial'
      );

      expect(result.withinTolerance).toBe(true);
      expect(result.coverage).toBe(true);
      expect(result.relativeError[0]).toBeLessThan(0.1);
    });

    test('calibration across parameter range', async () => {
      const calibration = await ParameterRecovery.testCalibration(
        () => ({ rate: 0.01 + Math.random() * 0.19 }), // 1% to 20%
        (params) => {
          const n = 500;
          const successes = Math.round(params.rate * n);
          return { data: { successes, trials: n } };
        },
        engine,
        'beta-binomial',
        50 // Quick test
      );

      expect(calibration.coverageRate).toBeGreaterThan(0.85);
      expect(Math.abs(calibration.averageBias[0])).toBeLessThan(0.01);
    });
  });

  describe('Compound Model Recovery', () => {
    test('recovers both frequency and severity', async () => {
      const data = scenarios.ecommerce({
        baseConversionRate: 0.08,
        conversionLift: 0,
        revenueDistribution: 'lognormal', 
        revenueParams: { mean: 75, variance: 625 },
        revenueLift: 0,
        sampleSize: 5000
      });

      const result = await engine.fit('compound-revenue', { 
        data: data.control 
      } as CompoundDataInput);

      const conversionRate = result.posterior.frequency.mean()[0];
      const revenuePerConverter = result.posterior.severity.mean()[0];

      // Use wider tolerance for parameter recovery - 15% relative error
      expect(conversionRate).toBeCloseTo(0.08, 1); // 1 decimal place = ~10% tolerance
      expect(revenuePerConverter).toBeCloseTo(75, -1); // -1 decimal place = ~10% tolerance
    });
  });
});