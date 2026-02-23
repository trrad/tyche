/**
 * Data interface type definitions for D3 visualization components
 */

/**
 * Data interface for QuantileDots component
 */
export interface QuantileDotsData {
  samples: number[]; // Raw posterior samples (typically 10k samples)
  threshold?: number; // Optional threshold for coloring dots above/below
  effectSamples?: number[]; // Optional $ effect samples (for integrated $ + % tooltips)
  thresholdEffect?: number; // Pre-calculated $ value at threshold (shared across variants)
}

/**
 * Sorted sample pair for efficient % ↔ $ conversions
 */
export interface SortedSamplePair {
  pct: number; // Percentage lift value
  effect: number; // Dollar effect value
}

/**
 * Variant data for RidgeDotplot component
 */
export interface VariantData {
  name: string; // Variant identifier (e.g., "variant_a")
  displayName: string; // Human-readable name (e.g., "Variant A")
  samples: number[]; // Raw posterior samples (% lift, unsorted from Tyche)
  isBaseline?: boolean; // True if this is the baseline variant

  // Optional: For integrated lift view showing both $ and % metrics
  effectMedian?: number; // Median of absolute effect ($ lift)
  liftMedian?: number; // Median of relative effect (% lift)
  effectSamples?: number[]; // Full effect samples array ($ lift, unsorted from Tyche)
  controlSamples?: number[]; // Control baseline RPU samples (for $ ↔ % conversion)

  // Optional: Sample size information for context
  userCount?: number; // Total number of users in this variant
  converterCount?: number; // Number of users who converted

  // DEPRECATED: Will be removed - use controlSamples for conversions instead
  // Optional: Pre-computed sorted pairs for efficient conversions
  // Computed once at data ingestion to avoid re-sorting on every render
  _sortedPairs?: SortedSamplePair[]; // Sorted by pct (% lift) ascending
}

/**
 * Data interface for RidgeDotplot component
 */
export interface RidgeDotplotData {
  variants: VariantData[]; // Array of variants to display
  threshold?: number; // Optional business threshold for coloring
}

/**
 * Data interface for DraggableCIBounds component
 */
export interface CIBoundsData {
  samples: number[]; // Samples for computing percentile positions
  lowerPercentile: number; // Lower percentile (0.0-1.0, e.g., 0.1 for 10th)
  upperPercentile: number; // Upper percentile (0.0-1.0, e.g., 0.9 for 90th)
  yPositions: number[]; // Y-coordinates for each variant ridge
}

/**
 * Data interface for ThresholdLine component
 */
export interface ThresholdLineData {
  value: number; // Current threshold value
  yRange: [number, number]; // [min, max] y-coordinates for line
}

/**
 * KDE computation result
 */
export interface KDEPoint {
  value: number; // X-axis value
  density: number; // Estimated probability density
}
