/**
 * PriorLearner - DatasetAnalyzer for learning priors from historical data
 *
 * Analyzes historical datasets to learn prior distributions that can be used
 * in future experiments. Implements prior extraction using posterior parameters.
 * Based on reference implementation in InterfaceStandards.md
 */

import { DatasetAnalyzer, AnalyzerOptions } from './interfaces';
import { StandardData } from '../../core/data/StandardData';
import { VariantResult } from '../results/VariantResult';
import { ResultMetadata } from '../results/ResultMetadata';
import { ModelRouter } from '../../inference/ModelRouter';
import { FitOptions } from '../../inference/base/types';
import { Distribution } from '../../core/distributions/Distribution';
import { BetaDistribution } from '../../core/distributions/BetaDistribution';
import { LogNormalDistribution } from '../../core/distributions/LogNormalDistribution';
import { TycheError, ErrorCode } from '../../core/errors';
import { isCompoundPosterior, hasComponents, hasGetParameters } from '../../core/utils/type-guards';

/**
 * DatasetAnalyzer for learning priors from historical data
 *
 * This analyzer takes a single dataset (historical data) and fits a model
 * to learn the underlying distribution, which can then be extracted as a
 * prior for future experiments.
 *
 * Key capabilities:
 * - Fits models to historical data
 * - Extracts Distribution objects from fitted posteriors
 * - Supports both simple and compound model scenarios
 * - Following reference implementation in InterfaceStandards.md
 */
export class PriorLearner implements DatasetAnalyzer {
  private fitOptions?: FitOptions;

  /**
   * Configure the analyzer (optional for PriorLearner)
   */
  configure(options: AnalyzerOptions): void {
    this.fitOptions = {};

    if (options.progressCallback) {
      this.fitOptions.onProgress = (progress) => {
        options.progressCallback!(progress.progress);
      };
    }
  }

