/**
 * Unified inference engine with smart algorithm selection
 * Automatically chooses the best inference method based on data and model type
 */

import { BetaBinomialConjugate } from './exact/BetaBinomial';
import { GammaExponentialConjugate } from './exact/GammaExponential';
import { NormalMixtureEM } from './approximate/em/NormalMixtureEM';
import { LogNormalMixtureEM } from './approximate/em/LogNormalMixtureEM';
import { LogNormalBayesian } from './exact/LogNormalInference';
import { CompoundPosterior } from '../models/compound/CompoundModel';
import { ModelRouter, ModelRouteResult } from './ModelRouter';
import {
  DataInput,
  CompoundDataInput,
  FitOptions,
  InferenceResult,
  BinomialData,
} from './base/types';

export type ModelType =
  | 'auto' // Auto-detect from data
  | 'beta-binomial' // Binary outcomes (conversion rates)
  | 'lognormal' // Heavy-tailed positive values
  | 'normal-mixture' // Multimodal continuous data
  | 'lognormal-mixture' // Multimodal heavy-tailed (e.g., revenue segments)
  | 'compound-beta-lognormal' // Conversion × Revenue
  | 'compound-beta-lognormalmixture'; // Conversion × Revenue (with customer segments)

// Model descriptions for UI
export const MODEL_DESCRIPTIONS: Record<
  ModelType,
  { name: string; description: string; dataType: string }
> = {
  auto: {
    name: 'Auto-detect',
    description: 'Automatically choose the best model based on your data',
    dataType: 'Any',
  },
  'beta-binomial': {
    name: 'Conversion Rate',
    description: 'For binary outcomes like conversions, clicks, or signups',
    dataType: 'Binary (0/1) or success/trial counts',
  },
  lognormal: {
    name: 'Revenue (Simple)',
    description: 'For positive values with heavy tails like revenue or time',
    dataType: 'Positive continuous values',
  },
  'normal-mixture': {
    name: 'Multimodal Data',
    description: 'For data with multiple peaks or distinct groups',
    dataType: 'Any continuous values',
  },
  'lognormal-mixture': {
    name: 'Revenue (Segments)',
    description: 'For revenue data with customer segments (e.g., low/high spenders)',
    dataType: 'Positive values with multiple groups',
  },
  'compound-beta-lognormal': {
    name: 'Conversion + Revenue',
    description: 'Analyzes both whether users convert AND how much they spend',
    dataType: 'User data with conversion status and values',
  },
  'compound-beta-lognormalmixture': {
    name: 'Conversion + Revenue (Segments)',
    description: 'Like above but identifies revenue segments (budget vs premium customers)',
    dataType: 'User data with conversion status and values',
  },
};

// Helper to get user-friendly model name
export function getModelDisplayName(modelType: ModelType): string {
  return MODEL_DESCRIPTIONS[modelType]?.name || modelType;
}

// Helper to check if model supports mixture components
export function isModelMixture(modelType: ModelType): boolean {
  return modelType.includes('mixture');
}

// Helper to check if model is compound
export function isModelCompound(modelType: ModelType): boolean {
  return modelType.startsWith('compound-');
}

/**
 npm* Main entry point for all inference in Tyche
 * Provides smart routing to appropriate algorithms
 */
export class InferenceEngine {
  private engines = {
    'beta-binomial': new BetaBinomialConjugate(),
    gamma: new GammaExponentialConjugate(),
    'normal-mixture': new NormalMixtureEM(),
    'lognormal-mixture': new LogNormalMixtureEM(),
    lognormal: new LogNormalBayesian(),
  };

