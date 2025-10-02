/**
 * Result for a single variant or dataset analysis
 * Based on ImplementationRoadmap.md Phase 2.2
 */

import { AnalysisResult } from './AnalysisResult';
import { ResultMetadata } from './ResultMetadata';
import { Posterior, CompoundPosterior } from '../../inference/base/types';

/**
 * Component information for mixture models
 * Represents value distribution components, NOT user segments
 */
export interface ComponentInfo {
  weight: number;
  mean: number;
  variance: number;
}

/**
 * Result from analyzing a single variant or dataset
 * Provides runtime capability detection based on posterior type
 */
export class VariantResult extends AnalysisResult {
  constructor(
    private posterior: Posterior,
    metadata: ResultMetadata
  ) {
    super(metadata);
  }

  /**
   * Get the posterior distribution
   */
  getPosterior(): Posterior {
    return this.posterior;
  }

  /**
   * Get decomposition for compound models
   * Returns the frequency and severity posteriors directly
   * Returns null for simple models
   */
  getDecomposition(): { frequency: Posterior; severity: Posterior } | null {
    // Runtime type checking - only compound posteriors have decomposition
    if ('getDecomposition' in this.posterior) {
      return (this.posterior as CompoundPosterior).getDecomposition();
    }
    return null;
  }

  /**
   * Get mixture components for value distributions
   * Works for both simple mixtures and compound model severity components
   * NOT user segments - those come from HTE analysis
   */
  getComponents(): ComponentInfo[] | null {
    // Check if it's a compound posterior with severity components
    if ('getSeverityComponents' in this.posterior) {
      const compoundPosterior = this.posterior as CompoundPosterior;
      if (compoundPosterior.getSeverityComponents) {
        return compoundPosterior.getSeverityComponents();
      }
    }

    // Check if the posterior itself has components (simple mixture)
    if ('getComponents' in this.posterior && typeof this.posterior.getComponents === 'function') {
      return (this.posterior as any).getComponents();
    }

    return null;
  }

  /**
   * Get posterior samples - helper method for comparisons
   * @param n Number of samples to generate (default: 10000)
   * @returns Array of posterior samples
   */
  getPosteriorSamples(n: number = 10000): number[] {
    return this.posterior.sample(n);
  }

  /**
   * Check if this variant uses a compound model
   * @returns true if compound (has decomposition), false otherwise
   */
  isCompoundModel(): boolean {
    return this.getDecomposition() !== null;
  }

  /**
   * Get basic summary statistics from the posterior
   * Uses cached samples for efficiency
   */
  getSummaryStats(nSamples: number = 10000): {
    mean: number;
    variance: number;
    credibleInterval: [number, number];
  } {
    // Use analytical methods if available for better performance
    if (this.posterior.mean && this.posterior.variance && this.posterior.credibleInterval) {
      return {
        mean: this.posterior.mean()[0],
        variance: this.posterior.variance()[0],
        credibleInterval: this.posterior.credibleInterval(0.8)[0],
      };
    }

    // Fall back to sample-based calculation
    const samples = this.getPosteriorSamples(nSamples);
    const sorted = [...samples].sort((a, b) => a - b);

    const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
    const variance =
      samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (samples.length - 1);

    const lowerIndex = Math.floor(0.1 * sorted.length);
    const upperIndex = Math.floor(0.9 * sorted.length);
    const credibleInterval: [number, number] = [sorted[lowerIndex], sorted[upperIndex]];

    return { mean, variance, credibleInterval };
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON(): object {
    const result: any = {
      metadata: this.metadata,
    };

    // Add decomposition info if available
    const decomposition = this.getDecomposition();
    if (decomposition) {
      result.hasDecomposition = true;
    }

    // Add components if available
    const components = this.getComponents();
    if (components) {
      result.components = components;
    }

    return result;
  }
}
