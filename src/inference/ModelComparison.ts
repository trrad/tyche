/**
 * Model Comparison Utility
 *
 * Provides diagnostic comparison of different model configurations using various
 * information criteria (WAIC, BIC, DIC). Separated from ModelRouter to enable
 * non-blocking computation and flexible model comparison scenarios.
 */

import { StandardData, isBinomialData, isUserLevelData } from '../core/data/StandardData';
import { ModelConfig, InferenceResult } from './base/types';
import { ModelSelectionCriteria, ModelCandidate } from './ModelSelectionCriteria';
import { ModelRouter } from './ModelRouter';
import { TycheError, ErrorCode } from '../core/errors';

/**
 * Model comparison configuration
 */
export interface ComparisonConfig {
  /** Models to compare */
  models: Array<{
    name: string;
    config: ModelConfig;
  }>;
  /** Criterion to use for comparison */
  criterion?: 'WAIC' | 'BIC' | 'DIC';
  /** Whether to fit models in parallel */
  parallel?: boolean;
}

/**
 * Result of model comparison
 */
export interface ModelComparisonResult {
  /** Ranked models with scores */
  models: Array<{
    name: string;
    config: ModelConfig;
    score: number;
    deltaScore: number;
    weight: number;
  }>;
  /** Best model according to criterion */
  best: {
    name: string;
    config: ModelConfig;
    confidence: number;
  };
  /** Criterion used */
  criterion: string;
  /** Computation time */
  computeTimeMs: number;
}

/**
 * Component comparison result (specialized for mixture components)
 */
export interface ComponentComparisonResult {
  selectedK: number; // What was initially selected
  optimalK: number; // What criterion suggests
  models: Array<{
    k: number;
    score: number;
    deltaScore: number;
    weight: number;
  }>;
  confidence: number; // Weight of best model
  criterion: string;
  computeTimeMs: number;
}

/**
 * Model comparison diagnostic utility
 */
