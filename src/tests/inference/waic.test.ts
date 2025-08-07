import { describe, it, expect } from 'vitest';
// TODO: Update to use ModelRouter directly instead of old InferenceEngine
// import { InferenceEngine } from '../../inference/InferenceEngine';
import { ModelSelectionCriteria } from '../../../src/inference/ModelSelectionCriteriaSimple.ts';
import { ModelRouter } from '../../inference/ModelRouter';
import type { UserData } from '../../inference/base/types';

// Skip until updated to use new architecture
const InferenceEngine = null;

// Helper to generate binomial data
function generateBinomialData(
  successes: number,
  trials: number
): { successes: number; trials: number } {
  return { successes, trials };
}

// Helper to generate continuous data
function generateContinuousData(values: number[]): number[] {
  return values;
}

// Helper to generate multimodal data
function generateMultimodalData(): number[] {
  // Create data with two clear modes
  const mode1 = Array.from({ length: 50 }, () => 10 + Math.random() * 5);
  const mode2 = Array.from({ length: 50 }, () => 30 + Math.random() * 5);
  return [...mode1, ...mode2];
}

// Debug helper to test multimodality detection
function debugMultimodalityDetection(data: number[]) {
  const n = data.length;
  const mean = data.reduce((a, b) => a + b, 0) / n;
  const variance = data.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / (n - 1);
  const std = Math.sqrt(variance);
  const cv = std / mean;

  // Skewness
  const skewness = data.reduce((a, x) => a + Math.pow((x - mean) / std, 3), 0) / n;

  // Kurtosis
  const kurtosis = data.reduce((a, x) => a + Math.pow((x - mean) / std, 4), 0) / n - 3;

  // Bimodality coefficient
  const bimodalityCoefficient =
    (skewness ** 2 + 1) / (kurtosis + (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)));

  // Percentile gaps
  const sorted = [...data].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(0.25 * n)];
  const p75 = sorted[Math.floor(0.75 * n)];
  const p50 = sorted[Math.floor(0.5 * n)];
  const gap1 = Math.abs(p25 - p50);
  const gap2 = Math.abs(p75 - p50);
  const meanGap = (gap1 + gap2) / 2;
  const hasGaps = meanGap > std * 0.5;

  return {
    n,
    mean,
    std,
    cv,
    skewness,
    kurtosis,
    bimodalityCoefficient,
    p25,
    p50,
    p75,
    gap1,
    gap2,
    meanGap,
    hasGaps,
    highKurtosis: kurtosis > 2,
    bimodalThreshold: bimodalityCoefficient > 0.4,
  };
}

