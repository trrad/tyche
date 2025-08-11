/**
 * Data Validator
 *
 * Validates experiment data structure and consistency.
 * Focuses on structural integrity, not statistical requirements.
 */

import { ExperimentData } from '../types/experiment';
import { TycheError, ErrorCode } from '../../core/errors';

export class DataValidator {
  /**
   * Validate an experiment's structure and consistency
   */
  static validateExperiment(data: ExperimentData): void {
    // Validate basic structure
    this.validateStructure(data);

    // Validate data consistency across variants
    this.validateConsistency(data);
  }

  /**
   * Validate the experiment has required structure
   */
  private static validateStructure(data: ExperimentData): void {
    // Control must exist
    if (!data.variants.control) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Experiment must have a control variant', {
        experimentId: data.id,
      });
    }

    // At least one treatment must exist
    if (!data.variants.treatments || data.variants.treatments.size === 0) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'Experiment must have at least one treatment variant',
        { experimentId: data.id }
      );
    }

    // Control must have data
    if (!data.variants.control.data) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Control variant must have data', {
        experimentId: data.id,
      });
    }

    // All treatments must have data
    for (const [name, variant] of data.variants.treatments) {
      if (!variant.data) {
        throw new TycheError(ErrorCode.INVALID_DATA, `Treatment variant ${name} must have data`, {
          experimentId: data.id,
          variant: name,
        });
      }
    }
  }

  /**
   * Validate data consistency across variants
   */
  private static validateConsistency(data: ExperimentData): void {
    const controlType = data.variants.control.data.type;

    // All variants must have the same data type
    for (const [name, variant] of data.variants.treatments) {
      if (variant.data.type !== controlType) {
        throw new TycheError(
          ErrorCode.DATA_MISMATCH,
          `Variant ${name} has different data type than control`,
          {
            experimentId: data.id,
            variant: name,
            variantType: variant.data.type,
            controlType,
          }
        );
      }
    }

    // If using user-level data, validate consistent feature sets
    if (controlType === 'user-level') {
      this.validateUserLevelConsistency(data);
    }
  }

  /**
   * Validate consistency for user-level data
   */
  private static validateUserLevelConsistency(data: ExperimentData): void {
    const controlUsers = data.variants.control.data.userLevel?.users;
    if (!controlUsers || controlUsers.length === 0) {
      return; // No users to validate
    }

    // Check if control has features
    const controlHasFeatures = controlUsers.some((u) => u.features);

    // If control has features, all treatments should too
    if (controlHasFeatures) {
      for (const [name, variant] of data.variants.treatments) {
        const treatmentUsers = variant.data.userLevel?.users;
        if (!treatmentUsers) continue;

        const treatmentHasFeatures = treatmentUsers.some((u) => u.features);
        if (controlHasFeatures !== treatmentHasFeatures) {
          throw new TycheError(
            ErrorCode.DATA_MISMATCH,
            `Feature consistency mismatch between control and ${name}`,
            {
              experimentId: data.id,
              variant: name,
              controlHasFeatures,
              treatmentHasFeatures,
            }
          );
        }
      }
    }
  }
}
