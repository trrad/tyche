/**
 * ConversionAnalyzer - Analyzer for binary conversion experiments
 *
 * Handles experiments with binary outcomes (converted/not converted).
 * Routes to beta-binomial models and provides conversion-specific interpretation.
 */

import { ExperimentAnalyzer, AnalyzerOptions } from './interfaces';
import { ExperimentData } from '../types/experiment';
import { ExperimentResult } from '../results/ExperimentResult';
import { VariantResult } from '../results/VariantResult';
import { ResultMetadata } from '../results/ResultMetadata';
import { ModelRouter } from '../../inference/ModelRouter';
import { StandardData, StandardDataFactory } from '../../core/data/StandardData';
import { FitOptions, PriorSpec } from '../../inference/base/types';
import { Distribution } from '../../core/distributions/Distribution';
import { BetaDistribution } from '../../core/distributions/BetaDistribution';
import { TycheError, ErrorCode } from '../../core/errors';

/**
 * Analyzer for binary conversion experiments
 *
 * This analyzer is designed for experiments where the primary metric
 * is a binary outcome (converted vs not converted).
 *
 * Business logic:
 * - Expects binomial or user-level data with binary outcomes
 * - Routes to beta-binomial conjugate models when possible
 * - Provides conversion rate interpretation
 */
export class ConversionAnalyzer implements ExperimentAnalyzer {
  private fitOptions?: FitOptions;

  /**
   * Configure the analyzer with priors and options
   */
  configure(options: AnalyzerOptions): void {
    this.fitOptions = {};

    // Convert conversion prior from Distribution to PriorSpec
    if (options.priors?.has('conversion')) {
      const prior = options.priors.get('conversion')!;
      this.fitOptions.priorParams = this.distributionToPriorSpec(prior);
    }

    // Store progress callback
    if (options.progressCallback) {
      this.fitOptions.onProgress = (progress) => {
        options.progressCallback!(progress.progress);
      };
    }
  }

  /**
   * Analyze a conversion experiment
   */
  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    const start = performance.now();

