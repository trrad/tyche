/**
 * Quantile computation utilities for visualization components
 *
 * These functions compute quantiles from posterior samples using the same
 * approach as Tyche's core library for consistency.
 */

import * as d3 from 'd3';

/**
 * Compute evenly-spaced quantiles from samples
 *
 * Uses Tyche-consistent approach: quantiles at bin centers
 * For numQuantiles=20: returns quantiles at 2.5%, 7.5%, ..., 97.5%
 *
 * @param samples - Raw posterior samples
 * @param numQuantiles - Number of quantiles to compute (default: 20)
 * @returns Array of quantile values
 *
 * @example
 * ```ts
 * const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 * const quantiles = computeQuantiles(samples, 4);
 * // Returns approximately [2.5, 4.5, 6.5, 8.5] (12.5%, 37.5%, 62.5%, 87.5% quantiles)
 * ```
 */
export function computeQuantiles(samples: number[], numQuantiles = 20): number[] {
  if (!samples || samples.length === 0) {
    throw new Error('computeQuantiles: samples array cannot be empty');
  }

  if (numQuantiles < 2) {
    throw new Error(`computeQuantiles: numQuantiles must be >= 2, got ${numQuantiles}`);
  }

  // Sort samples once
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  // Generate evenly-spaced quantile values at bin centers
  return Array.from({ length: numQuantiles }, (_, i) => {
    const p = (i + 0.5) / numQuantiles;
    const index = Math.floor(n * p);
    return sorted[Math.min(index, n - 1)]; // Clamp to array bounds
  });
}

/**
 * Get credible interval bounds from sorted samples
 *
 * This is optimized for interactive updates - pre-sort samples once,
 * then CI bound lookups are instant via index access.
 *
 * @param sorted - Pre-sorted samples (ascending order)
 * @param lowerP - Lower percentile (0.0-1.0, e.g., 0.1 for 10th percentile)
 * @param upperP - Upper percentile (0.0-1.0, e.g., 0.9 for 90th percentile)
 * @returns Object with lower and upper bound values
 *
 * @example
 * ```ts
 * const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
 * const sorted = [...samples].sort((a, b) => a - b);
 * const bounds = getCIBounds(sorted, 0.1, 0.9);
 * // Returns { lower: 1, upper: 9 } (approximately)
 * ```
 */
export function getCIBounds(
  sorted: number[],
  lowerP: number,
  upperP: number
): { lower: number; upper: number } {
  if (lowerP < 0 || lowerP > 1) {
    throw new Error(`getCIBounds: lowerP must be between 0 and 1, got ${lowerP}`);
  }
  if (upperP < 0 || upperP > 1) {
    throw new Error(`getCIBounds: upperP must be between 0 and 1, got ${upperP}`);
  }
  if (lowerP >= upperP) {
    throw new Error(`getCIBounds: lowerP (${lowerP}) must be < upperP (${upperP})`);
  }

  const n = sorted.length;
  const lowerIndex = Math.floor(n * lowerP);
  const upperIndex = Math.floor(n * upperP);

  return {
    lower: sorted[Math.min(lowerIndex, n - 1)],
    upper: sorted[Math.min(upperIndex, n - 1)],
  };
}

/**
 * Sort samples and cache for performance
 *
 * Helper to create sorted copy with validation
 *
 * @param samples - Raw samples to sort
 * @returns Sorted copy of samples (ascending order)
 */
export function sortSamples(samples: number[]): number[] {
  if (!samples || samples.length === 0) {
    throw new Error('sortSamples: samples array cannot be empty');
  }

  // Filter out non-finite values (NaN, Infinity)
  const validSamples = samples.filter((x) => Number.isFinite(x));

  if (validSamples.length === 0) {
    throw new Error('sortSamples: no valid (finite) samples found');
  }

  if (validSamples.length < samples.length) {
    console.warn(
      `sortSamples: filtered out ${samples.length - validSamples.length} non-finite values`
    );
  }

  return [...validSamples].sort((a, b) => a - b);
}

