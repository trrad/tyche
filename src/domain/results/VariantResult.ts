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
    if ('getSeverityComponents' in this.posterior && this.posterior.getSeverityComponents) {
      return (this.posterior as CompoundPosterior).getSeverityComponents();
    }

    // Check if the posterior itself has components (simple mixture)
    if ('getComponents' in this.posterior && typeof this.posterior.getComponents === 'function') {
      return (this.posterior as any).getComponents();
    }

    return null;
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
