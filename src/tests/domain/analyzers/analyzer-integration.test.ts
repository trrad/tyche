/**
 * Analyzer Integration Tests
 *
 * Tests that verify the analyzers work together and can be imported correctly.
 */

import { describe, test, expect } from 'vitest';
import {
  ConversionAnalyzer,
  RevenueAnalyzer,
  PriorLearner,
  createAnalyzer,
  createPriorLearner,
} from '../../../domain/analyzers';
import { StandardDataFactory } from '../../../core/data/StandardData';

describe('Analyzer Integration', () => {
  test('should export all analyzer classes', () => {
    expect(ConversionAnalyzer).toBeDefined();
    expect(RevenueAnalyzer).toBeDefined();
    expect(PriorLearner).toBeDefined();
  });

  test('should create analyzers via factory functions', () => {
    const conversionAnalyzer = createAnalyzer('conversion');
    expect(conversionAnalyzer).toBeInstanceOf(ConversionAnalyzer);

    const revenueAnalyzer = createAnalyzer('revenue');
    expect(revenueAnalyzer).toBeInstanceOf(RevenueAnalyzer);

    const priorLearner = createPriorLearner();
    expect(priorLearner).toBeInstanceOf(PriorLearner);
  });

  test('should handle PriorLearner basic workflow', async () => {
    // Create some historical conversion data
    const historicalData = StandardDataFactory.fromBinomial(2500, 5000); // 50% conversion rate

    const priorLearner = new PriorLearner();
    const result = await priorLearner.analyze(historicalData);

    expect(result).toBeDefined();
    expect(result.getPosterior()).toBeDefined();

    // Try to extract a prior (may return null if not extractable)
    const extractedPrior = priorLearner.extractPrior(result);
    // We don't assert it's non-null since extraction depends on posterior type
    // but it should not throw
    expect(() => priorLearner.extractPrior(result)).not.toThrow();
  });

  test('should instantiate analyzers directly', () => {
    expect(() => new ConversionAnalyzer()).not.toThrow();
    expect(() => new RevenueAnalyzer()).not.toThrow();
    expect(() => new PriorLearner()).not.toThrow();
  });
});
