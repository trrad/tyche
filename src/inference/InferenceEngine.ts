/**
 * Unified inference engine with smart algorithm selection
 * Automatically chooses the best inference method based on data and model type
 */

import { BetaBinomialConjugate } from './exact/BetaBinomial';
import { GammaExponentialConjugate } from './exact/GammaExponential';
import { NormalMixtureEM } from './approximate/em/NormalMixtureEM';
import { LogNormalBayesian } from './exact/LogNormalInference';
import { CompoundPosterior } from '../models/compound/CompoundModel';
import { 
  DataInput, 
  CompoundDataInput,
  FitOptions, 
  InferenceResult,
  BinomialData 
} from './base/types';

export type ModelType = 
  | 'auto'
  | 'beta-binomial' 
  | 'normal-mixture'
  | 'gamma'
  | 'lognormal'
  | 'revenue'  // Smart selection for revenue data
  | 'conversion-value'  // Future: compound model
  | 'compound-revenue';  // Compound model for revenue

/**
 * Main entry point for all inference in Tyche
 * Provides smart routing to appropriate algorithms
 */
export class InferenceEngine {
  private engines = {
    'beta-binomial': new BetaBinomialConjugate(),
    'gamma': new GammaExponentialConjugate(),
    'normal-mixture': new NormalMixtureEM(),
    'lognormal': new LogNormalBayesian(),
  };
  
  /**
   * Fit a model using the appropriate inference algorithm
   * 
   * @param modelType Type of model to fit (or 'auto' for automatic selection)
   * @param data Input data
   * @param options Fitting options
   * @returns Inference result with posterior and diagnostics
   */
  async fit<T extends ModelType>(
    modelType: T,
    data: T extends 'compound-revenue' ? CompoundDataInput : DataInput,
    options?: FitOptions
  ): Promise<T extends 'compound-revenue' 
    ? { posterior: CompoundPosterior; diagnostics: any }
    : InferenceResult> {
    // Auto-detect model type if needed
    if (modelType === 'auto') {
      modelType = this.detectModelType(data) as T;
    }
    
    // Route to appropriate engine
    switch (modelType) {
      case 'beta-binomial':
        return this.engines['beta-binomial'].fit(data as DataInput, options) as any;
        
      case 'gamma':
        return this.engines['gamma'].fit(data as DataInput, options) as any;
        
      case 'normal-mixture':
        return this.engines['normal-mixture'].fit(data as DataInput, options) as any;
        
      case 'lognormal':
        return this.engines['lognormal'].fit(data as DataInput, options) as any;
        
      case 'revenue':
        // Smart selection based on data characteristics
        return this.selectRevenueModel(data as DataInput, options) as any;
        
      case 'compound-revenue':
        // Handle compound models
        return this.fitCompoundModel(data as CompoundDataInput, options) as any;
        
      default:
        throw new Error(`Unknown model type: ${modelType}`);
    }
  }
  
  /**
   * Automatically detect the best model type for the data
   */
  private detectModelType(data: DataInput | CompoundDataInput): ModelType {
    // Check if this is compound data
    if ('data' in data && Array.isArray(data.data) && data.data.length > 0) {
      const firstItem = data.data[0];
      if (typeof firstItem === 'object' && 'converted' in firstItem) {
        return 'compound-revenue';
      }
    }
    
    // Binary data or binomial summary
    if (this.isBinomialData(data as DataInput)) {
      return 'beta-binomial';
    }
    
    // Continuous data
    if (Array.isArray((data as DataInput).data)) {
      const values = (data as DataInput).data as number[];
      
      // Check if all values are 0 or 1
      const isBinary = values.every(x => x === 0 || x === 1);
      if (isBinary) {
        return 'beta-binomial';
      }
      
      // Check if all positive (could be gamma or lognormal)
      const allPositive = values.every(x => x > 0);
      if (allPositive) {
        // Use heuristics to decide between gamma and lognormal
        const cv = this.coefficientOfVariation(values);
        if (cv > 1) {
          return 'lognormal';  // High variability suggests lognormal
        } else {
          return 'gamma';      // Moderate variability suggests gamma
        }
      }
      
      // Default to normal mixture for general continuous data
      return 'normal-mixture';
    }
    
    throw new Error('Could not automatically detect model type');
  }
  
  /**
   * Smart model selection for revenue data
   */
  private async selectRevenueModel(
    data: DataInput, 
    options?: FitOptions
  ): Promise<InferenceResult> {
    if (!Array.isArray(data.data)) {
      throw new Error('Revenue model requires array data');
    }
    
    const values = data.data as number[];
    
    // Check if all values are 0 or 1 (binary data)
    const isBinary = values.every(v => v === 0 || v === 1);
    if (isBinary) {
      // Convert to beta-binomial
      const binomialData = InferenceEngine.binaryToBinomial(values);
      return this.engines['beta-binomial'].fit({ data: binomialData }, options);
    }
    
    // For continuous revenue data, use lognormal
    const cv = this.coefficientOfVariation(values);
    const skewness = this.calculateSkewness(values);
    
    // If high CV or skewness, use mixture model
    if (cv > 1.5 || Math.abs(skewness) > 2) {
      return this.engines['normal-mixture'].fit(data, options);
    }
    
    // Otherwise use lognormal
    return this.engines['lognormal'].fit(data, options);
  }

  /**
   * Fit compound revenue model
   */
  private async fitCompoundModel(
    data: CompoundDataInput,
    options?: FitOptions
  ): Promise<{ posterior: CompoundPosterior; diagnostics: any }> {
    if (!Array.isArray(data.data)) {
      throw new Error('Compound model requires array data');
    }
    
    const startTime = performance.now();
    const userData = data.data; // UserData[]
    
    // Create compound model (default to Beta-Gamma)
    const compoundModel = new (await import('../models/compound/CompoundModel')).BetaGammaCompound(this);
    
    // Fit the compound model
    const compoundPosterior = await compoundModel.fit(userData, {
      frequencyOptions: options,
      severityOptions: options
    });
    
    const runtime = performance.now() - startTime;
    
    return {
      posterior: compoundPosterior,
      diagnostics: {
        converged: true,
        iterations: 1,
        runtime: runtime
      }
    };
  }
  
  /**
   * Calculate coefficient of variation
   */
  private coefficientOfVariation(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
    return Math.sqrt(variance) / mean;
  }
  
  /**
   * Calculate skewness (simplified)
   */
  private calculateSkewness(data: number[]): number {
    const n = data.length;
    const mean = data.reduce((a, b) => a + b, 0) / n;
    const std = Math.sqrt(data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n);
    
    const m3 = data.reduce((sum, x) => sum + Math.pow((x - mean) / std, 3), 0) / n;
    return m3;
  }
  
  /**
   * Check if data is binomial format
   */
  private isBinomialData(data: DataInput): boolean {
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      return 'successes' in data.data && 'trials' in data.data;
    }
    return false;
  }
  
  /**
   * Create standardized data input from various formats
   */
  static createDataInput(
    data: any,
    config?: any
  ): DataInput {
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
    const successes = data.filter(x => x === 1).length;
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
}

// Export convenience functions
export { BetaPosterior } from './exact/BetaBinomial';
export { GammaPosterior } from './exact/GammaExponential';
export { NormalMixturePosterior } from './approximate/em/NormalMixtureEM';
export { LogNormalPosterior, LogNormalBayesian } from './exact/LogNormalInference';