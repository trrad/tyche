/**
 * DataValidator Tests
 *
 * Tests for experiment data validation
 */

import { DataValidator } from '../../domain/validation';
import { ExperimentData, VariantData } from '../../domain/types';
import { StandardData, StandardDataFactory } from '../../core/data/StandardData';
import { TycheError, ErrorCode } from '../../core/errors';

describe('DataValidator', () => {
  // Helper to create valid experiment data
  const createValidExperiment = (): ExperimentData => {
    const controlData = StandardDataFactory.fromBinomial(50, 100);
    const treatmentData = StandardDataFactory.fromBinomial(60, 100);

    return {
      id: 'test-exp-1',
      name: 'Test Experiment',
      variants: {
        control: {
          name: 'Control',
          data: controlData,
        },
        treatments: new Map([
          [
            'treatment-a',
            {
              name: 'Treatment A',
              data: treatmentData,
            },
          ],
        ]),
      },
      metadata: {
        startDate: new Date('2024-01-01'),
        hypothesis: 'Treatment will increase conversion',
      },
    };
  };

  describe('validateExperiment', () => {
    test('should accept valid experiment', () => {
      const experiment = createValidExperiment();
      expect(() => DataValidator.validateExperiment(experiment)).not.toThrow();
    });

    test('should accept multiple treatments', () => {
      const experiment = createValidExperiment();
      experiment.variants.treatments.set('treatment-b', {
        name: 'Treatment B',
        data: StandardDataFactory.fromBinomial(55, 100),
      });

      expect(() => DataValidator.validateExperiment(experiment)).not.toThrow();
    });

    test('should accept user-level data', () => {
      const users = Array(100)
        .fill(0)
        .map((_, i) => ({
          userId: `user-${i}`,
          converted: Math.random() > 0.5,
          value: Math.random() * 100,
        }));

      const experiment: ExperimentData = {
        id: 'test-exp-2',
        name: 'User Level Experiment',
        variants: {
          control: {
            name: 'Control',
            data: StandardDataFactory.fromUserLevel(users),
          },
          treatments: new Map([
            [
              'treatment',
              {
                name: 'Treatment',
                data: StandardDataFactory.fromUserLevel(users),
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date(),
          hypothesis: 'Test hypothesis',
        },
      };

      expect(() => DataValidator.validateExperiment(experiment)).not.toThrow();
    });
  });

  describe('structural validation', () => {
    test('should reject experiment without control', () => {
      const experiment = createValidExperiment();
      (experiment.variants as any).control = undefined;

      expect(() => DataValidator.validateExperiment(experiment)).toThrow(TycheError);

      try {
        DataValidator.validateExperiment(experiment);
      } catch (error) {
        expect((error as TycheError).code).toBe(ErrorCode.INVALID_DATA);
        expect((error as TycheError).message).toContain('control variant');
      }
    });

    test('should reject experiment without treatments', () => {
      const experiment = createValidExperiment();
      experiment.variants.treatments = new Map();

      expect(() => DataValidator.validateExperiment(experiment)).toThrow(TycheError);

      try {
        DataValidator.validateExperiment(experiment);
      } catch (error) {
        expect((error as TycheError).code).toBe(ErrorCode.INVALID_DATA);
        expect((error as TycheError).message).toContain('at least one treatment');
      }
    });

    test('should reject control without data', () => {
      const experiment = createValidExperiment();
      (experiment.variants.control as any).data = undefined;

      expect(() => DataValidator.validateExperiment(experiment)).toThrow(TycheError);

      try {
        DataValidator.validateExperiment(experiment);
      } catch (error) {
        expect((error as TycheError).code).toBe(ErrorCode.INVALID_DATA);
        expect((error as TycheError).message).toContain('Control variant must have data');
      }
    });

    test('should reject treatment without data', () => {
      const experiment = createValidExperiment();
      experiment.variants.treatments.set('bad-treatment', {
        name: 'Bad Treatment',
        data: undefined as any,
      });

      expect(() => DataValidator.validateExperiment(experiment)).toThrow(TycheError);

      try {
        DataValidator.validateExperiment(experiment);
      } catch (error) {
        expect((error as TycheError).code).toBe(ErrorCode.INVALID_DATA);
        expect((error as TycheError).message).toContain(
          'Treatment variant bad-treatment must have data'
        );
      }
    });
  });

  describe('consistency validation', () => {
    test('should reject mixed data types', () => {
      const experiment = createValidExperiment();

      // Control has binomial, treatment has user-level
      const users = Array(100)
        .fill(0)
        .map((_, i) => ({
          userId: `user-${i}`,
          converted: true,
          value: Math.random() * 100,
        }));

      experiment.variants.treatments.set('mixed-type', {
        name: 'Mixed Type',
        data: StandardDataFactory.fromUserLevel(users),
      });

      expect(() => DataValidator.validateExperiment(experiment)).toThrow(TycheError);

      try {
        DataValidator.validateExperiment(experiment);
      } catch (error) {
        expect((error as TycheError).code).toBe(ErrorCode.DATA_MISMATCH);
        expect((error as TycheError).message).toContain('different data type');
        expect((error as TycheError).context).toMatchObject({
          variant: 'mixed-type',
          variantType: 'user-level',
          controlType: 'binomial',
        });
      }
    });

    test('should validate feature consistency in user-level data', () => {
      // Control has features
      const controlUsers = Array(50)
        .fill(0)
        .map((_, i) => ({
          userId: `user-${i}`,
          converted: true,
          value: 100,
          features: { device: 'mobile' as const },
        }));

      // Treatment has no features
      const treatmentUsers = Array(50)
        .fill(0)
        .map((_, i) => ({
          userId: `user-${i}`,
          converted: true,
          value: 100,
        }));

      const experiment: ExperimentData = {
        id: 'test-exp',
        name: 'Feature Test',
        variants: {
          control: {
            name: 'Control',
            data: StandardDataFactory.fromUserLevel(controlUsers),
          },
          treatments: new Map([
            [
              'treatment',
              {
                name: 'Treatment',
                data: StandardDataFactory.fromUserLevel(treatmentUsers),
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date(),
          hypothesis: 'Test',
        },
      };

      expect(() => DataValidator.validateExperiment(experiment)).toThrow(TycheError);

      try {
        DataValidator.validateExperiment(experiment);
      } catch (error) {
        expect((error as TycheError).code).toBe(ErrorCode.DATA_MISMATCH);
        expect((error as TycheError).message).toContain('Feature consistency');
      }
    });

    test('should accept consistent features', () => {
      // Both have features
      const controlUsers = Array(50)
        .fill(0)
        .map((_, i) => ({
          userId: `user-${i}`,
          converted: true,
          value: 100,
          features: { device: 'mobile' as const },
        }));

      const treatmentUsers = Array(50)
        .fill(0)
        .map((_, i) => ({
          userId: `user-${i}`,
          converted: true,
          value: 100,
          features: { device: 'desktop' as const },
        }));

      const experiment: ExperimentData = {
        id: 'test-exp',
        name: 'Feature Test',
        variants: {
          control: {
            name: 'Control',
            data: StandardDataFactory.fromUserLevel(controlUsers),
          },
          treatments: new Map([
            [
              'treatment',
              {
                name: 'Treatment',
                data: StandardDataFactory.fromUserLevel(treatmentUsers),
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date(),
          hypothesis: 'Test',
        },
      };

      expect(() => DataValidator.validateExperiment(experiment)).not.toThrow();
    });
  });

  describe('edge cases', () => {
    test('should validate structure regardless of StandardData contents', () => {
      // DataValidator only validates structure, not StandardData internals
      // Create StandardData directly to test edge cases
      const minimalStandardData: StandardData = {
        type: 'binomial',
        n: 0, // Edge case: zero samples
        binomial: { successes: 0, trials: 0 },
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const experiment: ExperimentData = {
        id: 'test-exp',
        name: 'Edge Case Test',
        variants: {
          control: {
            name: 'Control',
            data: minimalStandardData,
          },
          treatments: new Map([
            [
              'treatment',
              {
                name: 'Treatment',
                data: minimalStandardData,
              },
            ],
          ]),
        },
        metadata: {
          startDate: new Date(),
          hypothesis: 'Test',
        },
      };

      // DataValidator should pass - it only checks structure, not statistical validity
      expect(() => DataValidator.validateExperiment(experiment)).not.toThrow();
    });

    test('should handle variants with metadata', () => {
      const experiment = createValidExperiment();
      experiment.variants.control.metadata = {
        description: 'This is the control group',
      };

      experiment.variants.treatments.get('treatment-a')!.metadata = {
        description: 'This is treatment A',
      };

      expect(() => DataValidator.validateExperiment(experiment)).not.toThrow();
    });

    test('should handle experiments with MPE', () => {
      const experiment = createValidExperiment();
      experiment.metadata.minimumPracticalEffect = {
        conversion: 0.05,
        revenue: 10,
      };

      expect(() => DataValidator.validateExperiment(experiment)).not.toThrow();
    });
  });
});
