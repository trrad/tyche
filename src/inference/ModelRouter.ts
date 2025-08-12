// src/inference/ModelRouter.ts
import {
  StandardData,
  DataQuality,
  isBinomialData,
  isUserLevelData,
} from '../core/data/StandardData';
import { ModelConfig, ModelStructure, ModelType, FitOptions } from './base/types';
import { InferenceEngine } from './base/InferenceEngine';
import { TycheError, ErrorCode } from '../core/errors';
import { ModelSelectionCriteria, ModelCandidate } from './ModelSelectionCriteria';

// Legacy imports for bridge pattern
import { DataInput, CompoundDataInput } from './base/types';

/**
 * Result of component comparison using WAIC
 */
export interface ComponentComparisonResult {
  selectedK: number; // What heuristic chose
  optimalK: number; // What WAIC suggests
  models: Array<{
    k: number;
    waic: number;
    deltaWAIC: number;
    weight: number;
  }>;
  confidence: number; // Weight of best model
  computeTimeMs: number;
}

/**
 * Result of model routing decision
 */
export interface ModelRouteResult {
  config: ModelConfig;
  engine: InferenceEngine;
  confidence: number;
  reasoning: string[];
  alternatives?: Array<{
    config: ModelConfig;
    reason: string;
  }>;
  // Optional background WAIC comparison for component selection
  componentComparison?: {
    promise: Promise<ComponentComparisonResult>;
    cancel?: () => void;
  };
}

/**
 * Capability-based model router using data quality indicators
 * Implements single routing decision point as specified in task #75
 */
export class ModelRouter {
  /**
   * Main routing function - capability-based using DataQuality indicators
   * Uses data quality indicators for routing decisions per InterfaceStandards.md
   */
  static async route(data: StandardData, fitOptions?: FitOptions): Promise<ModelRouteResult> {
    const reasoning: string[] = [];

    // Check if user provided a forced configuration
    if (fitOptions?.forceConfig) {
      reasoning.push('Using user-specified model configuration');
      const engine = await this.selectEngine(fitOptions.forceConfig);

      return {
        config: fitOptions.forceConfig,
        engine,
        confidence: 1.0, // User knows what they want
        reasoning,
      };
    }

    // Route based on data type
    if (isBinomialData(data)) {
      return this.routeBinomial(data, reasoning);
    }

    if (isUserLevelData(data)) {
      return this.routeUserLevel(data, reasoning, fitOptions);
    }

    throw new Error(`Unsupported data type: ${data.type}`);
  }

  /**
   * Route binomial data (always beta-binomial conjugate)
   */
  private static async routeBinomial(
    data: StandardData,
    reasoning: string[]
  ): Promise<ModelRouteResult> {
    reasoning.push('Binomial data always uses Beta-Binomial conjugate model');

    const config: ModelConfig = {
      structure: 'simple',
      type: 'beta',
      components: 1,
    };

    // Import engine dynamically to avoid circular dependencies
    const { BetaBinomialConjugate } = await import('./exact/BetaBinomialConjugate');
    const engine = new BetaBinomialConjugate();

    return {
      config,
      engine,
      confidence: 1.0,
      reasoning,
    };
  }

  /**
   * Route user-level data using DataQuality indicators
   */
  private static async routeUserLevel(
    data: StandardData,
    reasoning: string[],
    fitOptions?: FitOptions
  ): Promise<ModelRouteResult> {
    if (!isUserLevelData(data)) {
      throw new Error('Expected user-level data');
    }

    const quality = data.quality;
    const users = data.userLevel.users;

    // Determine structure based on zero values (compound vs simple)
    if (quality.hasZeros) {
      reasoning.push('Data contains zeros, using compound model structure');
      return this.routeCompoundModel(data, quality, reasoning, fitOptions);
    } else {
      reasoning.push('No zeros in data, using simple model structure');
      return this.routeSimpleModel(data, quality, reasoning, fitOptions);
    }
  }

