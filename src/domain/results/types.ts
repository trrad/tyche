/**
 * Types for enhanced result comparison functionality
 * Implements the full posterior comparison specification from Issue #108
 * Based on API-layers.md and InterfaceStandards.md
 */

/**
 * Options for configuring variant comparisons
 */
export interface ComparisonOptions {
  /** Baseline variant name (defaults to 'control') */
  baseline?: string;
  /** Number of posterior samples to use for comparison (defaults to 10000) */
  nSamples?: number;
  /** Minimum practical effect threshold for meaningful comparison (defaults to 0.05 = 5%) */
  meaningfulThreshold?: number;
}

/**
 * Result of comparing two variants with full posterior distributions
 * All statistical measures are based on posterior samples, not point estimates
 */
export interface ComparisonResult {
  /** Full posterior samples of relative effect (lift) */
  liftSamples: number[];

  /** Full posterior samples of absolute effect (difference) */
  effectSamples: number[];

  /** Probability that treatment > baseline (P(lift > 0)) */
  probabilityPositive: number;

  /** Probability that effect is meaningful (P(lift > threshold)) */
  probabilityMeaningful: number;

  /** Business decomposition with uncertainty (from issue #82) */
  decomposition?: EffectDecomposition;

  /** Metadata about the comparison */
  metadata: ComparisonMetadata;
}

/**
 * Effect decomposition for compound models
 * Each contribution comes with full uncertainty quantification
 */
export interface EffectDecomposition {
  /** Combined effect breakdown */
  combined: {
    /** Posterior samples of frequency contribution (as proportion) */
    frequencyContribution: number[];
    /** Posterior samples of value contribution (as proportion) */
    valueContribution: number[];
  };

  /** Component effects with uncertainty */
  components: {
    /** Frequency effect posterior samples (absolute) */
    frequencyEffect: number[];
    /** Value effect posterior samples (absolute) */
    valueEffect: number[];
  };
}

/**
 * Metadata about a comparison operation
 */
export interface ComparisonMetadata {
  /** Names of the compared variants */
  variants: {
    baseline: string;
    treatment: string;
  };

  /** Sample sizes used in comparison */
  sampleSizes: {
    baseline: number;
    treatment: number;
    posteriorSamples: number;
  };

  /** Configuration used for comparison */
  options: ComparisonOptions;

  /** Whether decomposition was computed */
  hasDecomposition: boolean;

  /** Timestamp of comparison */
  timestamp: Date;
}

/**
 * Summary of multiple variant comparisons
 * Returned by ExperimentResult.compareVariants()
 */
export interface VariantComparison {
  /** Map of variant name to comparison result vs baseline */
  comparisons: Map<string, ComparisonResult>;

  /** Name of winning variant (highest probability of positive effect) */
  winningVariant: string | null;

  /** Primary comparison for summary purposes */
  primaryComparison: {
    treatmentName: string;
    result: ComparisonResult;
  } | null;
}
