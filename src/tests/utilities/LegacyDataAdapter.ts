/**
 * Legacy Data Adapter
 * Transforms old test data formats to StandardData for migrated engines
 * This allows us to run existing tests without major rewrites
 */

import { StandardData, DataQuality } from '../../core/data/StandardData';
import { ModelConfig } from '../../inference/base/types';
import { TycheError, ErrorCode } from '../../core/errors';

/**
 * Old data formats used in tests
 */
interface LegacyDataInput {
  data: number[] | BinomialData | SummaryStats | UserData[];
  config?: {
    numComponents?: number;
    [key: string]: any;
  };
}

interface BinomialData {
  successes: number;
  trials: number;
}

interface SummaryStats {
  n: number;
  mean?: number;
  variance?: number;
  sum?: number;
  sumSquares?: number;
}

interface UserData {
  converted: boolean;
  value: number;
}

/**
 * Adapter to transform legacy data formats to StandardData
 */
export class LegacyDataAdapter {
  /**
   * Transform legacy data input to StandardData
   */
  static toStandardData(legacyData: LegacyDataInput | any): StandardData {
    // Handle direct array input (common in tests)
    if (Array.isArray(legacyData)) {
      return this.arrayToStandardData(legacyData);
    }

    // Handle legacy data input object
    if (legacyData.data !== undefined) {
      const data = legacyData.data;

      // Binomial data
      if (this.isBinomialData(data)) {
        return this.binomialToStandardData(data);
      }

      // User data array
      if (Array.isArray(data) && data.length > 0 && this.isUserData(data[0])) {
        return this.userDataToStandardData(data as UserData[]);
      }

      // Number array
      if (Array.isArray(data)) {
        return this.arrayToStandardData(data);
      }

      // Summary stats
      if (this.isSummaryStats(data)) {
        throw new TycheError(
          ErrorCode.NOT_IMPLEMENTED,
          'Summary statistics conversion not yet implemented'
        );
      }
    }

    // Handle binomial data passed directly
    if (this.isBinomialData(legacyData)) {
      return this.binomialToStandardData(legacyData);
    }

    throw new TycheError(ErrorCode.INVALID_DATA, 'Unknown legacy data format', {
      data: legacyData,
    });
  }

  /**
   * Extract model config from legacy data
   */
  static extractModelConfig(legacyData: LegacyDataInput | any, modelType?: string): ModelConfig {
    const config = legacyData.config || {};

    // Auto-detect model type based on data
    if (!modelType) {
      if (this.isBinomialData(legacyData.data || legacyData)) {
        modelType = 'beta-binomial';
      } else if (Array.isArray(legacyData.data || legacyData)) {
        const values = legacyData.data || legacyData;
        const allPositive = values.every((v: any) => (typeof v === 'number' ? v > 0 : v.value > 0));
        modelType = allPositive ? 'lognormal' : 'normal';
      }
    }

    // Map old model types to new structure
    const modelConfig: ModelConfig = {
      structure: 'simple',
      components: config.numComponents || 1,
    };

    // Set type based on model
    if (modelType === 'beta-binomial') {
      modelConfig.type = 'beta';
    } else if (modelType === 'lognormal' || modelType === 'lognormal-mixture') {
      modelConfig.type = 'lognormal';
    } else if (modelType === 'normal' || modelType === 'normal-mixture') {
      modelConfig.type = 'normal';
    }

    return modelConfig;
  }

  /**
   * Convert array data to StandardData
   */
  private static arrayToStandardData(data: number[]): StandardData {
    // Check if it's binary data (all 0s and 1s)
    const isBinary = data.every((x) => x === 0 || x === 1);

    if (isBinary) {
      // Convert to binomial
      const successes = data.filter((x) => x === 1).length;
      const trials = data.length;

      return {
        type: 'binomial',
        n: trials,
        binomial: { successes, trials },
        quality: this.computeQuality(data),
      };
    } else {
      // Convert to user-level data
      return {
        type: 'user-level',
        n: data.length,
        userLevel: {
          users: data.map((value) => ({ value, converted: true })),
          empiricalStats: {
            mean: data.reduce((a, b) => a + b, 0) / data.length,
            variance: this.computeVariance(data),
          },
        },
        quality: this.computeQuality(data),
      };
    }
  }

  /**
   * Convert binomial data to StandardData
   */
  private static binomialToStandardData(data: BinomialData): StandardData {
    return {
      type: 'binomial',
      n: data.trials,
      binomial: {
        successes: data.successes,
        trials: data.trials,
      },
      quality: {
        hasZeros: data.successes === 0,
        hasNegatives: false,
        hasOutliers: false,
        missingData: 0,
      },
    };
  }

  /**
   * Convert user data array to StandardData
   */
  private static userDataToStandardData(data: UserData[]): StandardData {
    const values = data.map((u) => u.value);

    return {
      type: 'user-level',
      n: data.length,
      userLevel: {
        users: data,
        empiricalStats: {
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          variance: this.computeVariance(values),
        },
      },
      quality: this.computeQuality(values),
    };
  }

  /**
   * Compute data quality indicators
   */
  private static computeQuality(data: number[]): DataQuality {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = Math.sqrt(this.computeVariance(data));

    return {
      hasZeros: data.some((x) => x === 0),
      hasNegatives: data.some((x) => x < 0),
      hasOutliers: data.some((x) => Math.abs(x - mean) > 3 * std),
      missingData: 0,
    };
  }

  /**
   * Compute variance
   */
  private static computeVariance(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
  }

  /**
   * Type guards
   */
  private static isBinomialData(data: any): data is BinomialData {
    return data && typeof data === 'object' && 'successes' in data && 'trials' in data;
  }

  private static isUserData(data: any): data is UserData {
    return data && typeof data === 'object' && 'converted' in data && 'value' in data;
  }

  private static isSummaryStats(data: any): data is SummaryStats {
    return (
      data &&
      typeof data === 'object' &&
      'n' in data &&
      !('successes' in data) &&
      !('converted' in data)
    );
  }
}

/**
 * Helper function to wrap legacy engine calls
 */
export async function runLegacyTest(
  engine: any,
  legacyData: any,
  modelType?: string,
  options?: any
) {
  const standardData = LegacyDataAdapter.toStandardData(legacyData);
  const modelConfig = LegacyDataAdapter.extractModelConfig(legacyData, modelType);

  return engine.fit(standardData, modelConfig, options);
}