  /**
   * Route compound models (zero-inflated: frequency × severity)
   */
  private static async routeCompoundModel(
    data: StandardData,
    quality: DataQuality,
    reasoning: string[],
    fitOptions?: FitOptions
  ): Promise<ModelRouteResult> {
    const users = data.userLevel!.users;

    // Extract positive values for value distribution analysis
    const positiveValues = users.filter((u) => u.converted && u.value > 0).map((u) => u.value);

    if (positiveValues.length === 0) {
      reasoning.push('No positive values found, defaulting to Beta-LogNormal compound');

      const config: ModelConfig = {
        structure: 'compound',
        frequencyType: 'beta',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      return this.createRouteResult(config, reasoning, 0.9);
    }

    // Determine value distribution type based on data characteristics
    const valueType = this.selectValueDistribution(positiveValues, quality, reasoning);
    const valueComponents = this.determineComponents(positiveValues, reasoning);

    const config: ModelConfig = {
      structure: 'compound',
      frequencyType: 'beta', // Always beta for frequency per InterfaceStandards.md
      valueType,
      valueComponents,
    };

    const result = await this.createRouteResult(config, reasoning, 0.85);

    // Add background component comparison for the value distribution
    if (this.shouldRunComponentComparison(data, config, fitOptions)) {
      result.componentComparison = {
        promise: this.compareComponents(data, config),
        cancel: () => {}, // Could implement cancellation if needed
      };
    }

    return result;
  }

  /**
   * Route simple models (continuous data, everyone converted)
   */
  private static async routeSimpleModel(
    data: StandardData,
    quality: DataQuality,
    reasoning: string[],
    fitOptions?: FitOptions
  ): Promise<ModelRouteResult> {
    const users = data.userLevel!.users;
    const values = users.map((u) => u.value);

    // Determine distribution type based on data characteristics
    const type = this.selectValueDistribution(values, quality, reasoning);
    const components = this.determineComponents(values, reasoning);

    const config: ModelConfig = {
      structure: 'simple',
      type,
      components,
    };

    const result = await this.createRouteResult(config, reasoning, 0.8);

    // Add background component comparison for mixture-capable models
    if (this.shouldRunComponentComparison(data, config, fitOptions)) {
      result.componentComparison = {
        promise: this.compareComponents(data, config),
        cancel: () => {}, // Could implement cancellation if needed
      };
    }

    return result;
  }

  /**
   * Select value distribution type based on data characteristics
   */
  private static selectValueDistribution(
    values: number[],
    quality: DataQuality,
    reasoning: string[]
  ): ModelType {
    // If data has negative values, must use normal-based models
    if (quality.hasNegatives) {
      reasoning.push('Data contains negative values, using Normal distribution');
      return 'normal';
    }

    // For positive data, analyze characteristics
    const stats = this.computeBasicStats(values);

    // High skewness suggests LogNormal
    if (stats.skewness > 2) {
      reasoning.push(
        `High skewness (${stats.skewness.toFixed(2)}) suggests LogNormal distribution`
      );
      return 'lognormal';
    }

    // High coefficient of variation suggests LogNormal
    if (stats.cv > 1.0) {
      reasoning.push(
        `High coefficient of variation (${stats.cv.toFixed(2)}) suggests LogNormal distribution`
      );
      return 'lognormal';
    }

    // Default to LogNormal for business metrics (revenue, etc.)
    reasoning.push('Positive continuous data, defaulting to LogNormal distribution');
    return 'lognormal';
  }

  /**
   * Determine number of components based on data characteristics
   */
  private static determineComponents(values: number[], reasoning: string[]): number {
    if (values.length < 50) {
      reasoning.push('Small dataset, using single component');
      return 1;
    }

    // Check for potential multimodality using simple heuristics
    const stats = this.computeBasicStats(values);

    // High kurtosis suggests multiple modes
    if (stats.kurtosis > 3) {
      reasoning.push(`High kurtosis (${stats.kurtosis.toFixed(2)}) suggests mixture model`);
      return 2;
    }

    // Check for gaps in the data
    const sorted = [...values].sort((a, b) => a - b);
    const hasGaps = this.detectGaps(sorted);

    if (hasGaps) {
      reasoning.push('Detected gaps in data distribution, using mixture model');
      return 2;
    }

    reasoning.push('No evidence of multimodality, using single component');
    return 1;
  }

  /**
   * Create route result with engine selection
   */
  private static async createRouteResult(
    config: ModelConfig,
    reasoning: string[],
    confidence: number
  ): Promise<ModelRouteResult> {
    // For now, return a placeholder engine - will be replaced by actual engine selection
    // This is where the bridge pattern will map to actual engines
    const engine = await this.selectEngine(config);

    return {
      config,
      engine,
      confidence,
      reasoning,
    };
  }

  /**
   * Select appropriate inference engine for configuration
   */
  private static async selectEngine(config: ModelConfig): Promise<InferenceEngine> {
    try {
      // Handle compound models
      if (config.structure === 'compound') {
        const compoundModule = await import('./compound/CompoundInferenceEngine').catch(() => null);
        if (compoundModule) {
          return new compoundModule.CompoundInferenceEngine('compound');
        }
        throw new TycheError(ErrorCode.NOT_IMPLEMENTED, 'CompoundInferenceEngine not available', {
          config,
        });
      }

      // Handle simple models with potential mixtures
      if (config.structure === 'simple') {
        // For mixture models
        if (config.components && config.components > 1) {
          if (config.type === 'lognormal') {
            const mixModule = await import('./approximate/em/LogNormalMixtureVBEM').catch(
              () => null
            );
            if (mixModule) {
              return new mixModule.LogNormalMixtureVBEM();
            }
          }
          if (config.type === 'normal') {
            const mixModule = await import('./approximate/em/NormalMixtureVBEM').catch(() => null);
            if (mixModule) {
              return new mixModule.NormalMixtureVBEM();
            }
          }
        }

        // For single component models
        const engineModules = await Promise.all([
          import('./exact/BetaBinomialConjugate').catch(() => null),
          import('./exact/LogNormalConjugate').catch(() => null),
          import('./exact/NormalConjugate').catch(() => null),
        ]);

        const [betaBinomialModule, logNormalModule, normalModule] = engineModules;

        if (config.type === 'beta' && betaBinomialModule) {
          return new betaBinomialModule.BetaBinomialConjugate();
        }

        if (config.type === 'lognormal' && logNormalModule) {
          return new logNormalModule.LogNormalConjugate();
        }

        if (config.type === 'normal' && normalModule) {
          return new normalModule.NormalConjugate();
        }
      }

      throw new TycheError(
        ErrorCode.MODEL_MISMATCH,
        `No suitable inference engine for config: ${JSON.stringify(config)}`,
        { config }
      );
    } catch (error) {
      console.warn('Engine import failed:', error);
      if (error instanceof TycheError) {
        throw error;
      }
      throw new TycheError(
        ErrorCode.INTERNAL_ERROR,
        `Failed to load inference engine for config: ${JSON.stringify(config)}`,
        { config, originalError: error }
      );
    }
  }

  // =============================================================================
  // BRIDGE PATTERN - Temporary compatibility layer
  // TODO: Remove this section once Phase 1 engine migration is complete (task #77)
  // =============================================================================

  /**
   * Bridge method for backward compatibility during engine migration
   * Converts new ModelConfig interface to legacy engine calls
   */
  static async legacyFit(
    config: ModelConfig,
    data: StandardData,
    options?: FitOptions
  ): Promise<any> {
    const engine = await this.selectEngine(config);

    // Convert StandardData to legacy format
    const legacyData = this.convertToLegacyFormat(data, config);

    // Call legacy engine interface
    return await (engine as any).fit(legacyData, options);
  }

  /**
   * Convert StandardData to legacy DataInput/CompoundDataInput format
   */
  private static convertToLegacyFormat(
    data: StandardData,
    config: ModelConfig
  ): DataInput | CompoundDataInput {
    if (isBinomialData(data)) {
      return {
        data: {
          successes: data.binomial!.successes,
          trials: data.binomial!.trials,
        },
      };
    }

    if (isUserLevelData(data)) {
      if (config.structure === 'compound') {
        // CompoundDataInput format
        return {
          data: data.userLevel!.users.map((u) => ({
            converted: u.converted,
            value: u.value,
          })),
        };
      } else {
        // Simple DataInput format
        return {
          data: data.userLevel!.users.map((u) => u.value),
        };
      }
    }

    throw new Error(`Cannot convert data type: ${data.type}`);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Compute basic statistics for routing decisions
   */
  private static computeBasicStats(values: number[]) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / (n - 1);
    const std = Math.sqrt(variance);
    const cv = std / mean;

    // Skewness
    const skewness = values.reduce((a, x) => a + Math.pow((x - mean) / std, 3), 0) / n;

    // Kurtosis
    const kurtosis = values.reduce((a, x) => a + Math.pow((x - mean) / std, 4), 0) / n - 3;

    return { n, mean, variance, std, cv, skewness, kurtosis };
  }

  /**
   * Detect gaps in data distribution that suggest multimodality
   */
  private static detectGaps(sortedValues: number[]): boolean {
    if (sortedValues.length < 10) return false;

    const n = sortedValues.length;
    const q25 = sortedValues[Math.floor(0.25 * n)];
    const q75 = sortedValues[Math.floor(0.75 * n)];
    const q50 = sortedValues[Math.floor(0.5 * n)];

    const gap1 = Math.abs(q25 - q50);
    const gap2 = Math.abs(q75 - q50);
    const meanGap = (gap1 + gap2) / 2;

    const range = sortedValues[n - 1] - sortedValues[0];
    const relativeGap = meanGap / range;

    return relativeGap > 0.3; // Gap larger than 30% of range suggests multiple modes
  }

  // =============================================================================
  // COMPONENT COMPARISON (WAIC-BASED)
  // =============================================================================

  /**
   * Determine if we should run background component comparison
   */
  private static shouldRunComponentComparison(
    data: StandardData,
    config: ModelConfig,
    fitOptions?: FitOptions
  ): boolean {
    // Don't run if user forced a specific config
    if (fitOptions?.forceConfig) {
      return false;
    }

    // Need sufficient data (at least 50 points)
    if (data.n < 50) {
      return false;
    }

    // Check if model supports mixtures
    if (config.structure === 'simple') {
      // Simple models: must be a mixture-capable type
      return config.type === 'lognormal' || config.type === 'normal';
    } else if (config.structure === 'compound') {
      // Compound models: value distribution must be mixture-capable
      return config.valueType === 'lognormal' || config.valueType === 'normal';
    }

    return false;
  }

  /**
   * Compare different numbers of components using WAIC
   * Runs in background to avoid blocking initial results
   */
  private static async compareComponents(
    data: StandardData,
    baseConfig: ModelConfig
  ): Promise<ComponentComparisonResult> {
    const startTime = Date.now();

    // Determine current k and whether it's compound
    const isCompound = baseConfig.structure === 'compound';
    const currentK = isCompound ? baseConfig.valueComponents! : baseConfig.components!;

    // Determine k values to test based on data size
    const maxK = Math.min(4, Math.floor(data.n / 30)); // Need at least 30 points per component
    const kValues = Array.from({ length: maxK }, (_, i) => i + 1);

    // If only one k value is viable, skip comparison
    if (kValues.length === 1) {
      return {
        selectedK: currentK,
        optimalK: 1,
        models: [
          {
            k: 1,
            waic: 0,
            deltaWAIC: 0,
            weight: 1.0,
          },
        ],
        confidence: 1.0,
        computeTimeMs: Date.now() - startTime,
      };
    }

    try {
      // Fit all models in parallel
      const fittedModels = await Promise.all(
        kValues.map(async (k) => {
          // Create config with this k value
          const config = isCompound
            ? { ...baseConfig, valueComponents: k }
            : { ...baseConfig, components: k };

          // Get engine and fit
          const engine = await this.selectEngine(config);
          const result = await engine.fit(data, config);

          return {
            k,
            config,
            posterior: result.posterior,
            engine,
          };
        })
      );

      // Prepare for WAIC comparison
      const candidates: ModelCandidate[] = fittedModels.map((m) => ({
        name: isCompound ? `value_k=${m.k}` : `k=${m.k}`,
        posterior: m.posterior,
        modelType: isCompound ? baseConfig.valueType! : baseConfig.type!,
        config: m.config,
      }));

      // Extract data for WAIC (convert to appropriate format)
      const waicData = this.extractDataForWAIC(data);

      // Run WAIC comparison
      const comparison = await ModelSelectionCriteria.compareModels(candidates, waicData);

      // Find optimal k (best WAIC)
      const optimalResult = comparison[0]; // Already sorted by WAIC
      const optimalK = isCompound
        ? optimalResult.config?.valueComponents || 1
        : optimalResult.config?.components || 1;

      // Format results
      const models = comparison.map((c) => {
        const k = isCompound ? c.config?.valueComponents || 1 : c.config?.components || 1;

        return {
          k,
          waic: c.waic,
          deltaWAIC: c.deltaWAIC,
          weight: c.weight,
        };
      });

      // Sort by k for consistent display
      models.sort((a, b) => a.k - b.k);

      return {
        selectedK: currentK,
        optimalK,
        models,
        confidence: comparison[0].weight, // Confidence in best model
        computeTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.warn('Component comparison failed:', error);

      // Return fallback result on error
      return {
        selectedK: currentK,
        optimalK: currentK,
        models: [
          {
            k: currentK,
            waic: 0,
            deltaWAIC: 0,
            weight: 1.0,
          },
        ],
        confidence: 0,
        computeTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract data in format needed for WAIC computation
   */
  private static extractDataForWAIC(data: StandardData): any {
    if (isBinomialData(data)) {
      return {
        successes: data.binomial!.successes,
        trials: data.binomial!.trials,
      };
    }

    if (isUserLevelData(data)) {
      // For compound models, we need the full user data with conversion status
      // For simple models, we just need the values
      // We'll return the full user data and let the posterior decide what to use
      return data.userLevel!.users.map((u) => ({
        converted: u.converted,
        value: u.value,
      }));
    }

    throw new Error(`Cannot extract data for WAIC: ${data.type}`);
  }
}
