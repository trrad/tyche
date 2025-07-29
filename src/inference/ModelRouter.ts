// src/inference/ModelRouter.ts
import { DataInput, CompoundDataInput, BinomialData, UserData } from './base/types';
import { ModelType } from './InferenceEngine';

export interface DataFormat {
  type: 'binomial' | 'continuous' | 'compound';
  hasZeros: boolean;
  isAllPositive: boolean;
  isBinary: boolean;
}

export interface ModelRouteResult {
  recommendedModel: ModelType;
  dataFormat: DataFormat;
  modelParams?: {
    numComponents?: number;
    [key: string]: any;
  };
  confidence: number;
  reasoning: string[];
  alternatives?: Array<{
    model: ModelType;
    reason: string;
  }>;
}

/**
 * Smart model router that detects data format and selects optimal models
 */
export class ModelRouter {
  
  /**
   * Main routing function - detects format and selects best model
   */
  static async route(
    data: DataInput | CompoundDataInput,
    options?: {
      maxComponents?: number;
      preferSimple?: boolean;
      businessContext?: 'revenue' | 'conversion' | 'engagement' | 'other';
    }
  ): Promise<ModelRouteResult> {
    // First, detect the data format
    const format = this.detectDataFormat(data);
    
    // Route based on format
    switch (format.type) {
      case 'binomial':
        return this.routeBinomial(data as DataInput, format);
        
      case 'continuous':
        return this.routeContinuous(data as DataInput, format, options);
        
      case 'compound':
        return this.routeCompound(data as CompoundDataInput, format, options);
        
      default:
        throw new Error(`Unknown data format: ${format.type}`);
    }
  }
  
  /**
   * Detect the fundamental data format
   */
  private static detectDataFormat(data: DataInput | CompoundDataInput): DataFormat {
    // Check if it's compound data (user-level with conversion + value)
    if ('data' in data && Array.isArray(data.data) && data.data.length > 0) {
      const firstItem = data.data[0];
      
      // Compound format: { converted: boolean, value: number }
      if (typeof firstItem === 'object' && 'converted' in firstItem && 'value' in firstItem) {
        const userData = data.data as UserData[];
        const hasZeros = userData.some(u => !u.converted || u.value === 0);
        const isAllPositive = userData.every(u => u.value >= 0);
        
        return {
          type: 'compound',
          hasZeros,
          isAllPositive,
          isBinary: false
        };
      }
      
      // Array of numbers
      if (typeof firstItem === 'number') {
        const values = data.data as number[];
        const isBinary = values.every(x => x === 0 || x === 1);
        const hasZeros = values.some(x => x === 0);
        const isAllPositive = values.every(x => x >= 0);
        
        return {
          type: isBinary ? 'binomial' : 'continuous',
          hasZeros,
          isAllPositive,
          isBinary
        };
      }
    }
    
    // Binomial summary data: { successes: number, trials: number }
    if ('data' in data && typeof data.data === 'object' && 
        'successes' in data.data && 'trials' in data.data) {
      return {
        type: 'binomial',
        hasZeros: (data.data as BinomialData).successes === 0,
        isAllPositive: true,
        isBinary: true
      };
    }
    
    throw new Error('Unable to detect data format');
  }
  
  /**
   * Route binomial data (always beta-binomial)
   */
  private static routeBinomial(data: DataInput, format: DataFormat): ModelRouteResult {
    return {
      recommendedModel: 'beta-binomial',
      dataFormat: format,
      confidence: 1.0,
      reasoning: ['Binary outcome data always uses Beta-Binomial conjugate model']
    };
  }
  
