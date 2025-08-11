/**
 * Metadata structure for all analysis results
 * Based on InterfaceStandards.md specification
 */

/**
 * Metadata that accompanies all analysis results
 * Extensible to support additional fields as needed
 */
export interface ResultMetadata {
  /** When the analysis was performed */
  timestamp: Date;

  /** Algorithm used for inference (e.g., 'conjugate', 'em', 'vi', 'mcmc') */
  algorithm?: string;

  /** Time taken to compute results in milliseconds */
  computeTime?: number;

  /** Whether the algorithm converged successfully */
  converged?: boolean;

  /** Total sample size used in analysis */
  sampleSize?: number;

  /** Any warnings generated during analysis */
  warnings?: string[];

  /** Allow additional fields for specific result types */
  [key: string]: any;
}
