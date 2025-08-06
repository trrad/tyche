/**
 * Standard Data Model for Tyche
 *
 * Implements the unified data interface with just two types: 'binomial' | 'user-level'
 * Quality indicators are computed once and used for routing decisions throughout the pipeline.
 *
 * Key insight: "Continuous" data is just user-level where everyone converted.
 */

export type DataType = 'binomial' | 'user-level';

/**
 * Quality indicators computed once and used for routing decisions
 */
export interface DataQuality {
  /** Key for compound model selection - presence of zeros suggests compound models */
  hasZeros: boolean;

  /** Determines distribution family - negative values affect model choice */
  hasNegatives: boolean;

  /** Suggests mixture models - outliers indicate multiple populations */
  hasOutliers: boolean;

  /** Count of null/undefined values */
  missingData: number;
}

/**
 * Individual user record with conversion and value data
 */
export interface UserLevelData {
  userId: string;
  converted: boolean;
  value: number; // 0 if not converted

  // For future segmentation and HTE analysis
  features?: FeatureSet;
  timestamp?: Date;
}

/**
 * User features for segmentation and heterogeneous treatment effects
 */
export interface FeatureSet {
  // Standard features
  device?: 'mobile' | 'desktop' | 'tablet';
  browser?: string;
  dayOfWeek?: string;
  hour?: number;

  // Custom features - extensible
  [key: string]: any;
}

/**
 * Pre-computed empirical statistics for efficiency
 */
export interface EmpiricalStats {
  mean: number;
  variance: number;
  min: number;
  max: number;
  q25: number;
  q50: number;
  q75: number;
  skewness?: number;
  kurtosis?: number;
}

/**
 * The unified data interface - only two types throughout the system
 */
export interface StandardData {
  type: DataType;
  n: number; // Always required - total sample size

  // Binomial: Just 2 numbers (aggregate data)
  binomial?: {
    successes: number;
    trials: number;
  };

  // User-level: Everything else (individual records)
  userLevel?: {
    users: UserLevelData[];
    empiricalStats?: EmpiricalStats; // Pre-computed for efficiency
  };

  // Quality indicators for routing - computed once, used everywhere
  quality: DataQuality;
}

/**
 * Quality indicator computation utilities
 */
export class DataQualityAnalyzer {
  /**
   * Compute quality indicators for user-level data
   */
  static analyzeUserLevel(users: UserLevelData[]): DataQuality {
    const values = users.map((u) => u.value);

    return {
      hasZeros: values.some((v) => v === 0),
      hasNegatives: values.some((v) => v < 0),
      hasOutliers: this.detectOutliers(values),
      missingData: users.filter((u) => u.value === null || u.value === undefined).length,
    };
  }

  /**
   * Compute quality indicators for binomial data
   */
  static analyzeBinomial(successes: number, trials: number): DataQuality {
    return {
      hasZeros: false, // Binomial data doesn't have individual zeros
      hasNegatives: false, // Counts are always non-negative
      hasOutliers: false, // No outliers in aggregate binomial data
      missingData: 0, // No missing data concept for aggregate
    };
  }

  /**
   * Detect outliers using IQR method
   */
  private static detectOutliers(values: number[]): boolean {
    if (values.length < 4) return false; // Need at least 4 points for IQR

    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return values.some((v) => v < lowerBound || v > upperBound);
  }

  /**
   * Compute empirical statistics for user-level data
   */
  static computeEmpiricalStats(values: number[]): EmpiricalStats {
    if (values.length === 0) {
      throw new Error('Cannot compute statistics for empty array');
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;

    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);

    // Use proper quantile calculation
    const getQuantile = (q: number) => {
      const index = (n - 1) * q;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index % 1;

      if (upper >= n) return sorted[n - 1];
      return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    return {
      mean,
      variance,
      min: sorted[0],
      max: sorted[n - 1],
      q25: getQuantile(0.25),
      q50: getQuantile(0.5),
      q75: getQuantile(0.75),
    };
  }
}

/**
 * Type guards for runtime type checking
 */
export function isBinomialData(
  data: StandardData
): data is StandardData & { binomial: NonNullable<StandardData['binomial']> } {
  return data.type === 'binomial' && data.binomial !== undefined;
}

export function isUserLevelData(
  data: StandardData
): data is StandardData & { userLevel: NonNullable<StandardData['userLevel']> } {
  return data.type === 'user-level' && data.userLevel !== undefined;
}

/**
 * Factory functions for creating StandardData
 */
export class StandardDataFactory {
  /**
   * Create StandardData from binomial summary
   */
  static fromBinomial(successes: number, trials: number): StandardData {
    return {
      type: 'binomial',
      n: trials,
      binomial: { successes, trials },
      quality: DataQualityAnalyzer.analyzeBinomial(successes, trials),
    };
  }

  /**
   * Create StandardData from user-level records
   */
  static fromUserLevel(users: UserLevelData[], precomputeStats: boolean = true): StandardData {
    const quality = DataQualityAnalyzer.analyzeUserLevel(users);
    const values = users.map((u) => u.value);

    return {
      type: 'user-level',
      n: users.length,
      userLevel: {
        users,
        empiricalStats: precomputeStats
          ? DataQualityAnalyzer.computeEmpiricalStats(values)
          : undefined,
      },
      quality,
    };
  }

  /**
   * Create StandardData from continuous values (everyone converted)
   * This is the key insight: continuous data is just user-level where everyone converted
   */
  static fromContinuous(values: number[], userIdPrefix: string = 'user'): StandardData {
    const users: UserLevelData[] = values.map((value, index) => ({
      userId: `${userIdPrefix}_${index}`,
      converted: true,
      value,
    }));

    return this.fromUserLevel(users);
  }
}