export class ModelComparison {
  /**
   * Compare arbitrary models using specified criterion
   * This is the general-purpose comparison method
   */
  static async compareModels(
    data: StandardData,
    config: ComparisonConfig
  ): Promise<ModelComparisonResult> {
    const startTime = Date.now();
    const criterion = config.criterion || 'WAIC';

    if (!config.models || config.models.length === 0) {
      throw new TycheError(ErrorCode.INVALID_INPUT, 'No models provided for comparison');
    }

    if (config.models.length === 1) {
      // Single model - return trivial result
      return {
        models: [
          {
            name: config.models[0].name,
            config: config.models[0].config,
            score: 0,
            deltaScore: 0,
            weight: 1.0,
          },
        ],
        best: {
          name: config.models[0].name,
          config: config.models[0].config,
          confidence: 1.0,
        },
        criterion,
        computeTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Fit all models (parallel or sequential based on config)
      const fittedModels =
        config.parallel !== false
          ? await this.fitModelsParallel(data, config.models)
          : await this.fitModelsSequential(data, config.models);

      // Prepare candidates for comparison
      const candidates: ModelCandidate[] = fittedModels.map((m) => ({
        name: m.name,
        posterior: m.result.posterior,
        modelType: m.config.type || m.config.valueType || 'unknown',
        config: m.config,
      }));

      // Extract data for comparison
      const comparisonData = this.extractDataForComparison(data);

      // Run comparison based on criterion
      let comparison;
      switch (criterion) {
        case 'WAIC':
          comparison = await ModelSelectionCriteria.compareModels(candidates, comparisonData);
          break;
        case 'BIC':
          comparison = await ModelSelectionCriteria.compareModelsBIC(candidates, comparisonData);
          break;
        case 'DIC':
          comparison = await ModelSelectionCriteria.compareModelsDIC(candidates, comparisonData);
          break;
        default:
          throw new TycheError(
            ErrorCode.INVALID_INPUT,
            `Unknown comparison criterion: ${criterion}`
          );
      }

      // Format results
      const models = comparison.map((c) => ({
        name: c.name,
        config: c.config as ModelConfig,
        score: c.waic, // Will be renamed based on criterion in future
        deltaScore: c.deltaWAIC,
        weight: c.weight,
      }));

      // Best model is first (already sorted by criterion)
      const best = models[0];

      return {
        models,
        best: {
          name: best.name,
          config: best.config,
          confidence: best.weight,
        },
        criterion,
        computeTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof TycheError) {
        throw error;
      }
      throw new TycheError(
        ErrorCode.COMPUTATION_ERROR,
        `Model comparison failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }

  /**
   * Compare different numbers of mixture components
   * This is a convenience method for the common case of comparing k=1,2,3,4
   */
  static async compareMixtureComponents(
    data: StandardData,
    baseConfig: ModelConfig,
    maxComponents: number = 4
  ): Promise<ComponentComparisonResult> {
    const startTime = Date.now();

    // Validate inputs
    if (!this.supportsMixtures(baseConfig)) {
      throw new TycheError(
        ErrorCode.MODEL_MISMATCH,
        'Model configuration does not support mixture components',
        { config: baseConfig }
      );
    }

    // Determine viable k values based on data size
    const maxK = Math.min(maxComponents, Math.floor(data.n / 30)); // Need ~30 points per component
    if (maxK < 1) {
      throw new TycheError(
        ErrorCode.INSUFFICIENT_DATA,
        `Dataset too small for mixture models (n=${data.n})`,
        { dataSize: data.n, minRequired: 30 }
      );
    }

    const kValues = Array.from({ length: maxK }, (_, i) => i + 1);

    // Build model configurations for each k
    const isCompound = baseConfig.structure === 'compound';
    const currentK = isCompound ? baseConfig.valueComponents || 1 : baseConfig.components || 1;

    const models = kValues.map((k) => ({
      name: `k=${k}`,
      config: isCompound ? { ...baseConfig, valueComponents: k } : { ...baseConfig, components: k },
    }));

    // Run general comparison
    const comparisonResult = await this.compareModels(data, {
      models,
      criterion: 'WAIC',
      parallel: true,
    });

    // Extract optimal k
    const optimalModel = comparisonResult.best;
    const optimalK = isCompound
      ? optimalModel.config.valueComponents || 1
      : optimalModel.config.components || 1;

    // Format for component comparison result
    const componentModels = comparisonResult.models.map((m) => {
      const k = isCompound ? m.config.valueComponents || 1 : m.config.components || 1;
      return {
        k,
        score: m.score,
        deltaScore: m.deltaScore,
        weight: m.weight,
      };
    });

    // Sort by k for consistent display
    componentModels.sort((a, b) => a.k - b.k);

    return {
      selectedK: currentK,
      optimalK,
      models: componentModels,
      confidence: comparisonResult.best.confidence,
      criterion: comparisonResult.criterion,
      computeTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Quick check if a model configuration supports mixtures
   */
  static supportsMixtures(config: ModelConfig): boolean {
    if (config.structure === 'simple') {
      return config.type === 'lognormal' || config.type === 'normal';
    } else if (config.structure === 'compound') {
      return config.valueType === 'lognormal' || config.valueType === 'normal';
    }
    return false;
  }

  /**
   * Check if comparison is recommended for given data and config
   */
  static shouldRunComparison(data: StandardData, config: ModelConfig): boolean {
    // Need sufficient data
    if (data.n < 50) {
      return false;
    }

    // Check if model supports mixtures
    return this.supportsMixtures(config);
  }

  /**
   * Fit models in parallel
   */
  private static async fitModelsParallel(
    data: StandardData,
    models: Array<{ name: string; config: ModelConfig }>
  ): Promise<Array<{ name: string; config: ModelConfig; result: InferenceResult }>> {
    return Promise.all(
      models.map(async (model) => {
        const routeResult = await ModelRouter.route(data, { forceConfig: model.config });
        const result = await routeResult.engine.fit(data, model.config);
        return {
          name: model.name,
          config: model.config,
          result,
        };
      })
    );
  }

  /**
   * Fit models sequentially (useful for memory-constrained environments)
   */
  private static async fitModelsSequential(
    data: StandardData,
    models: Array<{ name: string; config: ModelConfig }>
  ): Promise<Array<{ name: string; config: ModelConfig; result: InferenceResult }>> {
    const results = [];
    for (const model of models) {
      const routeResult = await ModelRouter.route(data, { forceConfig: model.config });
      const result = await routeResult.engine.fit(data, model.config);
      results.push({
        name: model.name,
        config: model.config,
        result,
      });
    }
    return results;
  }

  /**
   * Extract data in format needed for model comparison
   */
  private static extractDataForComparison(data: StandardData): any {
    if (isBinomialData(data)) {
      return {
        successes: data.binomial!.successes,
        trials: data.binomial!.trials,
      };
    }

    if (isUserLevelData(data)) {
      // Return full user data - posteriors will use what they need
      return data.userLevel!.users.map((u) => ({
        converted: u.converted,
        value: u.value,
      }));
    }

    throw new TycheError(
      ErrorCode.INVALID_DATA,
      `Cannot extract data for comparison: ${data.type}`,
      { dataType: data.type }
    );
  }
}