  /**
   * Route continuous data with smart model selection
   */
  private static async routeContinuous(
    data: DataInput,
    format: DataFormat,
    options?: { maxComponents?: number; preferSimple?: boolean; businessContext?: string }
  ): Promise<ModelRouteResult> {
    const values = data.data as number[];
    const stats = this.computeDataStatistics(values);
    const reasoning: string[] = [];
    
    // For negative values, must use normal-based models
    if (!format.isAllPositive) {
      const multimodal = await this.testMultimodality(values);
      
      // For larger datasets, be more aggressive about detecting structure
      const shouldPreferMixture = values.length > 150;
      
      if (multimodal.isMultimodal || shouldPreferMixture) {
        const reason = multimodal.isMultimodal ? 
          `Data contains negative values and shows multiple modes` :
          `Large dataset with negative values - using mixture to capture potential structure`;
        reasoning.push(reason);
        return {
          recommendedModel: 'normal-mixture',
          dataFormat: format,
          modelParams: { numComponents: 2 },
          confidence: multimodal.isMultimodal ? multimodal.confidence : 0.6,
          reasoning
        };
      }
      
      reasoning.push('Data contains negative values, using Normal Mixture model');
      return {
        recommendedModel: 'normal-mixture',
        dataFormat: format,
        modelParams: { numComponents: 1 },
        confidence: 0.9,
        reasoning
      };
    }
    
    // For positive-only data, prefer LogNormal for business metrics
    const shouldUseLogNormal = this.shouldUseLogNormal(stats, options?.businessContext);
    
    if (shouldUseLogNormal) {
      // Check for multimodality in log-space
      const logValues = values.map(v => Math.log(v));
      const multimodal = await this.testMultimodality(logValues);
      
      // Also check for multimodality in original space for large datasets
      const multimodalOriginal = values.length > 200 ? 
        await this.testMultimodality(values) : 
        { isMultimodal: false, confidence: 0 };
      
      if (multimodal.isMultimodal || multimodalOriginal.isMultimodal) {
        const bestConfidence = Math.max(multimodal.confidence, multimodalOriginal.confidence);
        reasoning.push(`Heavy-tailed data with multiple components detected`);
        return {
          recommendedModel: 'lognormal-mixture',
          dataFormat: format,
          modelParams: { numComponents: 2 },
          confidence: bestConfidence,
          reasoning
        };
      }
      
      reasoning.push(`Heavy-tailed positive data (CV=${stats.cv.toFixed(2)}), using LogNormal`);
      return {
        recommendedModel: 'lognormal',
        dataFormat: format,
        confidence: 0.85,
        reasoning
      };
    }
    
    // For moderate variability, still prefer LogNormal over Gamma
    if (stats.cv < 0.5 && stats.skewness < 2 && options?.businessContext !== 'revenue') {
      reasoning.push('Moderate variability positive data, using LogNormal');
      return {
        recommendedModel: 'lognormal',
        dataFormat: format,
        confidence: 0.8,
        reasoning
      };
    }
    
    // Default to lognormal for positive data
    reasoning.push('Positive continuous data, defaulting to LogNormal');
    return {
      recommendedModel: 'lognormal',
      dataFormat: format,
      confidence: 0.75,
      reasoning
    };
  }
  
  /**
   * Route compound data (conversion + value)
   */
  private static async routeCompound(
    data: CompoundDataInput,
    format: DataFormat,
    options?: { maxComponents?: number; businessContext?: string }
  ): Promise<ModelRouteResult> {
    const userData = data.data as UserData[];
    const reasoning: string[] = [];
    
    // Extract revenue values for converters
    const revenueValues = userData
      .filter(u => u.converted && u.value > 0)
      .map(u => u.value);
    
    if (revenueValues.length === 0) {
      reasoning.push('No positive revenue values found, using simple Beta-LogNormal compound');
      return {
        recommendedModel: 'compound-beta-lognormal',
        dataFormat: format,
        confidence: 0.9,
        reasoning
      };
    }
    
    // Analyze revenue distribution
    const stats = this.computeDataStatistics(revenueValues);
    
    // Check for multimodality in revenue (customer segments)
    const logValues = revenueValues.map(v => Math.log(v));
    const multimodal = await this.testMultimodality(logValues);
    
    // For business data, be more aggressive about detecting segments
    const businessContext = options?.businessContext || 'revenue';
    const shouldPreferMixture = businessContext === 'revenue' && revenueValues.length > 100;
    
    if (multimodal.isMultimodal || shouldPreferMixture) {
      const reason = multimodal.isMultimodal ? 
        `Revenue shows distinct customer segments` : 
        `Large revenue dataset - using mixture to capture potential segments`;
      reasoning.push(reason);
      return {
        recommendedModel: 'compound-beta-lognormalmixture',
        dataFormat: format,
        modelParams: { numComponents: 2 },
        confidence: multimodal.isMultimodal ? multimodal.confidence : 0.6,
        reasoning
      };
    }
    
    // Single mode revenue - prefer LogNormal for business data
    reasoning.push('Revenue data, using Beta-LogNormal compound');
    return {
      recommendedModel: 'compound-beta-lognormal',
      dataFormat: format,
      confidence: 0.85,
      reasoning
    };
  }
  