  /**
   * Analyze historical data to learn priors
   * Following exact reference implementation from InterfaceStandards.md
   */
  async analyze(data: StandardData): Promise<VariantResult> {
    const start = performance.now();

    try {
      // Validate input data
      this.validateData(data);

      // Route and fit (exactly as in reference)
      const { config, engine } = await ModelRouter.route(data, this.fitOptions);
      const result = await engine.fit(data, config, this.fitOptions);

      const runtime = performance.now() - start;

      // Return VariantResult (exactly as in reference)
      return new VariantResult(result.posterior, {
        timestamp: new Date(),
        algorithm: result.diagnostics.modelType || engine.algorithm,
        computeTime: result.diagnostics.runtime || runtime,
        converged: result.diagnostics.converged,
        sampleSize: data.n,
        // Add metadata for prior learning context
        purpose: 'prior_learning',
        modelConfig: config,
      });
    } catch (error) {
      throw new TycheError(
        ErrorCode.INTERNAL_ERROR,
        `PriorLearner failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          dataType: data.type,
          sampleSize: data.n,
          analyzer: 'PriorLearner',
          originalError: error,
        }
      );
    }
  }

  /**
   * Extract Distribution from VariantResult for use as prior
   *
   * This is the key method that enables using learned posteriors as priors
   * in future analyses. It extracts the underlying distribution parameters
   * from the fitted posterior.
   */
  extractPrior(result: VariantResult): Distribution | null {
    const posterior = result.getPosterior();

    try {
      // For simple Beta posteriors (conversion rates)
      if (hasGetParameters(posterior) && posterior.hasAnalyticalForm()) {
        const params = posterior.getParameters();

        // Beta posterior from BetaPosterior class
        if ('alpha' in params && 'beta' in params) {
          return new BetaDistribution(params.alpha, params.beta);
        }

        // Normal-Inverse-Gamma posterior from LogNormalPosterior
        if ('mu0' in params && 'posteriorMeanSigma2' in params) {
          // Extract posterior mean parameters to create LogNormal distribution
          return new LogNormalDistribution(
            params.posteriorMeanMu || params.mu0,
            Math.sqrt(params.posteriorMeanSigma2 || 1)
          );
        }

        // Generic parameter extraction for other posteriors
        if ('posteriorMeanMu' in params && 'posteriorMeanSigma2' in params) {
          return new LogNormalDistribution(
            params.posteriorMeanMu,
            Math.sqrt(params.posteriorMeanSigma2)
          );
        }
      }

      // For compound posteriors - extract frequency or severity component
      if (isCompoundPosterior(posterior)) {
        const decomposition = posterior.getDecomposition();

        // Could extract frequency prior (Beta) for conversion component
        if (decomposition.frequency) {
          const frequencyPrior = this.extractPrior(
            new VariantResult(decomposition.frequency, result.getMetadata())
          );
          if (frequencyPrior) {
            return frequencyPrior;
          }
        }

        // Could extract severity prior (LogNormal) for value component
        if (decomposition.severity) {
          const severityPrior = this.extractPrior(
            new VariantResult(decomposition.severity, result.getMetadata())
          );
          if (severityPrior) {
            return severityPrior;
          }
        }
      }

      // For mixture posteriors - extract dominant component
      if (hasComponents(posterior)) {
        const components = posterior.getComponents();
        if (components && components.length > 0) {
          // Find component with highest weight
          const dominant = components.reduce((max: any, c: any) =>
            c.weight > max.weight ? c : max
          );

          // Note: Component info only contains summary statistics (mean, variance, weight)
          // For proper prior extraction from mixture components, we would need access
          // to the component posteriors, which is not available through the current interface

          // Otherwise, create distribution from component parameters
          if (dominant.mean !== undefined && dominant.variance !== undefined) {
            // Assume LogNormal for positive values
            if (dominant.mean > 0) {
              // Convert mean/variance to LogNormal parameters
              const meanLog = Math.log(dominant.mean);
              const varLog = Math.log(1 + dominant.variance / (dominant.mean * dominant.mean));
              return new LogNormalDistribution(meanLog, Math.sqrt(varLog));
            }
          }
        }
      }

      return null; // Can't extract analytical prior
    } catch (error) {
      console.warn('Failed to extract prior from result:', error);
      return null;
    }
  }

  /**
   * Extract frequency prior from compound model result
   * Convenience method for compound revenue models
   */
  extractFrequencyPrior(result: VariantResult): Distribution | null {
    const posterior = result.getPosterior();

    if ('getDecomposition' in posterior) {
      const decomposition = (posterior as any).getDecomposition();
      if (decomposition.frequency) {
        return this.extractPrior(new VariantResult(decomposition.frequency, result.getMetadata()));
      }
    }

    return null;
  }

  /**
   * Extract severity prior from compound model result
   * Convenience method for compound revenue models
   */
  extractSeverityPrior(result: VariantResult): Distribution | null {
    const posterior = result.getPosterior();

    if ('getDecomposition' in posterior) {
      const decomposition = (posterior as any).getDecomposition();
      if (decomposition.severity) {
        return this.extractPrior(new VariantResult(decomposition.severity, result.getMetadata()));
      }
    }

    return null;
  }

  /**
   * Validate input data for prior learning
   */
  private validateData(data: StandardData): void {
    if (data.n === 0) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Cannot learn prior from empty dataset');
    }

    if (data.type === 'binomial') {
      if (!data.binomial) {
        throw new TycheError(ErrorCode.INVALID_DATA, 'Binomial data structure is missing');
      }
      if (data.binomial.trials === 0) {
        throw new TycheError(ErrorCode.INVALID_DATA, 'Cannot learn prior from zero trials');
      }
    }

    if (data.type === 'user-level') {
      if (!data.userLevel || data.userLevel.users.length === 0) {
        throw new TycheError(ErrorCode.INVALID_DATA, 'User-level data is missing or empty');
      }
    }
  }
}