/**
 * Get percentile value from sorted samples
 *
 * @param sorted - Pre-sorted samples
 * @param percentile - Percentile to retrieve (0.0-1.0)
 * @returns Value at the specified percentile
 */
export function getPercentile(sorted: number[], percentile: number): number {
  if (percentile < 0 || percentile > 1) {
    throw new Error(`getPercentile: percentile must be between 0 and 1, got ${percentile}`);
  }

  const n = sorted.length;
  const index = Math.floor(n * percentile);
  return sorted[Math.min(index, n - 1)];
}

/**
 * Create sorted sample pairs for efficient % ↔ $ conversions
 *
 * Sorts samples by percentage lift, maintaining pairing with dollar effects.
 * This should be computed ONCE at data ingestion and cached in VariantData._sortedPairs
 *
 * @param samples - Array of % lift samples (unsorted from Tyche)
 * @param effectSamples - Array of $ effect samples (unsorted from Tyche, parallel to samples)
 * @returns Sorted pairs array, or null if no effectSamples
 *
 * @example
 * ```ts
 * const sortedPairs = getSortedPairs(liftSamples, dollarSamples);
 * // Cache in variant data to avoid re-sorting:
 * variantData._sortedPairs = sortedPairs;
 * ```
 */
export function getSortedPairs(
  samples: number[],
  effectSamples?: number[]
): Array<{ pct: number; effect: number }> | null {
  if (!effectSamples || effectSamples.length === 0) {
    return null;
  }

  if (samples.length !== effectSamples.length) {
    console.warn('getSortedPairs: samples and effectSamples have different lengths');
    return null;
  }

  // Create pairs maintaining critical pairing: samples[i] ↔ effectSamples[i]
  const pairs = samples.map((pct, i) => ({
    pct,
    effect: effectSamples[i],
  }));

  // Sort by percentage lift (ascending)
  pairs.sort((a, b) => a.pct - b.pct);

  return pairs;
}

/**
 * Convert a percentage lift threshold to dollar effect amount
 *
 * Uses the mean (expected value) of control baseline to convert: dollar = percent × E[control_rpu]
 * This is consistent with displaying expected values in labels.
 *
 * @param percentThreshold - Threshold as decimal (e.g., 0.10 for 10%)
 * @param controlSamples - Control baseline revenue per user samples
 * @returns Dollar effect value at the threshold
 *
 * @example
 * ```ts
 * const dollar = convertPercentToEffect(0.10, controlRpuSamples);
 * // If mean control RPU is $12, returns $1.20
 * ```
 */
export function convertPercentToEffect(
  percentThreshold: number,
  controlSamples?: number[] | null
): number {
  if (!controlSamples || controlSamples.length === 0) {
    return 0;
  }

  // Use mean (expected value) to be consistent with expected value labels
  // E[lift%] × E[control RPU] ≈ E[effect $]
  const meanControl = d3.mean(controlSamples) || 0;

  return percentThreshold * meanControl;
}

/**
 * Convert a dollar effect threshold to percentage lift amount
 *
 * Uses the mean (expected value) of control baseline to convert: percent = dollar / E[control_rpu]
 * This is the INVERSE of convertPercentToEffect.
 *
 * @param effectThreshold - Dollar effect threshold (e.g., 1.50 for $1.50)
 * @param controlSamples - Control baseline revenue per user samples
 * @returns Percentage lift value at the threshold
 *
 * @example
 * ```ts
 * const percent = convertEffectToPercent(1.50, controlRpuSamples);
 * // If mean control RPU is $12, returns 0.125 (12.5%)
 * ```
 */
export function convertEffectToPercent(
  effectThreshold: number,
  controlSamples?: number[] | null
): number {
  if (!controlSamples || controlSamples.length === 0) {
    return 0;
  }

  // Use mean (expected value) to be consistent with convertPercentToEffect
  const meanControl = d3.mean(controlSamples) || 0;

  if (meanControl === 0) {
    return 0;
  }

  return effectThreshold / meanControl;
}