  /**
   * Compute comprehensive statistics for model selection
   */
  private static computeDataStatistics(values: number[]) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / (n - 1);
    const std = Math.sqrt(variance);
    const cv = std / mean;
    
    // Skewness
    const skewness = values.reduce((a, x) => a + Math.pow((x - mean) / std, 3), 0) / n;
    
    // Kurtosis
    const kurtosis = values.reduce((a, x) => a + Math.pow((x - mean) / std, 4), 0) / n - 3;
    
    // Percentiles for tail analysis
    const sorted = [...values].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(0.95 * n)];
    const p50 = sorted[Math.floor(0.50 * n)];
    const tailRatio = p95 / p50;
    
    return { n, mean, variance, std, cv, skewness, kurtosis, tailRatio };
  }
  
  /**
   * Determine if LogNormal is preferred over Gamma
   */
  private static shouldUseLogNormal(
    stats: ReturnType<typeof ModelRouter.computeDataStatistics>,
    businessContext?: string
  ): boolean {
    // Always use LogNormal for revenue
    if (businessContext === 'revenue') return true;
    
    // High CV suggests heavy tails -> LogNormal
    if (stats.cv > 1.0) return true;
    
    // High skewness suggests LogNormal
    if (stats.skewness > 3) return true;
    
    // Large tail ratio suggests heavy tails
    if (stats.tailRatio > 5) return true;
    
    // Default to false (use Gamma)
    return false;
  }
  
  /**
   * Test for multimodality using multiple heuristics
   */
  private static async testMultimodality(values: number[]): Promise<{
    isMultimodal: boolean;
    confidence: number;
  }> {
    const stats = this.computeDataStatistics(values);
    
    // Multiple detection methods for better sensitivity
    
    // 1. Bimodality coefficient (relaxed threshold)
    const bimodalityCoefficient = (stats.skewness ** 2 + 1) / 
      (stats.kurtosis + 3 * ((values.length - 1) ** 2) / ((values.length - 2) * (values.length - 3)));
    
    // 2. Kurtosis-based detection (high kurtosis suggests multiple modes)
    const highKurtosis = stats.kurtosis > 2;
    
    // 3. Percentile-based detection (large gaps suggest multiple modes)
    const sorted = [...values].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(0.25 * values.length)];
    const p75 = sorted[Math.floor(0.75 * values.length)];
    const p50 = sorted[Math.floor(0.50 * values.length)];
    
    // Check for gaps in the distribution
    const gap1 = Math.abs(p25 - p50);
    const gap2 = Math.abs(p75 - p50);
    const meanGap = (gap1 + gap2) / 2;
    const hasGaps = meanGap > stats.std * 0.5; // Gap larger than half std
    
    // 4. Sample size heuristic (larger samples can detect subtler structure)
    const sampleSizeBonus = Math.min(0.2, values.length / 1000); // Up to 0.2 bonus for large samples
    
    // Combine evidence
    let evidence = 0;
    let confidence = 0.5; // Base confidence
    
    if (bimodalityCoefficient > 0.4) { // Relaxed from 0.555
      evidence += 1;
      confidence += 0.2;
    }
    
    if (highKurtosis) {
      evidence += 1;
      confidence += 0.15;
    }
    
    if (hasGaps) {
      evidence += 1;
      confidence += 0.15;
    }
    
    // Add sample size bonus
    confidence += sampleSizeBonus;
    
    // Require at least 2 pieces of evidence for multimodality
    const isMultimodal = evidence >= 2;
    
    // Cap confidence
    confidence = Math.min(0.9, confidence);
    
    return { isMultimodal, confidence };
  }
} 