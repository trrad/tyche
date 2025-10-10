/**
 * RevenueAnalyzer - Analyzer for revenue experiments
 *
 * Handles experiments with revenue metrics that may have zero-inflated structure.
 * Routes to compound models (Beta × LogNormal) when zeros are present.
 * Based on reference implementation in TechnicalArchitecture.md
 */

import { ExperimentAnalyzer, AnalyzerOptions } from './interfaces';
import { ExperimentData, VariantData } from '../types/experiment';
import { ExperimentResult } from '../results/ExperimentResult';
import { VariantResult } from '../results/VariantResult';
import { ResultMetadata } from '../results/ResultMetadata';
import { ModelRouter } from '../../inference/ModelRouter';
import { StandardData, StandardDataFactory, UserLevelData } from '../../core/data/StandardData';
import { FitOptions } from '../../inference/base/types';
import { TycheError, ErrorCode } from '../../core/errors';

/**
 * Analyzer for revenue experiments
 *
 * This analyzer is designed for experiments where the primary metric
 * is revenue or other continuous value that may have zeros.
 *
 * Business logic:
 * - Expects user-level data with revenue values
 * - Routes to compound models when zeros present (conversion × value)
 * - Provides revenue decomposition analysis when applicable
 * - Follows reference implementation pattern from TechnicalArchitecture.md
 */
export class RevenueAnalyzer implements ExperimentAnalyzer {
  private fitOptions?: FitOptions;

  /**
   * Configure the analyzer with priors and options
   * Following reference implementation in InterfaceStandards.md
   */
  configure(options: AnalyzerOptions): void {
    if (options.priors?.has('revenue')) {
      this.fitOptions = {
        prior: options.priors.get('revenue')!,
      };
    }

    // Store progress callback
    if (options.progressCallback) {
      this.fitOptions = this.fitOptions || {};
      this.fitOptions.onProgress = (progress) => {
        options.progressCallback!(progress.progress);
      };
    }
  }

  /**
   * Analyze a revenue experiment
   * Implementation follows TechnicalArchitecture.md pattern exactly
   */
  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    const start = performance.now();

    try {
      // 1. Validate experiment data
      this.validateExperimentData(data);

      // 2. Combine all variant data for routing (following reference implementation)
      const allUsers: UserLevelData[] = [];

      // Extract users from all variants - adapted for current ExperimentData structure
      const allVariants = this.getAllVariants(data);
      for (const variant of allVariants) {
        if (variant.data.type === 'user-level' && variant.data.userLevel) {
          allUsers.push(...variant.data.userLevel.users);
        }
      }

      if (allUsers.length === 0) {
        throw new TycheError(ErrorCode.INVALID_DATA, 'No user-level data found in experiment');
      }

      // 3. Route once on combined data (exactly as in reference)
      const combinedData = this.toStandardData({
        n: allUsers.length,
        users: allUsers,
      });
      const { config, engine } = await ModelRouter.route(combinedData, this.fitOptions);

      // 4. Fit each variant and create VariantResults (following reference pattern)
      const variantResults = new Map<string, VariantResult>();

      for (const variant of allVariants) {
        const variantData = this.toStandardData(variant);
        const result = await engine.fit(variantData, config, this.fitOptions);

        // Create VariantResult for each variant (exactly as in reference)
        const variantResult = new VariantResult(result.posterior, {
          timestamp: new Date(),
          algorithm: result.diagnostics.modelType || engine.algorithm,
          computeTime: result.diagnostics.runtime,
          converged: result.diagnostics.converged,
          sampleSize: variant.data.n,
          // Add experiment info
          experimentId: data.id,
          experimentName: data.name,
          variantName: variant.name,
        });
        variantResults.set(variant.name, variantResult);
      }

      // 5. Compose into ExperimentResult (following reference implementation)
      const runtime = performance.now() - start;

      const experimentMetadata: ResultMetadata = {
        timestamp: new Date(),
        algorithm: engine.algorithm,
        computeTime: runtime,
        sampleSize: this.calculateTotalSamples(data),
        // Following reference metadata pattern
        experimentId: data.id,
        analyzerType: 'RevenueAnalyzer',
        variantCount: variantResults.size,
      };

      return new ExperimentResult(variantResults, experimentMetadata);
    } catch (error) {
      throw new TycheError(
        ErrorCode.INTERNAL_ERROR,
        `RevenueAnalyzer failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          experimentId: data.id,
          analyzer: 'RevenueAnalyzer',
          originalError: error,
        }
      );
    }
  }

  /**
   * Validate experiment data for revenue analysis
   */
  private validateExperimentData(data: ExperimentData): void {
    if (!data.variants.control) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Experiment must have a control variant');
    }

    if (data.variants.treatments.size === 0) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'Experiment must have at least one treatment variant'
      );
    }

    // Check that all variants have user-level data (revenue requires individual user values)
    const allVariants = this.getAllVariants(data);
    for (const variant of allVariants) {
      if (variant.data.type !== 'user-level') {
        throw new TycheError(
          ErrorCode.INVALID_DATA,
          `Revenue analysis requires user-level data, but variant '${variant.name}' has ${variant.data.type} data`
        );
      }

      if (!variant.data.userLevel || variant.data.userLevel.users.length === 0) {
        throw new TycheError(ErrorCode.INVALID_DATA, `Variant '${variant.name}' has no user data`);
      }
    }
  }

  /**
   * Get all variants in a uniform format
   * Adapts current ExperimentData structure to reference implementation pattern
   */
  private getAllVariants(data: ExperimentData): VariantData[] {
    const variants: VariantData[] = [data.variants.control];
    variants.push(...Array.from(data.variants.treatments.values()));
    return variants;
  }

  /**
   * Convert to StandardData format
   * Following reference implementation in InterfaceStandards.md
   */
  private toStandardData(input: VariantData | { n: number; users: UserLevelData[] }): StandardData {
    if ('data' in input) {
      // It's a VariantData, return the StandardData inside
      return input.data;
    } else {
      // It's user data that needs to be converted to StandardData
      return StandardDataFactory.fromUserLevel(input.users);
    }
  }

  /**
   * Calculate total samples across all variants
   * Following reference implementation pattern
   */
  private calculateTotalSamples(data: ExperimentData): number {
    return (
      data.variants.control.data.n +
      Array.from(data.variants.treatments.values()).reduce((sum, t) => sum + t.data.n, 0)
    );
  }
}
