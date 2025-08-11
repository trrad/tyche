/**
 * Result for multi-variant experiment analysis
 * Based on ImplementationRoadmap.md Phase 2.2
 */

import { AnalysisResult } from './AnalysisResult';
import { ResultMetadata } from './ResultMetadata';
import { VariantResult } from './VariantResult';

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
   * Compare variants (placeholder for Phase 2 implementation)
   * Will compute lift, effect sizes, credible intervals, etc.
   */
  async compareVariants(): Promise<any> {
    // TODO: Implement in Phase 2 when we have comparison logic
    throw new Error('compareVariants not yet implemented - coming in Phase 2');
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