    try {
      // 1. Validate experiment data
      this.validateExperimentData(data);

      // 2. Combine all variant data for routing decision
      const combinedData = this.combineVariantData(data);

      // 3. Route once to determine model configuration and engine
      const { config, engine } = await ModelRouter.route(combinedData, this.fitOptions);

      // 4. Fit each variant with the same configuration
      const variantResults = new Map<string, VariantResult>();

      // Fit control variant
      const controlData = this.convertToStandardData(data.variants.control);
      const controlResult = await engine.fit(controlData, config, this.fitOptions);

      const controlMetadata: ResultMetadata = {
        timestamp: new Date(),
        algorithm: controlResult.diagnostics.modelType || engine.algorithm,
        computeTime: controlResult.diagnostics.runtime,
        converged: controlResult.diagnostics.converged,
        sampleSize: controlData.n,
        // Add experiment info in extensible metadata
        experimentId: data.id,
        experimentName: data.name,
        variantName: 'control',
      };

      variantResults.set('control', new VariantResult(controlResult.posterior, controlMetadata));

      // Fit treatment variants
      for (const [treatmentName, treatmentVariant] of data.variants.treatments) {
        const treatmentData = this.convertToStandardData(treatmentVariant);
        const treatmentResult = await engine.fit(treatmentData, config, this.fitOptions);

        const treatmentMetadata: ResultMetadata = {
          timestamp: new Date(),
          algorithm: treatmentResult.diagnostics.modelType || engine.algorithm,
          computeTime: treatmentResult.diagnostics.runtime,
          converged: treatmentResult.diagnostics.converged,
          sampleSize: treatmentData.n,
          // Add experiment info in extensible metadata
          experimentId: data.id,
          experimentName: data.name,
          variantName: treatmentName,
        };

        variantResults.set(
          treatmentName,
          new VariantResult(treatmentResult.posterior, treatmentMetadata)
        );
      }

      // 5. Create experiment result
      const totalSamples =
        controlData.n +
        Array.from(data.variants.treatments.values()).reduce((sum, t) => sum + t.data.n, 0);

      const runtime = performance.now() - start;

      const experimentMetadata: ResultMetadata = {
        timestamp: new Date(),
        algorithm: engine.algorithm,
        computeTime: runtime,
        sampleSize: totalSamples,
        // Add experiment-specific metadata
        experimentId: data.id,
        experimentName: data.name,
        analyzerType: 'ConversionAnalyzer',
        variantCount: variantResults.size,
      };

      return new ExperimentResult(variantResults, experimentMetadata);
    } catch (error) {
      throw new TycheError(
        ErrorCode.INTERNAL_ERROR,
        `ConversionAnalyzer failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          experimentId: data.id,
          analyzer: 'ConversionAnalyzer',
          originalError: error,
        }
      );
    }
  }

  /**
   * Validate experiment data for conversion analysis
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

    // Validate each variant has data
    const allVariants = [data.variants.control, ...Array.from(data.variants.treatments.values())];
    for (const variant of allVariants) {
      if (!variant.data || variant.data.n === 0) {
        throw new TycheError(ErrorCode.INVALID_DATA, `Variant '${variant.name}' has no data`);
      }
    }
  }

  /**
   * Combine all variant data for routing decision
   *
   * The router needs to see the overall data characteristics to make
   * the best model selection. For conversion analysis, we combine
   * all conversion events and trials.
   */
  private combineVariantData(data: ExperimentData): StandardData {
    const allVariants = [data.variants.control, ...Array.from(data.variants.treatments.values())];

    // Check if all variants are binomial data
    const allBinomial = allVariants.every((v) => v.data.type === 'binomial');

    if (allBinomial) {
      // Combine binomial data
      let totalSuccesses = 0;
      let totalTrials = 0;

      for (const variant of allVariants) {
        if (variant.data.binomial) {
          totalSuccesses += variant.data.binomial.successes;
          totalTrials += variant.data.binomial.trials;
        }
      }

      return StandardDataFactory.fromBinomial(totalSuccesses, totalTrials);
    } else {
      // Combine user-level data
      const allUsers = allVariants.flatMap((v) =>
        v.data.type === 'user-level' && v.data.userLevel ? v.data.userLevel.users : []
      );

      if (allUsers.length === 0) {
        throw new TycheError(ErrorCode.INVALID_DATA, 'No user data found in any variant');
      }

      return StandardDataFactory.fromUserLevel(allUsers);
    }
  }

  /**
   * Convert VariantData to StandardData
   */
  private convertToStandardData(variantData: any): StandardData {
    // VariantData already contains StandardData in the data field
    return variantData.data as StandardData;
  }

  /**
   * Convert Distribution to PriorSpec for inference engines
   */
  private distributionToPriorSpec(distribution: Distribution): PriorSpec {
    // For conversion analysis, we expect Beta priors
    if (distribution instanceof BetaDistribution) {
      // Use method of moments to estimate parameters from mean/variance
      const mean = distribution.mean();
      const variance = distribution.variance();

      // Method of moments estimation for Beta parameters
      if (variance >= mean * (1 - mean)) {
        throw new TycheError(
          ErrorCode.INVALID_PRIOR,
          'Invalid Beta distribution: variance must be less than mean*(1-mean)'
        );
      }

      const alpha = mean * ((mean * (1 - mean)) / variance - 1);
      const beta = (1 - mean) * ((mean * (1 - mean)) / variance - 1);

      if (alpha <= 0 || beta <= 0) {
        throw new TycheError(
          ErrorCode.INVALID_PRIOR,
          'Invalid Beta parameters derived from distribution'
        );
      }

      return {
        type: 'beta',
        params: [alpha, beta],
      };
    }

    throw new TycheError(
      ErrorCode.INVALID_PRIOR,
      'ConversionAnalyzer requires Beta distribution for conversion prior',
      { distributionType: distribution.constructor.name }
    );
  }
}
