/**
 * Result for multi-variant experiment analysis
 * Based on ImplementationRoadmap.md Phase 2.2
 */

import { AnalysisResult } from './AnalysisResult';
import { ResultMetadata } from './ResultMetadata';
import { VariantResult } from './VariantResult';
import { ComparisonOptions, VariantComparison, ComparisonResult } from './types';
import { ComparisonUtils } from './ComparisonUtils';

/**
 * Result from analyzing an experiment with multiple variants
 * Contains results for control and treatment variants
 */
export class ExperimentResult extends AnalysisResult {
  constructor(
    private variants: Map<string, VariantResult>,
    metadata: ResultMetadata
  ) {
    super(metadata);
  }

  /**
   * Get result for a specific variant
   */
  getVariantResult(name: string): VariantResult | undefined {
    return this.variants.get(name);
  }

  /**
   * Get all variant names
   */
  getVariantNames(): string[] {
    return Array.from(this.variants.keys());
  }

  /**
   * Get all variant results
   */
  getAllVariantResults(): Map<string, VariantResult> {
    return this.variants;
  }

  /**
   * Compare variants with full posterior distributions
   * Returns lift and effect posteriors for all treatments vs baseline
   */
  async compareVariants(options?: ComparisonOptions): Promise<VariantComparison> {
    const baselineName = options?.baseline || 'control';
    const baseline = this.variants.get(baselineName);

    if (!baseline) {
      throw new Error(`Baseline variant '${baselineName}' not found`);
    }

    const comparisons = new Map<string, ComparisonResult>();

    // Compare each variant against the baseline
    for (const [variantName, variant] of this.variants) {
      if (variantName === baselineName) {
        continue; // Skip comparing baseline to itself
      }

      const comparison = await ComparisonUtils.computeComparison(baseline, variant, options);

      // Update metadata with correct variant names
      comparison.metadata.variants.baseline = baselineName;
      comparison.metadata.variants.treatment = variantName;

      comparisons.set(variantName, comparison);
    }

    // Determine winning variant and primary comparison
    const winningVariant = ComparisonUtils.determineWinner(comparisons);
    const primaryComparison = ComparisonUtils.findPrimaryComparison(comparisons);

    return {
      comparisons,
      winningVariant,
      primaryComparison,
    };
  }

  /**
   * Get a summary of the experiment results
   * Useful for Layer 1 API and quick insights
   */
  async getExperimentSummary(options?: ComparisonOptions): Promise<{
    totalVariants: number;
    hasWinner: boolean;
    winnerName: string | null;
    primaryEffect: {
      treatmentName: string;
      baseline: string;
      probabilityPositive: number;
      isCompound: boolean;
    } | null;
    allComparisons: VariantComparison;
  }> {
    const allComparisons = await this.compareVariants(options);

    return {
      totalVariants: this.variants.size,
      hasWinner: allComparisons.winningVariant !== null,
      winnerName: allComparisons.winningVariant,
      primaryEffect: allComparisons.primaryComparison
        ? {
            treatmentName: allComparisons.primaryComparison.treatmentName,
            baseline: options?.baseline || 'control',
            probabilityPositive: allComparisons.primaryComparison.result.probabilityPositive,
            isCompound: allComparisons.primaryComparison.result.decomposition !== undefined,
          }
        : null,
      allComparisons,
    };
  }

  /**
   * Check if any variant in the experiment uses compound models
   */
  hasCompoundModels(): boolean {
    for (const variant of this.variants.values()) {
      if (variant.isCompoundModel()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the baseline variant (defaults to 'control')
   */
  getBaselineVariant(baselineName: string = 'control'): VariantResult | undefined {
    return this.variants.get(baselineName);
  }

  /**
   * Get all treatment variants (excluding baseline)
   */
  getTreatmentVariants(baselineName: string = 'control'): Map<string, VariantResult> {
    const treatments = new Map<string, VariantResult>();
    for (const [name, variant] of this.variants) {
      if (name !== baselineName) {
        treatments.set(name, variant);
      }
    }
    return treatments;
  }

  /**
   * Discover segments using HTE analysis (placeholder for Phase 3)
   */
  async discoverSegments(): Promise<any[]> {
    // TODO: Implement in Phase 3 when we have HTE analysis
    throw new Error('discoverSegments not yet implemented - coming in Phase 3');
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON(): object {
    const variantData: Record<string, any> = {};

    this.variants.forEach((result, name) => {
      variantData[name] = result.toJSON();
    });

    return {
      metadata: this.metadata,
      variants: variantData,
      variantCount: this.variants.size,
    };
  }

  /**
   * Override CSV export for better experiment formatting
   */
  protected async exportCSV(): Promise<Blob> {
    const rows: string[] = [];

    // Header
    rows.push('Variant,HasDecomposition,ComponentCount,Algorithm,Converged,SampleSize');

    // Data rows for each variant
    this.variants.forEach((result, name) => {
      const decomp = result.getDecomposition();
      const components = result.getComponents();
      const meta = result.getMetadata();

      rows.push(
        [
          name,
          decomp ? 'true' : 'false',
          components ? components.length : 0,
          meta.algorithm || '',
          meta.converged !== undefined ? String(meta.converged) : '',
          meta.sampleSize || '',
        ].join(',')
      );
    });

    return new Blob([rows.join('\n')], { type: 'text/csv' });
  }
}