  /**
   * Fit a model using the appropriate inference algorithm
   *
   * @param modelType Type of model to fit (or 'auto' for automatic selection)
   * @param data Input data
   * @param options Fitting options
   * @returns Inference result with posterior and diagnostics
   */
  async fit<T extends ModelType | 'auto'>(
    modelType: T,
    data: DataInput | CompoundDataInput,
    options?: FitOptions & {
      businessContext?: 'revenue' | 'conversion' | 'engagement' | 'other';
      returnRouteInfo?: boolean;
      maxComponents?: number;
      preferSimple?: boolean;
      useWAIC?: boolean; // Enable WAIC-based selection (default: true)
    }
  ): Promise<
    InferenceResult & {
      routeInfo?: any; // Updated to match new ModelRouter interface
      waicInfo?: {
        waic: number;
        components?: Array<{
          k: number;
          waic: number;
          deltaWAIC: number;
          weight: number;
        }>;
      };
    }
  > {
    let actualModelType: ModelType;
    let routeInfo: any;

    if (modelType === 'auto') {
      // Convert legacy data format to StandardData for new ModelRouter
      const standardData = await this.convertToStandardData(data);

      // Use new ModelRouter interface
      const { ModelRouter } = await import('./ModelRouter');
      const routeResult = await ModelRouter.route(standardData, options);

      routeInfo = {
        recommendedModel: this.convertModelConfigToLegacyType(routeResult.config),
        confidence: routeResult.confidence,
        reasoning: routeResult.reasoning,
        alternatives: routeResult.alternatives,
        // Include new ModelConfig for future use
        modelConfig: routeResult.config,
      };

      actualModelType = routeInfo.recommendedModel;

      // Use bridge pattern for backward compatibility
      const result = await ModelRouter.legacyFit(routeResult.config, standardData, options);

      return {
        ...result,
        routeInfo,
      };
    } else {
      actualModelType = modelType;
    }

    // Execute the selected model
    const result = await this.executeModel(actualModelType, data, options);

    // Compute WAIC for the final model if requested
    let waicInfo: any;
    if (options?.useWAIC && result.posterior) {
      try {
        const { ModelSelectionCriteria } = await import('./ModelSelectionCriteriaSimple');
        // Extract data array for WAIC computation
        let dataArray: any;
        if ('data' in data) {
          dataArray = Array.isArray(data.data) ? data.data : [data.data];
        } else {
          dataArray = data;
        }
        const waic = await ModelSelectionCriteria.computeWAIC(
          result.posterior,
          dataArray,
          actualModelType
        );

        waicInfo = {
          waic: waic.waic,
          components: routeInfo?.modelParams?.waicComparison,
        };
      } catch (e) {
        console.warn('Failed to compute WAIC:', e);
      }
    }

    // Build enhanced result
    const enhancedResult: any = { ...result };

    if (options?.returnRouteInfo && routeInfo) {
      enhancedResult.routeInfo = routeInfo;
    }

    if (waicInfo) {
      enhancedResult.waicInfo = waicInfo;
    }

    return enhancedResult;
  }

  /**
   * Execute a specific model type
   * This replaces the switch statement with cleaner routing
   */
  private async executeModel(
    modelType: ModelType,
    data: DataInput | CompoundDataInput,
    options?: FitOptions
  ): Promise<InferenceResult> {
    // Simple models
    if (modelType === 'beta-binomial') {
      return this.engines['beta-binomial'].fit(data as DataInput, options);
    }

    if (modelType === 'lognormal') {
      return this.engines['lognormal'].fit(data as DataInput, options);
    }

    // Mixture models
    if (modelType === 'normal-mixture') {
      return this.engines['normal-mixture'].fit(data as DataInput, options);
    }

    if (modelType === 'lognormal-mixture') {
      return this.engines['lognormal-mixture'].fit(data as DataInput, options);
    }

    // Compound models
    if (modelType.startsWith('compound-')) {
      const severityType = this.extractSeverityType(modelType);
      return this.fitCompoundModel(data as CompoundDataInput, severityType, options);
    }

    throw new Error(`Unknown model type: ${modelType}`);
  }

  /**
   * Extract severity model type from compound model name
   */
  private extractSeverityType(modelType: string): 'gamma' | 'lognormal' | 'lognormal-mixture' {
    if (modelType === 'compound-beta-gamma') return 'gamma';
    if (modelType === 'compound-beta-lognormal') return 'lognormal';
    if (modelType === 'compound-beta-lognormalmixture') return 'lognormal-mixture';
    throw new Error(`Invalid compound model type: ${modelType}`);
  }

