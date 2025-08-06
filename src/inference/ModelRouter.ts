// src/inference/ModelRouter.ts
import {
  StandardData,
  DataQuality,
  isBinomialData,
  isUserLevelData,
} from '../core/data/StandardData';
import { ModelConfig, ModelStructure, ModelType, FitOptions } from './base/types';
import { InferenceEngine } from './base/InferenceEngine';

// Legacy imports for bridge pattern
import { DataInput, CompoundDataInput } from './base/types';

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
    const { BetaBinomialConjugate } = await import('./exact/BetaBinomial');
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

    return this.createRouteResult(config, reasoning, 0.85);
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

    return this.createRouteResult(config, reasoning, 0.8);
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
   * TODO: This will be replaced by proper engine selection once Phase 1 is complete
   */
  private static async selectEngine(config: ModelConfig): Promise<InferenceEngine> {
    // Placeholder - will use bridge pattern to legacy engines
    // This maintains compatibility until Phase 1 engine updates are complete

    if (config.structure === 'simple' && config.type === 'beta') {
      const { BetaBinomialConjugate } = await import('./exact/BetaBinomial');
      return new BetaBinomialConjugate();
    }

    if (config.structure === 'simple' && config.type === 'lognormal') {
      const { LogNormalInference } = await import('./exact/LogNormalInference');
      return new LogNormalInference();
    }

    if (config.structure === 'simple' && config.type === 'normal') {
      const { NormalNormalConjugate } = await import('./exact/NormalNormal');
      return new NormalNormalConjugate();
    }

    // Fallback
    const { LogNormalInference } = await import('./exact/LogNormalInference');
    return new LogNormalInference();
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
}
