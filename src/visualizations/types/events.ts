/**
 * Event payload type definitions for D3 visualization components
 *
 * All components emit CustomEvent objects with strongly-typed payloads in event.detail.
 * These interfaces define the complete event contracts for framework integration.
 */

/**
 * Emitted when user hovers over a quantile dot
 * Source: QuantileDots, RidgeDotplot
 */
export interface DotHoverEventDetail {
  value: number; // The quantile value
  x: number; // SVG x-coordinate
  y: number; // SVG y-coordinate
  color: string; // Dot fill color
  ciLower: number; // Current CI lower bound value
  ciUpper: number; // Current CI upper bound value
  ciLevel: number; // Current CI coverage (e.g., 0.8 for 80%)
  variant?: string; // Variant name (added by RidgeDotplot)
}

/**
 * Emitted when user clicks a quantile dot
 * Source: QuantileDots
 */
export interface DotClickEventDetail {
  value: number; // The quantile value
  x: number; // SVG x-coordinate
  y: number; // SVG y-coordinate
}

/**
 * Emitted when user drags CI bounds
 * Source: DraggableCIBounds, RidgeDotplot
 */
export interface CIDragEventDetail {
  lower: number; // Lower percentile (0.0 to 1.0, e.g., 0.05 for 5th percentile)
  upper: number; // Upper percentile (0.0 to 1.0, e.g., 0.95 for 95th percentile)
}

/**
 * Emitted when user drags threshold line
 * Source: ThresholdLine, RidgeDotplot
 */
export interface ThresholdDragEventDetail {
  value: number; // Threshold value in data units
}

/**
 * Emitted when user clicks variant label
 * Source: RidgeDotplot
 */
export interface VariantClickEventDetail {
  name: string; // Variant identifier
  displayName: string; // Human-readable name
  samples: number[]; // Posterior samples
  isBaseline?: boolean; // True if this is the baseline variant
}

/**
 * Type-safe event handler signatures
 */
export type DotHoverHandler = (event: CustomEvent<DotHoverEventDetail>) => void;
export type DotClickHandler = (event: CustomEvent<DotClickEventDetail>) => void;
export type CIDragHandler = (event: CustomEvent<CIDragEventDetail>) => void;
export type ThresholdDragHandler = (event: CustomEvent<ThresholdDragEventDetail>) => void;
export type VariantClickHandler = (event: CustomEvent<VariantClickEventDetail>) => void;