  /**
   * Fit compound revenue model
   */
  private async fitCompoundModel(
    data: CompoundDataInput,
    severityModelType: 'gamma' | 'lognormal' | 'lognormal-mixture' | 'normal-mixture',
    options?: FitOptions
  ): Promise<{ posterior: CompoundPosterior; diagnostics: any }> {
    if (!Array.isArray(data.data)) {
      throw new Error('Compound model requires array data');
    }

    const startTime = performance.now();
    const userData = data.data;

    // Create appropriate compound model
    const { createCompoundModel } = await import('../models/compound/CompoundModel');
    const numComponents = data.config?.numComponents || 2;
    const compoundModel = createCompoundModel('beta-binomial', severityModelType, this, {
      numComponents: numComponents,
    });

    // Fit the compound model
    const compoundPosterior = await compoundModel.fit(userData, {
      frequencyOptions: options,
      severityOptions: options,
    });

    const runtime = performance.now() - startTime;

    return {
      posterior: compoundPosterior,
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime: runtime,
        modelType: `compound-beta-${severityModelType}`,
      },
    };
  }

  /**
   * Create standardized data input from various formats
   */
  static createDataInput(data: any, config?: any): DataInput {
    // Helper to standardize input formats
    if (typeof data === 'object' && !Array.isArray(data)) {
      // Summary statistics or binomial format
      return { data, config };
    } else if (Array.isArray(data)) {
      // Raw data format
      return { data, config };
    } else {
      throw new Error('Invalid data format');
    }
  }

  /**
   * Convert binary array to binomial summary
   */
  static binaryToBinomial(data: number[]): BinomialData {
    const successes = data.filter((x) => x === 1).length;
    const trials = data.length;
    return { successes, trials };
  }

  /**
   * Get available model types
   */
  getAvailableModels(): string[] {
    return Object.keys(this.engines);
  }

  /**
   * Check if a specific model type is available
   */
  hasModel(modelType: string): boolean {
    return modelType in this.engines;
  }

  /**
   * Convert a DataInput/CompoundDataInput to StandardData for new ModelRouter
   */
  private async convertToStandardData(data: DataInput | CompoundDataInput): Promise<any> {
    // Import StandardDataFactory
    const { StandardDataFactory } = await import('../core/data/StandardData');

    if ('data' in data) {
      const dataContent = data.data;

      // Check if it's binomial data
      if (
        typeof dataContent === 'object' &&
        'successes' in dataContent &&
        'trials' in dataContent
      ) {
        return StandardDataFactory.fromBinomial(dataContent.successes, dataContent.trials);
      }

      // Check if it's compound data (user-level with conversion + value)
      if (Array.isArray(dataContent) && dataContent.length > 0) {
        const firstItem = dataContent[0];
        if (typeof firstItem === 'object' && 'converted' in firstItem && 'value' in firstItem) {
          // Convert to UserLevelData format
          const users = dataContent.map((item: any, index: number) => ({
            userId: `user_${index}`,
            converted: item.converted,
            value: item.value,
          }));
          return StandardDataFactory.fromUserLevel(users);
        }

        // Simple array of numbers - treat as continuous data
        if (typeof firstItem === 'number') {
          return StandardDataFactory.fromContinuous(dataContent as number[]);
        }
      }
    }

    throw new Error('Unable to convert data format to StandardData');
  }

  /**
   * Convert ModelConfig to legacy ModelType string
   */
  private convertModelConfigToLegacyType(config: any): ModelType {
    // Map new ModelConfig to legacy string format
    if (config.structure === 'simple') {
      if (config.type === 'beta') return 'beta-binomial';
      if (config.type === 'lognormal') {
        return config.components > 1 ? 'lognormal-mixture' : 'lognormal';
      }
      if (config.type === 'normal') {
        return config.components > 1 ? 'normal-mixture' : 'lognormal'; // Fallback to lognormal since normal isn't in ModelType
      }
    }

    if (config.structure === 'compound') {
      if (config.valueComponents > 1) {
        return 'compound-beta-lognormalmixture';
      }
      return 'compound-beta-lognormal';
    }

    // Fallback
    return 'lognormal';
  }
}

// Export convenience functions
export { BetaPosterior } from './exact/BetaBinomial';
export { GammaPosterior } from './exact/GammaExponential';
export { NormalMixturePosterior } from './approximate/em/NormalMixtureEM';
export { LogNormalPosterior, LogNormalBayesian } from './exact/LogNormalInference';
