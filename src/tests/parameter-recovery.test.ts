// src/tests/parameter-recovery-tests.ts

import { describe, test, expect } from 'vitest';
import { DataGenerator } from '../core/data-generation';
import { InferenceEngine } from '../inference/InferenceEngine';
import { ParameterRecoveryUtils } from './utilities/parameter-recovery-utils';

describe('Parameter Recovery Tests', () => {
  const engine = new InferenceEngine();

  test('recovers beta-binomial parameters', async () => {
    // Generate data with known parameters
    const dataset = DataGenerator.presets.betaBinomial(0.05, 1000, 12345);
    
    // Test recovery
    const result = await ParameterRecoveryUtils.testSingleRecovery(
      dataset,
      engine,
      'beta-binomial'
    );
    
    // Debug: Log the actual inference result
    console.log('Beta-binomial result:', JSON.stringify(result, null, 2));
    
    expect(result.metrics.relativeError).toBeLessThan(0.15); // Within 15% (more realistic)
    expect(result.metrics.coverageCheck).toBe(true);
  });

  test('recovers mixture components', async () => {
    const dataset = DataGenerator.presets.clearSegments(2000, 12345);
    
    const result = await ParameterRecoveryUtils.testSingleRecovery(
      dataset,
      engine
    );
    
    // Check we found the right number of components
    expect(result.recovered.numComponents).toBe(2);
    
    // Check weights are approximately correct (allowing for estimation error)
    const weights = result.recovered.components.map((c: any) => c.weight);
    expect(weights[0]).toBeCloseTo(0.7, 1);
    expect(weights[1]).toBeCloseTo(0.3, 1);
  });

  test('recovers lognormal parameters', async () => {
    const dataset = DataGenerator.presets.lognormal(3.5, 0.5, 1000, 12345);
    
    const result = await ParameterRecoveryUtils.testSingleRecovery(
      dataset,
      engine,
      'lognormal'
    );
    
    expect(result.metrics.relativeError).toBeLessThan(0.2); // Within 20%
  });

  test('recovers compound model parameters', async () => {
    const dataset = DataGenerator.presets.ecommerce(1000, 12345);
    
    const result = await ParameterRecoveryUtils.testSingleRecovery(
      dataset,
      engine,
      'compound-beta-lognormal'
    );
    
    // Check conversion rate recovery
    const trueConvRate = dataset.groundTruth.parameters.conversionRate;
    const recoveredConvRate = result.recovered.frequency?.probability;
    expect(recoveredConvRate).toBeCloseTo(trueConvRate, 1);
    
    // Check revenue mean recovery
    const trueRevenueMean = dataset.groundTruth.parameters.revenueMean;
    const recoveredRevenueMean = result.recovered.severity?.mean;
    expect(recoveredRevenueMean).toBeCloseTo(trueRevenueMean, 0); // Within 1 significant figure
  });

  test('calibration across sample sizes', async () => {
    const sampleSizes = [500, 1000, 2000, 5000];
    const results: Array<{ sampleSize: number; coverage95: number; meanError: number }> = [];
    
    for (const n of sampleSizes) {
      const calibration = await ParameterRecoveryUtils.testCalibration(
        (seed) => DataGenerator.presets.betaBinomial(0.05, n, seed),
        engine,
        20 // 20 runs per sample size for speed
      );
      
      results.push({
        sampleSize: n,
        coverage95: calibration.coverage95,
        meanError: calibration.meanRelativeError
      });
    }
    
    // Coverage should improve with sample size
    expect(results[3].coverage95).toBeGreaterThan(results[0].coverage95);
    
    // Error should decrease with sample size
    expect(results[3].meanError).toBeLessThan(results[0].meanError);
    
    console.table(results);
  });

  test('mixture model recovery across complexity', async () => {
    const configs = [
      { 
        name: '2 components', 
        generator: (n: number, seed: number) => DataGenerator.presets.clearSegments(n, seed)
      },
      { 
        name: '3 components', 
        generator: (n: number, seed: number) => DataGenerator.presets.saasTiers(n, seed)
      },
      { 
        name: '4 components', 
        generator: (n: number, seed: number) => DataGenerator.presets.fourSegments(n, seed)
      }
    ];
    
    for (const config of configs) {
      const dataset = config.generator(2000, 12345);
      const result = await ParameterRecoveryUtils.testSingleRecovery(dataset, engine);
      
      console.log(`${config.name}:`, {
        components: result.recovered.numComponents,
        error: result.metrics.relativeError,
        coverage: result.metrics.coverageCheck
      });
      
      // Should recover the correct number of components
      const expectedComponents = config.name.includes('2') ? 2 : 
                               config.name.includes('3') ? 3 : 4;
      expect(result.recovered.numComponents).toBe(expectedComponents);
    }
  });

  test('generates comprehensive recovery report', async () => {
    const testCases = [
      { name: 'beta-binomial', generator: (seed: number) => DataGenerator.presets.betaBinomial(0.05, 1000, seed) },
      { name: 'lognormal', generator: (seed: number) => DataGenerator.presets.lognormal(3.5, 0.5, 1000, seed) },
      { name: 'mixture', generator: (seed: number) => DataGenerator.presets.clearSegments(1000, seed) },
      { name: 'compound', generator: (seed: number) => DataGenerator.presets.ecommerce(1000, seed) }
    ];
    
    const allResults: any[] = [];
    
    for (const testCase of testCases) {
      for (let i = 0; i < 10; i++) { // 10 runs per test case
        const dataset = testCase.generator(i);
        const result = await ParameterRecoveryUtils.testSingleRecovery(dataset, engine);
        allResults.push(result);
      }
    }
    
    const report = ParameterRecoveryUtils.generateReport(allResults);
    
    console.log('Recovery Report:', report.summary);
    console.log('By Model Type:', report.byModelType);
    
    // Overall performance should be reasonable
    expect(report.summary.meanRelativeError).toBeLessThan(0.3); // Less than 30% error
    expect(report.summary.coverage95).toBeGreaterThan(0.8); // At least 80% coverage
  });
}); 