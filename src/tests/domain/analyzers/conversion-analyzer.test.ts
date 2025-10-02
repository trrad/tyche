/**
 * ConversionAnalyzer Tests
 *
 * Tests for the ConversionAnalyzer implementation to ensure it properly
 * orchestrates statistical engines for binary conversion analysis.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ConversionAnalyzer } from '../../../domain/analyzers/ConversionAnalyzer';
import { ExperimentData, VariantData } from '../../../domain/types/experiment';
import { StandardDataFactory } from '../../../core/data/StandardData';
import { BetaDistribution } from '../../../core/distributions/BetaDistribution';

describe('ConversionAnalyzer', () => {
  let analyzer: ConversionAnalyzer;

  beforeEach(() => {
    analyzer = new ConversionAnalyzer();
  });

  describe('Basic Analysis', () => {
    test('should analyze binomial conversion experiment', async () => {
      // Use large sample sizes for statistical accuracy testing
      const controlData = StandardDataFactory.fromBinomial(5000, 10000); // 50% conversion
      const treatmentData = StandardDataFactory.fromBinomial(6000, 10000); // 60% conversion

      const experimentData: ExperimentData = {
        id: 'test-experiment-1',
        name: 'Conversion Test',
        variants: {
          control: {
            name: 'control',
            data: controlData,
          },
          treatments: new Map([
            [
              'treatment',
              {
                name: 'treatment',
                data: treatmentData,
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date('2024-01-01'),
          hypothesis: 'Treatment increases conversion rate',
        },
      };

      const result = await analyzer.analyze(experimentData);

      // Verify result structure
      expect(result).toBeDefined();
      expect(result.getVariantNames()).toEqual(['control', 'treatment']);

      // Verify control result
      const controlResult = result.getVariantResult('control');
      expect(controlResult).toBeDefined();
      expect(controlResult!.getPosterior()).toBeDefined();

      // Verify treatment result
      const treatmentResult = result.getVariantResult('treatment');
      expect(treatmentResult).toBeDefined();
      expect(treatmentResult!.getPosterior()).toBeDefined();

      // Check that posteriors are Beta distributions (for conversion analysis)
      const controlPosterior = controlResult!.getPosterior();
      expect(controlPosterior.hasAnalyticalForm()).toBe(true);
      expect('getParameters' in controlPosterior).toBe(true);

      // Verify comparison capabilities
      const comparison = await result.compareVariants();
      expect(comparison.comparisons.has('treatment')).toBe(true);
    });

    test('should analyze user-level conversion experiment', async () => {
      // Use large sample sizes for meaningful statistical testing
      const controlUsers = Array.from({ length: 10000 }, (_, i) => ({
        userId: `control_${i}`,
        converted: i < 5000, // 50% conversion
        value: i < 5000 ? 1 : 0,
      }));

      const treatmentUsers = Array.from({ length: 10000 }, (_, i) => ({
        userId: `treatment_${i}`,
        converted: i < 6000, // 60% conversion
        value: i < 6000 ? 1 : 0,
      }));

      const controlData = StandardDataFactory.fromUserLevel(controlUsers);
      const treatmentData = StandardDataFactory.fromUserLevel(treatmentUsers);

      const experimentData: ExperimentData = {
        id: 'test-experiment-2',
        name: 'User Level Conversion Test',
        variants: {
          control: {
            name: 'control',
            data: controlData,
          },
          treatments: new Map([
            [
              'treatment',
              {
                name: 'treatment',
                data: treatmentData,
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date('2024-01-01'),
          hypothesis: 'Treatment increases conversion rate',
        },
      };

      const result = await analyzer.analyze(experimentData);

      expect(result).toBeDefined();
      expect(result.getVariantNames()).toEqual(['control', 'treatment']);

      // Should route to appropriate model for user-level data
      const controlResult = result.getVariantResult('control');
      expect(controlResult).toBeDefined();

      const summary = controlResult!.getSummaryStats();
      expect(summary.mean).toBeCloseTo(0.5, 2); // ~50% conversion, 2 decimal precision with large N
    });
  });

  describe('Configuration', () => {
    test('should configure with Beta prior', () => {
      const betaPrior = new BetaDistribution(2, 2); // Uniform-ish prior

      analyzer.configure({
        priors: new Map([['conversion', betaPrior]]),
      });

      // Configuration should not throw
      expect(() => {
        analyzer.configure({
          priors: new Map([['conversion', betaPrior]]),
        });
      }).not.toThrow();
    });

    test('should configure with progress callback', () => {
      let progressCalled = false;

      analyzer.configure({
        progressCallback: (progress) => {
          progressCalled = true;
          expect(progress).toBeGreaterThanOrEqual(0);
          expect(progress).toBeLessThanOrEqual(1);
        },
      });

      // Progress callback should be stored (we can't easily test it's called without running analysis)
      expect(progressCalled).toBe(false); // Not called during configuration
    });
  });

  describe('Multiple Treatments', () => {
    test('should handle multiple treatment variants', async () => {
      // Large sample sizes for multi-arm testing
      const controlData = StandardDataFactory.fromBinomial(5000, 10000); // 50%
      const treatment1Data = StandardDataFactory.fromBinomial(5500, 10000); // 55%
      const treatment2Data = StandardDataFactory.fromBinomial(6500, 10000); // 65%

      const experimentData: ExperimentData = {
        id: 'multi-treatment-test',
        name: 'Multi-Treatment Conversion Test',
        variants: {
          control: {
            name: 'control',
            data: controlData,
          },
          treatments: new Map([
            [
              'treatment_a',
              {
                name: 'treatment_a',
                data: treatment1Data,
              },
            ],
            [
              'treatment_b',
              {
                name: 'treatment_b',
                data: treatment2Data,
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date('2024-01-01'),
          hypothesis: 'Treatments increase conversion rate',
        },
      };

      const result = await analyzer.analyze(experimentData);

      expect(result.getVariantNames()).toEqual(['control', 'treatment_a', 'treatment_b']);

      // All variants should have results
      expect(result.getVariantResult('control')).toBeDefined();
      expect(result.getVariantResult('treatment_a')).toBeDefined();
      expect(result.getVariantResult('treatment_b')).toBeDefined();

      // Should be able to compare all treatments
      const comparison = await result.compareVariants();
      expect(comparison.comparisons.has('treatment_a')).toBe(true);
      expect(comparison.comparisons.has('treatment_b')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should reject experiment without control', async () => {
      const treatmentData = StandardDataFactory.fromBinomial(6000, 10000);

      const experimentData = {
        id: 'no-control-test',
        name: 'No Control Test',
        variants: {
          // Missing control
          treatments: new Map([
            [
              'treatment',
              {
                name: 'treatment',
                data: treatmentData,
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date('2024-01-01'),
          hypothesis: 'This should fail',
        },
      } as any;

      await expect(analyzer.analyze(experimentData)).rejects.toThrow('control variant');
    });

    test('should reject experiment without treatments', async () => {
      const controlData = StandardDataFactory.fromBinomial(5000, 10000);

      const experimentData: ExperimentData = {
        id: 'no-treatment-test',
        name: 'No Treatment Test',
        variants: {
          control: {
            name: 'control',
            data: controlData,
          },
          treatments: new Map(), // Empty treatments
        },
        metadata: {
          startDate: new Date('2024-01-01'),
          hypothesis: 'This should fail',
        },
      };

      await expect(analyzer.analyze(experimentData)).rejects.toThrow('treatment variant');
    });

    test('should reject empty data', async () => {
      const emptyData = StandardDataFactory.fromBinomial(0, 0);

      const experimentData: ExperimentData = {
        id: 'empty-data-test',
        name: 'Empty Data Test',
        variants: {
          control: {
            name: 'control',
            data: emptyData,
          },
          treatments: new Map([
            [
              'treatment',
              {
                name: 'treatment',
                data: emptyData,
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date('2024-01-01'),
          hypothesis: 'This should fail',
        },
      };

      await expect(analyzer.analyze(experimentData)).rejects.toThrow('no data');
    });
  });
});
