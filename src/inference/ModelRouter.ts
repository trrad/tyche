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
      engine?: any; // InferenceEngine instance for WAIC computation
      useWAIC?: boolean; // Enable WAIC-based selection (default: true)
    }
  ): Promise<ModelRouteResult> {
    // First, detect the data format
    const format = this.detectDataFormat(data);
    
    // Route based on format
    switch (format.type) {
      case 'binomial':
        return this.routeBinomial(data as DataInput, format);
        
      case 'continuous':
        return this.routeContinuousWAIC(data as DataInput, format, options);
        
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
   * Route continuous data using WAIC-based model selection
   */
  private static async routeContinuousWAIC(
    data: DataInput,
    format: DataFormat,
    options?: { 
      maxComponents?: number; 
      preferSimple?: boolean; 
      businessContext?: string;
      engine?: any;
      useWAIC?: boolean;
    }
  ): Promise<ModelRouteResult> {
    const values = data.data as number[];
    const reasoning: string[] = [];
    
    // Use WAIC-based selection if engine is available and data is sufficient
    if (options?.engine && options?.useWAIC !== false && values.length >= 10) {
      try {
        reasoning.push('Using WAIC to select optimal model and components');
        
        // Define candidate models based on data characteristics
        const candidates = await this.generateAndFitCandidates(values, 'normal-mixture', options);
        
        // Compare models using WAIC
        const { ModelSelectionCriteria } = await import('./ModelSelectionCriteriaSimple');
        const comparison = await ModelSelectionCriteria.compareModels(candidates, values);
        
        // Select best model
        const bestModel = comparison[0];
        const modelInfo = this.parseModelName(bestModel.name);
        
        reasoning.push(`WAIC selected ${bestModel.name} (ΔWAIC=0, weight=${(bestModel.weight * 100).toFixed(1)}%)`);
        
        return {
          recommendedModel: modelInfo.type as any,
          dataFormat: format,
          modelParams: {
            numComponents: modelInfo.components,
            waicComparison: comparison.map(c => ({
              name: c.name,
              waic: c.waic,
              deltaWAIC: c.deltaWAIC,
              weight: c.weight
            }))
          },
          confidence: 0.9, // High confidence with WAIC
          reasoning,
          alternatives: comparison.slice(1).map(c => ({
            model: this.parseModelName(c.name).type as any,
            reason: `${c.name} also viable (ΔWAIC=${c.deltaWAIC.toFixed(1)})`
          }))
        };
      } catch (e) {
        console.warn('WAIC-based selection failed, falling back to heuristics:', e);
        reasoning.push('WAIC computation failed, using heuristic fallback');
      }
    } else if (values.length < 10) {
      reasoning.push('Data too small for WAIC, using heuristic fallback');
    }
    
    // Fallback to simplified heuristics
    return this.routeContinuousHeuristic(data, format, options, reasoning);
  }

  /**
   * Generate and fit candidate models for WAIC comparison
   */
  private static async generateAndFitCandidates(
    values: number[],
    modelType: ModelType,
    options: any
  ): Promise<Array<{ name: string; posterior: any; modelType: string }>> {
    console.log('🔍 [ModelRouter Debug] generateAndFitCandidates called');
    console.log('🔍 [ModelRouter Debug] Model type:', modelType);
    console.log('🔍 [ModelRouter Debug] Data length:', values.length);
    console.log('🔍 [ModelRouter Debug] Data sample:', values.slice(0, 10));
    console.log('🔍 [ModelRouter Debug] Data stats:', {
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      hasNaN: values.some(x => isNaN(x)),
      hasInf: values.some(x => !isFinite(x)),
      hasNegative: values.some(x => x < 0)
    });

    const candidates: Array<{ name: string; posterior: any; modelType: string }> = [];
    const maxComponents = options?.maxComponents || 4;
    const businessContext = options?.businessContext;
    
    // Check if data has negative values - if so, avoid LogNormal models
    const hasNegativeValues = values.some(v => v < 0);
    
    if (hasNegativeValues) {
      console.log('ModelRouter: Detected negative values in data, excluding LogNormal models');
    }
    
    // Only include LogNormal models if data is all positive
    if (!hasNegativeValues) {
      candidates.push({ name: 'LogNormal', posterior: null, modelType: 'lognormal' });
    }
    
    // Check if data might be multimodal before adding mixture models
    const stats = this.computeDataStatistics(values);
    const isLikelyMultimodal = this.isLikelyMultimodal(values, stats);
    
    if (isLikelyMultimodal || values.length > 100) {
      // Add mixture models with different component counts (2+ only)
      for (let k = 2; k <= maxComponents; k++) {
        candidates.push({ 
          name: `Normal Mixture (${k})`, 
          posterior: null, 
          modelType: 'normal-mixture' 
        });
        
        // Add LogNormal mixtures only if data is all positive
        if (!hasNegativeValues && (businessContext === 'revenue' || businessContext === 'other')) {
          candidates.push({ 
            name: `LogNormal Mixture (${k})`, 
            posterior: null, 
            modelType: 'lognormal-mixture' 
          });
        }
      }
    }
    
    // Fit all candidates
    const fittedCandidates = [];
    for (const candidate of candidates) {
      try {
        const dataInput: any = { data: values };
        if (candidate.modelType.includes('mixture')) {
          const components = candidate.name.match(/\((\d+)\)/)?.[1];
          if (components) {
            dataInput.config = { numComponents: parseInt(components) };
          }
        }
        
        const result = await options.engine.fit(candidate.modelType, dataInput, { useWAIC: false });
        fittedCandidates.push({
          ...candidate,
          posterior: result.posterior
        });
      } catch (e) {
        console.warn(`Failed to fit ${candidate.name}:`, e);
        // Skip failed models
      }
    }
    
    return fittedCandidates;
  }

  /**
   * Quick check if data is likely multimodal
   */
  private static isLikelyMultimodal(values: number[], stats: any): boolean {
    // High kurtosis suggests multiple modes
    if (stats.kurtosis > 2) return true;
    
    // High coefficient of variation suggests heavy tails
    if (stats.cv > 0.8) return true;
    
    // Check for gaps in the data
    const sorted = [...values].sort((a, b) => a - b);
    const n = values.length;
    const p25 = sorted[Math.floor(0.25 * n)];
    const p75 = sorted[Math.floor(0.75 * n)];
    const p50 = sorted[Math.floor(0.50 * n)];
    const gap1 = Math.abs(p25 - p50);
    const gap2 = Math.abs(p75 - p50);
    const meanGap = (gap1 + gap2) / 2;
    const hasGaps = meanGap > stats.std * 0.5;
    
    // For very small datasets, be more conservative
    if (n < 20) {
      return false; // Don't assume multimodality for small datasets
    }
    
    return hasGaps;
  }

  /**
   * Parse model name to extract type and components
   */
  private static parseModelName(name: string): { type: string; components?: number } {
    if (name === 'LogNormal') return { type: 'lognormal' };
    
    const match = name.match(/(.+) Mixture \((\d+)\)/);
    if (match) {
      const baseType = match[1].toLowerCase();
      const components = parseInt(match[2]);
      
      // Map to correct model types
      if (baseType === 'normal') {
        return { type: 'normal-mixture', components };
      } else if (baseType === 'lognormal') {
        return { type: 'lognormal-mixture', components };
      }
    }
    
    return { type: 'lognormal' }; // Default fallback
  }

  /**
   * Simplified heuristic fallback for continuous data
   */
  private static async routeContinuousHeuristic(
    data: DataInput,
    format: DataFormat,
    options?: any,
    existingReasoning: string[] = []
  ): Promise<ModelRouteResult> {
    const values = data.data as number[];
    const reasoning = [...existingReasoning];
    
    // For negative values, must use normal-based models
    if (!format.isAllPositive) {
      reasoning.push('Data contains negative values, using Normal Mixture');
      return {
        recommendedModel: 'normal-mixture',
        dataFormat: format,
        modelParams: { numComponents: 2 },
        confidence: 0.7,
        reasoning
      };
    }
    
    // For positive data, use LogNormal by default
    reasoning.push('Positive continuous data, using LogNormal');
    return {
      recommendedModel: 'lognormal',
      dataFormat: format,
      confidence: 0.8,
      reasoning
    };
  }
  
  /**
   * Route compound data using WAIC-based model selection
   */
  private static async routeCompound(
    data: CompoundDataInput,
    format: DataFormat,
    options?: { 
      maxComponents?: number; 
      businessContext?: string;
      engine?: any;
      useWAIC?: boolean;
    }
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
    
    // Use WAIC-based selection if engine is available and data is sufficient
    if (options?.engine && options?.useWAIC !== false && userData.length >= 20) {
      try {
        reasoning.push('Using WAIC to select optimal compound model');
        
        // Define candidate compound models
        const candidates = await this.generateCompoundCandidates(userData, options);
        
        // Compare models using WAIC
        const { ModelSelectionCriteria } = await import('./ModelSelectionCriteriaSimple');
        const comparison = await ModelSelectionCriteria.compareModels(candidates, userData);
        
        // Select best model
        const bestModel = comparison[0];
        const modelInfo = this.parseCompoundModelName(bestModel.name);
        
        reasoning.push(`WAIC selected ${bestModel.name} (ΔWAIC=0, weight=${(bestModel.weight * 100).toFixed(1)}%)`);
        
        return {
          recommendedModel: modelInfo.type as any,
          dataFormat: format,
          modelParams: {
            numComponents: modelInfo.components,
            waicComparison: comparison.map(c => ({
              name: c.name,
              waic: c.waic,
              deltaWAIC: c.deltaWAIC,
              weight: c.weight
            }))
          },
          confidence: 0.9,
          reasoning,
          alternatives: comparison.slice(1).map(c => ({
            model: this.parseCompoundModelName(c.name).type as any,
            reason: `${c.name} also viable (ΔWAIC=${c.deltaWAIC.toFixed(1)})`
          }))
        };
      } catch (e) {
        console.warn('WAIC-based compound selection failed, falling back to heuristics:', e);
        reasoning.push('WAIC computation failed, using heuristic fallback');
      }
    } else if (userData.length < 20) {
      reasoning.push('Data too small for WAIC, using heuristic fallback');
    }
    
    // Fallback to heuristic selection
    return this.routeCompoundHeuristic(data, format, options, reasoning);
  }

  /**
   * Generate and fit candidate compound models for WAIC comparison
   */
  private static async generateCompoundCandidates(
    userData: UserData[],
    options: any
  ): Promise<Array<{ name: string; posterior: any; modelType: string }>> {
    console.log('🔍 [ModelRouter Debug] generateCompoundCandidates called');
    console.log('🔍 [ModelRouter Debug] User data length:', userData.length);
    console.log('🔍 [ModelRouter Debug] User data sample:', userData.slice(0, 3));
    
    const candidates: Array<{ name: string; posterior: any; modelType: string }> = [];
    const maxComponents = options?.maxComponents || 4;
    const engine = options?.engine;
    
    // Always include simple compound models
    candidates.push({ 
      name: 'Beta-LogNormal', 
      posterior: null, 
      modelType: 'compound-beta-lognormal' 
    });
    
    // Check if revenue data might be multimodal
    const revenueValues = userData
      .filter(u => u.converted && u.value > 0)
      .map(u => u.value);
    
    console.log('🔍 [ModelRouter Debug] Revenue values length:', revenueValues.length);
    console.log('🔍 [ModelRouter Debug] Revenue values sample:', revenueValues.slice(0, 5));
    console.log('🔍 [ModelRouter Debug] Revenue stats:', {
      min: Math.min(...revenueValues),
      max: Math.max(...revenueValues),
      mean: revenueValues.reduce((a, b) => a + b, 0) / revenueValues.length,
      hasNaN: revenueValues.some(x => isNaN(x)),
      hasInf: revenueValues.some(x => !isFinite(x)),
      hasNegative: revenueValues.some(x => x < 0)
    });
    
    if (revenueValues.length > 0) {
      const stats = this.computeDataStatistics(revenueValues);
      const isLikelyMultimodal = this.isLikelyMultimodal(revenueValues, stats);
      
      console.log('🔍 [ModelRouter Debug] Is likely multimodal:', isLikelyMultimodal);
      console.log('🔍 [ModelRouter Debug] Revenue values length > 50:', revenueValues.length > 50);
      
      if (isLikelyMultimodal || revenueValues.length > 50) {
        // Add mixture compound models
        for (let k = 2; k <= maxComponents; k++) {
          candidates.push({ 
            name: `Beta-LogNormal Mixture (${k})`, 
            posterior: null, 
            modelType: 'compound-beta-lognormalmixture' 
          });
        }
      }
    }
    
    console.log('🔍 [ModelRouter Debug] Generated candidates:', candidates.length);
    console.log('🔍 [ModelRouter Debug] Candidates:', candidates.map(c => ({ name: c.name, modelType: c.modelType })));
    
    // Fit all candidates
    const fittedCandidates = [];
    for (const candidate of candidates) {
      try {
        console.log(`🔍 [ModelRouter Debug] Fitting candidate: ${candidate.name}`);
        const dataInput: any = { data: userData };
        if (candidate.modelType.includes('mixture')) {
          const components = candidate.name.match(/\((\d+)\)/)?.[1];
          if (components) {
            dataInput.config = { numComponents: parseInt(components) };
            console.log(`🔍 [ModelRouter Debug] Mixture config:`, dataInput.config);
          }
        }
        
        const result = await engine.fit(candidate.modelType, dataInput, { useWAIC: false });
        console.log(`🔍 [ModelRouter Debug] Fit successful for ${candidate.name}`);
        fittedCandidates.push({
          ...candidate,
          posterior: result.posterior
        });
      } catch (e) {
        console.error(`🔍 [ModelRouter Debug] Failed to fit ${candidate.name}:`, e);
        // Skip failed models
      }
    }
    
    console.log('🔍 [ModelRouter Debug] Fitted candidates:', fittedCandidates.length);
    return fittedCandidates;
  }

  /**
   * Parse compound model name to extract type and components
   */
  private static parseCompoundModelName(name: string): { type: string; components?: number } {
    if (name === 'Beta-LogNormal') return { type: 'compound-beta-lognormal' };
    
    const match = name.match(/Beta-LogNormal Mixture \((\d+)\)/);
    if (match) {
      return { 
        type: 'compound-beta-lognormalmixture', 
        components: parseInt(match[1]) 
      };
    }
    
    return { type: 'compound-beta-lognormal' }; // Default fallback
  }

  /**
   * Simplified heuristic fallback for compound data
   */
  private static async routeCompoundHeuristic(
    data: CompoundDataInput,
    format: DataFormat,
    options?: any,
    existingReasoning: string[] = []
  ): Promise<ModelRouteResult> {
    const userData = data.data as UserData[];
    const reasoning = [...existingReasoning];
    
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

  /**
   * Generate alternative model suggestions based on WAIC
   */
  private static generateAlternatives(
    selectedModel: ModelType,
    componentSelection: any
  ): Array<{ model: ModelType; reason: string; deltaWAIC?: number }> {
    const alternatives: Array<{ model: ModelType; reason: string; deltaWAIC?: number }> = [];
    
    if (componentSelection.waicComparison && componentSelection.waicComparison.length > 1) {
      // Add other viable component counts
      componentSelection.waicComparison
        .filter((w: any) => w.components !== componentSelection.numComponents && w.deltaWAIC < 10)
        .forEach((w: any) => {
          alternatives.push({
            model: selectedModel,
            reason: `${w.components} components also viable (ΔWAIC=${w.deltaWAIC.toFixed(1)})`,
            deltaWAIC: w.deltaWAIC
          });
        });
    }
    
    return alternatives;
  }

  /**
   * Select optimal components using WAIC when engine is available
   */
  static async selectOptimalComponents(
    values: number[],
    modelType: 'normal-mixture' | 'lognormal-mixture',
    maxComponents: number = 4,
    engine?: any,
    useWAIC: boolean = true
  ): Promise<{
    numComponents: number;
    waicComparison?: Array<{
      components: number;
      waic: number;
      deltaWAIC: number;
      weight: number;
    }>;
    selectionReason: string;
  }> {
    // Quick heuristic if no engine or WAIC disabled
    if (!engine || !useWAIC) {
      const n = values.length;
      const minSamplesPerComponent = 50;
      const maxViableComponents = Math.floor(n / minSamplesPerComponent);
      const heuristicComponents = Math.min(1, maxViableComponents, maxComponents); // Default to 1 for small data
      
      return {
        numComponents: heuristicComponents,
        selectionReason: `Heuristic: ${n} samples supports up to ${maxViableComponents} components`
      };
    }
    
    // WAIC-based selection
    const models: Array<{ 
      components: number; 
      result: any;
      posterior: any;
    }> = [];
    
    // Fit models with different component counts
    for (let k = 1; k <= maxComponents; k++) {
      try {
        const result = await engine.fit(modelType, {
          data: values,
          config: { numComponents: k }
        });
        
        models.push({
          components: k,
          result,
          posterior: result.posterior
        });
      } catch (e) {
        console.warn(`Failed to fit ${k} components:`, e);
        break;
      }
    }
    
    if (models.length === 0) {
      return {
        numComponents: 1,
        selectionReason: 'Failed to fit any models'
      };
    }
    
    // Compare using WAIC
    try {
      const { ModelSelectionCriteria } = await import('./ModelSelectionCriteriaSimple');
      const waicResults = await ModelSelectionCriteria.compareModels(
        models.map(m => ({
          name: `${m.components}`,
          posterior: m.posterior,
          modelType
        })),
        values
      );
      
      // Format for return
      const waicComparison = waicResults.map(r => ({
        components: parseInt(r.name),
        waic: r.waic,
        deltaWAIC: r.deltaWAIC,
        weight: r.weight
      }));
      
      // Select optimal with reasoning
      let optimal = 1;
      let reason = '';
      
      // Prefer simpler models unless complex models are substantially better
      const simplicityThreshold = 4; // WAIC difference threshold
      
      for (const result of waicComparison) {
        if (result.components === 1) {
          if (result.deltaWAIC < simplicityThreshold) {
            optimal = 1;
            reason = `Single component preferred (ΔWAIC=${result.deltaWAIC.toFixed(1)} < ${simplicityThreshold})`;
            break;
          }
        } else if (result.deltaWAIC === 0) {
          optimal = result.components;
          reason = `${result.components} components optimal (lowest WAIC, weight=${(result.weight * 100).toFixed(1)}%)`;
          break;
        }
      }
      
      return {
        numComponents: optimal,
        waicComparison,
        selectionReason: reason
      };
    } catch (e) {
      console.warn('WAIC computation failed, falling back to heuristic:', e);
      // Fall back to heuristic
      const n = values.length;
      const minSamplesPerComponent = 50;
      const maxViableComponents = Math.floor(n / minSamplesPerComponent);
      const heuristicComponents = Math.min(2, maxViableComponents, maxComponents);
      
      return {
        numComponents: heuristicComponents,
        selectionReason: `Heuristic fallback: ${n} samples supports up to ${maxViableComponents} components`
      };
    }
  }
} 