describe.skip('WAIC basic functionality', () => {
  it('computes WAIC for a simple beta-binomial model', async () => {
    const engine = new InferenceEngine();
    // Known parameters: 8 successes out of 10 trials
    const data = generateBinomialData(8, 10);
    const result = await engine.fit('beta-binomial', { data });

    const waicResult = await ModelSelectionCriteria.computeWAIC(
      result.posterior,
      [data],
      'beta-binomial'
    );
    expect(Number.isFinite(waicResult.waic)).toBe(true);
    expect(Number.isFinite(waicResult.elpd)).toBe(true);
    expect(Number.isFinite(waicResult.pWaic)).toBe(true);
    expect(Number.isFinite(waicResult.logLikelihood)).toBe(true);
  });

  it('computes WAIC for lognormal model', async () => {
    const engine = new InferenceEngine();
    // Generate some lognormal-like data
    const data = generateContinuousData([10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    const result = await engine.fit('lognormal', { data });

    const waicResult = await ModelSelectionCriteria.computeWAIC(
      result.posterior,
      data,
      'lognormal'
    );
    expect(Number.isFinite(waicResult.waic)).toBe(true);
    expect(Number.isFinite(waicResult.elpd)).toBe(true);
    expect(Number.isFinite(waicResult.pWaic)).toBe(true);
    expect(Number.isFinite(waicResult.logLikelihood)).toBe(true);
  });

  it('compares models using WAIC', async () => {
    const engine = new InferenceEngine();
    const data = generateContinuousData([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Fit different models
    const result1 = await engine.fit('lognormal', { data });
    const result2 = await engine.fit('normal-mixture', { data, config: { numComponents: 2 } });

    const models = [
      { name: 'LogNormal', posterior: result1.posterior, modelType: 'lognormal' },
      { name: 'Normal Mixture (2)', posterior: result2.posterior, modelType: 'normal-mixture' },
    ];

    const comparison = await ModelSelectionCriteria.compareModels(models, data);

    expect(comparison).toHaveLength(2);
    expect(comparison[0].waic).toBeLessThan(comparison[1].waic); // Best model first
    expect(comparison[0].deltaWAIC).toBe(0); // Best model has delta = 0
    expect(comparison[0].weight).toBeGreaterThan(0);
    expect(comparison[0].weight).toBeLessThanOrEqual(1);
  });

  it('handles edge cases: single data point', async () => {
    const engine = new InferenceEngine();
    const data = generateBinomialData(1, 1);
    const result = await engine.fit('beta-binomial', { data });

    const waicResult = await ModelSelectionCriteria.computeWAIC(
      result.posterior,
      [data],
      'beta-binomial'
    );
    expect(Number.isFinite(waicResult.waic)).toBe(true);
    // With single data point, pWaic should be very small
    expect(waicResult.pWaic).toBeGreaterThanOrEqual(0);
  });

  it('handles edge cases: extreme data', async () => {
    const engine = new InferenceEngine();
    // Very high conversion rate
    const data = generateBinomialData(99, 100);
    const result = await engine.fit('beta-binomial', { data });

    const waicResult = await ModelSelectionCriteria.computeWAIC(
      result.posterior,
      [data],
      'beta-binomial'
    );
    expect(Number.isFinite(waicResult.waic)).toBe(true);
    expect(waicResult.logLikelihood).toBeLessThan(0); // Log likelihood should be negative
  });

  it('validates WAIC properties', async () => {
    const engine = new InferenceEngine();
    const data = generateBinomialData(5, 10);
    const result = await engine.fit('beta-binomial', { data });

    const waicResult = await ModelSelectionCriteria.computeWAIC(
      result.posterior,
      [data],
      'beta-binomial'
    );

    // WAIC = -2 * (lppd - pWaic)
    const expectedWaic = -2 * (waicResult.logLikelihood - waicResult.pWaic);
    expect(waicResult.waic).toBeCloseTo(expectedWaic, 10);

    // ELPD = lppd - pWaic
    const expectedElpd = waicResult.logLikelihood - waicResult.pWaic;
    expect(waicResult.elpd).toBeCloseTo(expectedElpd, 10);

    // pWaic should be non-negative (variance is always non-negative)
    expect(waicResult.pWaic).toBeGreaterThanOrEqual(0);
  });

  it('tests different sample sizes', async () => {
    const engine = new InferenceEngine();
    const data = generateBinomialData(8, 10);
    const result = await engine.fit('beta-binomial', { data });

    // Test with different numbers of samples
    const originalSamples = ModelSelectionCriteria.WAIC_SAMPLES;

    // Test with fewer samples
    ModelSelectionCriteria.WAIC_SAMPLES = 100;
    const waicResult1 = await ModelSelectionCriteria.computeWAIC(
      result.posterior,
      [data],
      'beta-binomial'
    );

    // Test with more samples
    ModelSelectionCriteria.WAIC_SAMPLES = 2000;
    const waicResult2 = await ModelSelectionCriteria.computeWAIC(
      result.posterior,
      [data],
      'beta-binomial'
    );

    // Both should be finite
    expect(Number.isFinite(waicResult1.waic)).toBe(true);
    expect(Number.isFinite(waicResult2.waic)).toBe(true);

    // Restore original
    ModelSelectionCriteria.WAIC_SAMPLES = originalSamples;
  });
});

describe.skip('ModelRouter WAIC Integration', () => {
  it('uses WAIC for component selection in auto mode', async () => {
    const engine = new InferenceEngine();
    const multimodalData = generateMultimodalData();

    // Test auto mode with WAIC enabled
    const result = await engine.fit(
      'auto',
      { data: multimodalData },
      {
        useWAIC: true,
        returnRouteInfo: true,
      }
    );

    // Should select a mixture model
    expect(result.routeInfo?.recommendedModel).toMatch(/mixture/);

    // Should have WAIC comparison info
    expect(result.routeInfo?.modelParams?.waicComparison).toBeDefined();
    expect(result.routeInfo?.modelParams?.numComponents).toBeGreaterThan(0);

    // Should have reasoning
    expect(result.routeInfo?.reasoning).toBeDefined();
    expect(result.routeInfo?.reasoning.length).toBeGreaterThan(0);

    // Should have WAIC info in result
    expect(result.waicInfo).toBeDefined();
    expect(Number.isFinite(result.waicInfo?.waic)).toBe(true);
  });

  it('falls back to heuristics when WAIC is disabled', async () => {
    const engine = new InferenceEngine();
    const multimodalData = generateMultimodalData();

    // Test auto mode with WAIC disabled
    const result = await engine.fit(
      'auto',
      { data: multimodalData },
      {
        useWAIC: false,
        returnRouteInfo: true,
      }
    );

    // Should still select a model
    expect(result.routeInfo?.recommendedModel).toBeDefined();

    // Should not have WAIC comparison info
    expect(result.routeInfo?.modelParams?.waicComparison).toBeUndefined();

    // Should still have reasoning
    expect(result.routeInfo?.reasoning).toBeDefined();
  });

  it('selects optimal components using WAIC', async () => {
    const engine = new InferenceEngine();
    const multimodalData = generateMultimodalData();

    // Test component selection directly
    const selection = await ModelRouter.selectOptimalComponents(
      multimodalData,
      'normal-mixture',
      4,
      engine,
      true
    );

    expect(selection.numComponents).toBeGreaterThan(0);
    expect(selection.numComponents).toBeLessThanOrEqual(4);
    expect(selection.selectionReason).toBeDefined();

    // Should have WAIC comparison if multiple components were tested
    if (selection.waicComparison) {
      expect(selection.waicComparison.length).toBeGreaterThan(0);
      expect(selection.waicComparison[0].components).toBeDefined();
      expect(selection.waicComparison[0].waic).toBeDefined();
      expect(selection.waicComparison[0].deltaWAIC).toBeDefined();
      expect(selection.waicComparison[0].weight).toBeDefined();
    }
  });

  it('handles WAIC computation failures gracefully', async () => {
    const engine = new InferenceEngine();
    const smallData = [1, 2, 3]; // Too small for meaningful WAIC

    // Should fall back to heuristic
    const selection = await ModelRouter.selectOptimalComponents(
      smallData,
      'normal-mixture',
      4,
      engine,
      true
    );

    expect(selection.numComponents).toBe(1); // Should default to 1 for small data
    expect(selection.selectionReason).toContain('Heuristic');
    expect(selection.waicComparison).toBeUndefined();
  });

  it('routes continuous data with WAIC', async () => {
    const engine = new InferenceEngine();
    const multimodalData = generateMultimodalData();

    // Test routing with WAIC
    const routeResult = await ModelRouter.route(
      { data: multimodalData },
      {
        engine,
        useWAIC: true,
        maxComponents: 4,
      }
    );

    expect(routeResult.recommendedModel).toMatch(/mixture/);
    expect(routeResult.modelParams?.numComponents).toBeDefined();
    expect(routeResult.reasoning.length).toBeGreaterThan(0);

    // Should have WAIC comparison if mixture was selected
    if (routeResult.modelParams?.waicComparison) {
      expect(routeResult.modelParams.waicComparison.length).toBeGreaterThan(0);
    }
  });

  it('generates alternatives based on WAIC', async () => {
    const engine = new InferenceEngine();
    const multimodalData = generateMultimodalData();

    // Test routing with alternatives
    const routeResult = await ModelRouter.route(
      { data: multimodalData },
      {
        engine,
        useWAIC: true,
        maxComponents: 4,
      }
    );

    // Should have alternatives if multiple components were viable
    if (routeResult.alternatives) {
      expect(routeResult.alternatives.length).toBeGreaterThan(0);
      expect(routeResult.alternatives[0].model).toBeDefined();
      expect(routeResult.alternatives[0].reason).toBeDefined();
    }
  });

  it('works with different data types', async () => {
    const engine = new InferenceEngine();

    // Test with unimodal data
    const unimodalData = generateContinuousData([10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
    const unimodalResult = await engine.fit(
      'auto',
      { data: unimodalData },
      {
        useWAIC: true,
        returnRouteInfo: true,
      }
    );

    // Should select simple model for unimodal data
    expect(unimodalResult.routeInfo?.recommendedModel).not.toMatch(/mixture/);

    // Test with multimodal data
    const multimodalData = generateMultimodalData();
    const multimodalResult = await engine.fit(
      'auto',
      { data: multimodalData },
      {
        useWAIC: true,
        returnRouteInfo: true,
      }
    );

    // Should select mixture model for multimodal data
    expect(multimodalResult.routeInfo?.recommendedModel).toMatch(/mixture/);
  });

  it('respects maxComponents parameter', async () => {
    const engine = new InferenceEngine();
    const multimodalData = generateMultimodalData();

    // Test with limited components
    const result = await engine.fit(
      'auto',
      { data: multimodalData },
      {
        useWAIC: true,
        returnRouteInfo: true,
        maxComponents: 2,
      }
    );

    if (result.routeInfo?.modelParams?.numComponents) {
      expect(result.routeInfo.modelParams.numComponents).toBeLessThanOrEqual(2);
    }
  });
});

describe.skip('Debug: Multimodality Detection', () => {
  it('debugs why multimodal data is not detected', () => {
    const multimodalData = generateMultimodalData();
    const stats = debugMultimodalityDetection(multimodalData);

    console.log('Multimodal data stats:', stats);

    // Check if our data should be detected as multimodal
    const evidence = [stats.bimodalThreshold, stats.highKurtosis, stats.hasGaps].filter(
      Boolean
    ).length;

    console.log('Evidence count:', evidence);
    console.log('Should be multimodal:', evidence >= 2);

    // The test should pass if our data is actually multimodal
    expect(evidence).toBeGreaterThanOrEqual(2);
  });
});

describe.skip('Compound Model WAIC Integration', () => {
  it('selects optimal compound model using WAIC', async () => {
    const engine = new InferenceEngine();

    // Generate compound data with clear customer segments
    const compoundData = generateCompoundData();

    // Test auto mode with WAIC enabled
    const result = await engine.fit(
      'auto',
      { data: compoundData },
      {
        useWAIC: true,
        returnRouteInfo: true,
      }
    );

    // Should select a compound model
    expect(result.routeInfo?.recommendedModel).toMatch(/compound/);

    // Should have WAIC comparison info if multiple models were tested
    if (result.routeInfo?.modelParams?.waicComparison) {
      expect(result.routeInfo.modelParams.waicComparison.length).toBeGreaterThan(0);
    }

    // Should have reasoning
    expect(result.routeInfo?.reasoning).toBeDefined();
    expect(result.routeInfo?.reasoning.length).toBeGreaterThan(0);

    // Should have WAIC info in result
    expect(result.waicInfo).toBeDefined();
    expect(Number.isFinite(result.waicInfo?.waic)).toBe(true);
  });

  it('falls back to heuristics for small compound datasets', async () => {
    const engine = new InferenceEngine();

    // Small compound dataset
    const smallCompoundData = [
      { converted: true, value: 10 },
      { converted: false, value: 0 },
      { converted: true, value: 20 },
    ];

    const result = await engine.fit(
      'auto',
      { data: smallCompoundData },
      {
        useWAIC: true,
        returnRouteInfo: true,
      }
    );

    // Should still select a compound model
    expect(result.routeInfo?.recommendedModel).toMatch(/compound/);

    // Should not have WAIC comparison info (heuristic fallback)
    expect(result.routeInfo?.modelParams?.waicComparison).toBeUndefined();

    // Should have reasoning about heuristic fallback
    expect(result.routeInfo?.reasoning).toBeDefined();
    expect(result.routeInfo?.reasoning.some((r) => r.includes('heuristic'))).toBe(true);
  });
});

// Helper function to generate compound data
function generateCompoundData(): UserData[] {
  const data: UserData[] = [];

  // Generate 100 users with conversion rates and revenue values
  for (let i = 0; i < 100; i++) {
    const converted = Math.random() < 0.3; // 30% conversion rate
    const value = converted
      ? Math.random() < 0.5
        ? 10 + Math.random() * 20 // Low-value segment
        : 50 + Math.random() * 100 // High-value segment
      : 0;

    data.push({ converted, value });
  }

  return data;
}
