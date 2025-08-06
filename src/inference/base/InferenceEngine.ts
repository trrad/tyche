/**
 * Abstract base class for all inference engines
 * Enhanced for capability-based routing and ModelConfig support
 */

import { FitOptions, InferenceResult, ModelConfig, ModelStructure, ModelType } from '../base/types';

// Import StandardData - it's already implemented
import { StandardData, DataType } from '../../core/data/StandardData';

// Import TycheError for proper error handling
import { TycheError, ErrorCode } from '../../core/errors';

/**
 * Capabilities that an inference engine can declare
 */
export interface EngineCapabilities {
  /** Model structures this engine can handle */
  structures: ModelStructure[];
  /** Distribution types this engine supports */
  types: ModelType[];
  /** Data types this engine accepts */
  dataTypes: DataType[];
  /** Number of components supported (array of specific numbers or 'any') */
  components: number[] | 'any';

  /** Performance characteristics */
  exact: boolean; // Provides exact analytical results
  fast: boolean; // Typically <100ms
  stable: boolean; // Numerically stable
}

export abstract class InferenceEngine {
  constructor(protected readonly name: string) {}

  /**
   * Declare what this engine can handle - must be implemented by subclasses
   */
  abstract readonly capabilities: EngineCapabilities;

  /**
   * Algorithm type - must be declared by subclasses
   */
  abstract readonly algorithm: 'conjugate' | 'em' | 'vi' | 'mcmc';

  /**
   * Primary fit method - engines must implement this for the standardized interface
   */
  abstract fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult>;

  /**
   * Primary canHandle method - determines if this engine can handle a model configuration
   * Follows canonical interface from InterfaceStandards.md
   */
  canHandle(config: ModelConfig, data: StandardData, fitOptions?: FitOptions): boolean {
    return (
      this.matchesStructure(config.structure) &&
      this.matchesType(config) &&
      this.matchesData(data.type) &&
      this.supportsComponents(config) &&
      this.supportsPrior(fitOptions)
    );
  }

  /**
   * Helper method: Check if engine supports the model structure
   */
  protected matchesStructure(structure: ModelStructure): boolean {
    return this.capabilities.structures.includes(structure);
  }

  /**
   * Helper method: Check if engine supports the model type(s)
   */
  protected matchesType(config: ModelConfig): boolean {
    // For simple models, check the primary type
    if (config.structure === 'simple' && config.type) {
      return this.capabilities.types.includes(config.type);
    }

    // For compound models, check the value type
    if (config.structure === 'compound' && config.valueType) {
      return this.capabilities.types.includes(config.valueType);
    }

    return true;
  }

  /**
   * Helper method: Check if engine supports the data type
   */
  protected matchesData(dataType: DataType): boolean {
    return this.capabilities.dataTypes.includes(dataType);
  }

  /**
   * Helper method: Check if engine supports the component count
   */
  protected supportsComponents(config: ModelConfig): boolean {
    if (this.capabilities.components === 'any') {
      return true;
    }

    const componentCount =
      config.structure === 'simple' ? config.components || 1 : config.valueComponents || 1;

    return (this.capabilities.components as number[]).includes(componentCount);
  }

  /**
   * Helper method: Check if engine supports the specified prior
   * TODO: Implement proper prior compatibility checking
   */
  protected supportsPrior(fitOptions?: FitOptions): boolean {
    // For now, assume all engines support all priors
    // This should be implemented based on the specific prior system
    return true;
  }

  /**
   * Get a description of the inference method
   */
  getDescription(): string {
    return this.name;
  }

  /**
   * Get algorithm performance characteristics
   */
  getPerformanceInfo(): { exact: boolean; fast: boolean; stable: boolean } {
    return {
      exact: this.capabilities.exact,
      fast: this.capabilities.fast,
      stable: this.capabilities.stable,
    };
  }

  /**
   * Validate StandardData - new validation logic
   */
  protected validateStandardData(data: StandardData): void {
    if (!data) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Data is required');
    }

    if (!data.type || !['binomial', 'user-level'].includes(data.type)) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Data type must be binomial or user-level');
    }

    if (!data.n || data.n <= 0) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Sample size (n) must be positive');
    }

    // Additional validation based on data type
    if (data.type === 'binomial') {
      if (!data.binomial) {
        throw new TycheError(ErrorCode.INVALID_DATA, 'Binomial data required for binomial type');
      }
      const { successes, trials } = data.binomial;
      if (successes < 0 || trials < 0 || successes > trials) {
        throw new TycheError(
          ErrorCode.INVALID_DATA,
          'Invalid binomial data: successes must be non-negative and not exceed trials'
        );
      }
    }

    if (data.type === 'user-level') {
      if (!data.userLevel || !data.userLevel.users) {
        throw new TycheError(
          ErrorCode.INVALID_DATA,
          'User-level data required for user-level type'
        );
      }
      if (data.userLevel.users.length === 0) {
        throw new TycheError(ErrorCode.INSUFFICIENT_DATA, 'User-level data cannot be empty');
      }
    }
  }

  /**
   * Measure runtime of an async operation
   */
  protected async measureRuntime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; runtime: number }> {
    const start = performance.now();
    const result = await operation();
    const runtime = performance.now() - start;
    return { result, runtime };
  }
}
