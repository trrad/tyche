// src/models/ConversionValueModel.ts
/**
 * Model for analyzing experiments with binary conversion and continuous values
 * 
 * This model requires individual-level data to properly assess:
 * - Whether effects are driven by conversion rate vs. value changes
 * - If outliers are influencing results
 * - The appropriate value distribution (gamma, exponential, lognormal)
 */

import { 
    RandomVariable, 
    add, 
    multiply, 
    subtract, 
    divide,
    log
  } from '../core/RandomVariable';
  import { ComputationGraph } from '../core/ComputationGraph';
  import { BetaRV, beta } from '../core/distributions/Beta';
  import { GammaRV, gamma } from '../core/distributions/Gamma';
  import { ExponentialRV, exponential } from '../core/distributions/Exponential';
  import { LogNormalRV, logNormal } from '../core/distributions/LogNormal';
  
  /**
   * Individual user data - the atomic unit of analysis
   */
  export interface UserData {
    converted: boolean;
    value: number; // 0 if not converted
    features?: Record<string, any>; // For future HTE analysis
  }
  
  /**
   * Variant data with individual observations
   */
  export interface VariantData {
    name: string;
    users: UserData[];
  }
  
  /**
   * Summary statistics computed from individual data
   */
  export interface VariantSummary {
    name: string;
    trials: number;
    conversions: number;
    totalValue: number;
    values: number[]; // Non-zero values only
    conversionRate: number;
    meanValue: number; // Among converters
    medianValue: number;
    maxValue: number;
    valuePercentiles: {
      p25: number;
      p75: number;
      p90: number;
      p95: number;
      p99: number;
    };
  }
  
  /**
   * Results from model fitting
   */
  export interface ConversionValuePosterior {
    // Posterior samples
    conversionRates: Map<string, number[]>;
    meanValues: Map<string, number[]>; // Among converters
    valuesPerUser: Map<string, number[]>; // Overall metric
    
    // Relative effects
    relativeEffects: Map<string, {
      conversion: number[];
      value: number[];
      overall: number[];
    }>;
    
    // Diagnostics
    outlierInfluence: Map<string, OutlierDiagnostic>;
    effectDrivers: Map<string, EffectDriver>;
  }
  
  export interface OutlierDiagnostic {
    topValueContribution: number; // % of total value from top user
    top5ValueContribution: number; // % from top 5 users
    withoutTopUser: {
      effectSize: number;
      credibleInterval: [number, number];
    };
  }
  
  export interface EffectDriver {
    conversionComponent: number; // % of effect from conversion rate
    valueComponent: number; // % from value changes
    interaction: number; // % from interaction
  }
  
  type ValueDistribution = GammaRV | ExponentialRV | LogNormalRV;
  
  export class ConversionValueModel extends RandomVariable {
    private variants: Map<string, VariantSummary> = new Map();
    private referenceVariant: string | null = null;
    private detectedDistribution: 'gamma' | 'exponential' | 'lognormal' | null = null;
    
    constructor(
      private conversionPrior: BetaRV = beta(1, 1), // Uniform default
      private valuePriorType: 'gamma' | 'exponential' | 'lognormal' | 'auto' = 'gamma',
      private valueLabel: string = 'revenue',
      graph?: ComputationGraph
    ) {
      // Create a node representing the model
      const node = (graph || ComputationGraph.current()).createNode(
        'conversionValueModel',
        [],
        () => 0, // Model itself has no single value
        () => []
      );
      
      super(node, [], graph || ComputationGraph.current());
    }
    
    /**
     * Get the effective distribution type (detected or specified)
     */
    private getEffectiveDistribution(): 'gamma' | 'exponential' | 'lognormal' {
      if (this.valuePriorType === 'auto') {
        // If auto, use detected distribution or default to gamma
        return this.detectedDistribution || 'gamma';
      }
      return this.valuePriorType;
    }
    
    /**
     * Add variant data - requires individual-level data
     */
    addVariant(data: VariantData): void {
      const summary = this.summarizeVariant(data);
      this.variants.set(data.name, summary);
      
      // First variant becomes reference by default
      if (!this.referenceVariant) {
        this.referenceVariant = data.name;
      }
      
      // If using auto detection, detect distribution from all data
      if (this.valuePriorType === 'auto' && summary.values.length > 0) {
        // Combine all values from all variants for detection
        const allValues: number[] = [];
        this.variants.forEach(v => allValues.push(...v.values));
        
        if (allValues.length >= 10) { // Need sufficient data
          this.detectedDistribution = this.detectValueDistribution(allValues);
          console.log(`Auto-detected value distribution: ${this.detectedDistribution}`);
        }
      }
    }
    
    /**
     * Summarize variant data with robust statistics
     */
    private summarizeVariant(data: VariantData): VariantSummary {
      const trials = data.users.length;
      const conversions = data.users.filter(u => u.converted).length;
      const values = data.users
        .filter(u => u.converted && u.value > 0)
        .map(u => u.value)
        .sort((a, b) => a - b);
      
      const totalValue = values.reduce((sum, v) => sum + v, 0);
      
      // Compute percentiles
      const percentile = (p: number): number => {
        if (values.length === 0) return 0;
        const index = Math.ceil(p * values.length) - 1;
        return values[Math.max(0, Math.min(index, values.length - 1))];
      };
      
      return {
        name: data.name,
        trials,
        conversions,
        totalValue,
        values,
        conversionRate: conversions / trials,
        meanValue: values.length > 0 ? totalValue / values.length : 0,
        medianValue: percentile(0.5),
        maxValue: values.length > 0 ? values[values.length - 1] : 0,
        valuePercentiles: {
          p25: percentile(0.25),
          p75: percentile(0.75),
          p90: percentile(0.90),
          p95: percentile(0.95),
          p99: percentile(0.99)
        }
      };
    }
    
    /**
     * Detect appropriate value distribution from data
     */
    detectValueDistribution(values: number[]): 'gamma' | 'exponential' | 'lognormal' {
      if (values.length < 10) return 'gamma'; // Not enough data, use default
      
      // Compute moments
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length;
      const cv = Math.sqrt(variance) / mean; // Coefficient of variation
      
      // Log transform for lognormal check
      const logValues = values.map(v => Math.log(v));
      const logMean = logValues.reduce((a, b) => a + b) / logValues.length;
      const logVar = logValues.reduce((sum, x) => sum + (x - logMean) ** 2, 0) / logValues.length;
      
      // Decision rules based on distribution properties
      if (cv > 2) {
        // Very high skew suggests lognormal
        return 'lognormal';
      } else if (Math.abs(cv - 1) < 0.2) {
        // CV ≈ 1 suggests exponential
        return 'exponential';
      } else {
        // Moderate skew suggests gamma
        return 'gamma';
      }
    }
    
    /**
     * Create appropriate value prior based on data
     */
    private createValuePrior(values: number[]): ValueDistribution {
      const effectiveDist = this.getEffectiveDistribution();
      
      if (values.length === 0) {
        // No data - use weak prior
        switch (effectiveDist) {
          case 'exponential':
            return exponential(0.01); // Weak prior
          case 'lognormal':
            return logNormal(0, 2); // Weak prior
          default:
            return gamma(1, 100); // Weak prior
        }
      }
      
      // Empirical Bayes - use data to inform prior
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / values.length;
      
      switch (effectiveDist) {
        case 'exponential':
          // Rate = 1/mean
          return exponential(1 / mean);
          
        case 'lognormal':
          // Fit to log-transformed data
          const logValues = values.map(v => Math.log(v));
          const logMean = logValues.reduce((a, b) => a + b) / logValues.length;
          const logStd = Math.sqrt(
            logValues.reduce((sum, x) => sum + (x - logMean) ** 2, 0) / logValues.length
          );
          return logNormal(logMean, logStd);
          
        default: // gamma
          // Method of moments
          const shape = mean * mean / variance;
          const scale = variance / mean;
          return gamma(Math.max(0.1, shape), Math.max(0.1, scale));
      }
    }
    
    /**
     * Analyze experiment with full posterior inference
     */
    async analyze(options?: {
      referenceVariant?: string;
      comparisonMethod?: 'control' | 'best_of_rest';
      iterations?: number;
    }): Promise<ConversionValuePosterior> {
      const reference = options?.referenceVariant || this.referenceVariant;
      if (!reference || !this.variants.has(reference)) {
        throw new Error('No reference variant specified');
      }
      
      // For now, return analytical results for beta-binomial part
      // and simulated results for the value component
      const results = await this.runInference(options?.iterations || 5000);
      
      // Add diagnostics
      this.addDiagnostics(results);
      
      return results;
    }
    
    /**
     * Run Bayesian inference
     */
    private async runInference(iterations: number): Promise<ConversionValuePosterior> {
      const conversionRates = new Map<string, number[]>();
      const meanValues = new Map<string, number[]>();
      const valuesPerUser = new Map<string, number[]>();
      const relativeEffects = new Map<string, any>();
      
      // For each variant, compute posteriors
      for (const [name, summary] of this.variants) {
        // Conversion rate posterior (Beta-Binomial conjugacy)
        const conversionPosterior = beta(
          this.conversionPrior.getParameters().alpha.forward() + summary.conversions,
          this.conversionPrior.getParameters().beta.forward() + summary.trials - summary.conversions
        );
        
        // Sample conversion rates
        const conversionSamples = conversionPosterior.sampleMultiple(iterations);
        conversionRates.set(name, conversionSamples);
        
        // Value posterior (using appropriate distribution)
        const valuePrior = this.createValuePrior(summary.values);
        const valueSamples: number[] = [];
        
        // For now, use prior predictive for values
        // TODO: Implement proper posterior for gamma/lognormal with data
        for (let i = 0; i < iterations; i++) {
          valueSamples.push(valuePrior.sample());
        }
        meanValues.set(name, valueSamples);
        
        // Compute value per user (conversion * value)
        const vpuSamples = conversionSamples.map((c, i) => c * valueSamples[i]);
        valuesPerUser.set(name, vpuSamples);
      }
      
      // Compute relative effects vs reference
      const referenceSamples = valuesPerUser.get(this.referenceVariant!)!;
      
      for (const [name, samples] of valuesPerUser) {
        if (name === this.referenceVariant) continue;
        
        const convRef = conversionRates.get(this.referenceVariant!)!;
        const convVar = conversionRates.get(name)!;
        const valRef = meanValues.get(this.referenceVariant!)!;
        const valVar = meanValues.get(name)!;
        
        relativeEffects.set(name, {
          conversion: convVar.map((c, i) => (c - convRef[i]) / convRef[i]),
          value: valVar.map((v, i) => (v - valRef[i]) / valRef[i]),
          overall: samples.map((s, i) => (s - referenceSamples[i]) / referenceSamples[i])
        });
      }
      
      return {
        conversionRates,
        meanValues,
        valuesPerUser,
        relativeEffects,
        outlierInfluence: new Map(),
        effectDrivers: new Map()
      };
    }
    
    /**
     * Add diagnostics about what's driving effects
     */
    private addDiagnostics(results: ConversionValuePosterior): void {
      for (const [name, summary] of this.variants) {
        // Outlier influence
        const sortedValues = [...summary.values].sort((a, b) => b - a);
        const topValue = sortedValues[0] || 0;
        const top5Values = sortedValues.slice(0, 5).reduce((a, b) => a + b, 0);
        
        // Recompute without top user
        const valuesWithoutTop = sortedValues.slice(1);
        const totalWithoutTop = valuesWithoutTop.reduce((a, b) => a + b, 0);
        const meanWithoutTop = valuesWithoutTop.length > 0 
          ? totalWithoutTop / valuesWithoutTop.length 
          : 0;
        
        results.outlierInfluence.set(name, {
          topValueContribution: topValue / summary.totalValue,
          top5ValueContribution: top5Values / summary.totalValue,
          withoutTopUser: {
            effectSize: 0, // TODO: Recompute effect
            credibleInterval: [0, 0]
          }
        });
        
        // Effect drivers (simplified for now)
        if (name !== this.referenceVariant) {
          const refSummary = this.variants.get(this.referenceVariant!)!;
          const conversionLift = (summary.conversionRate - refSummary.conversionRate) / refSummary.conversionRate;
          const valueLift = (summary.meanValue - refSummary.meanValue) / refSummary.meanValue;
          const overallLift = (summary.totalValue / summary.trials - refSummary.totalValue / refSummary.trials) 
            / (refSummary.totalValue / refSummary.trials);
          
          // Decompose effect
          const conversionComponent = Math.abs(conversionLift) / (Math.abs(conversionLift) + Math.abs(valueLift));
          const valueComponent = Math.abs(valueLift) / (Math.abs(conversionLift) + Math.abs(valueLift));
          
          results.effectDrivers.set(name, {
            conversionComponent,
            valueComponent,
            interaction: 0 // Simplified
          });
        }
      }
    }
    
    /**
     * Get summary statistics for reporting
     */
    getSummary(): string {
      const lines: string[] = [`Conversion + ${this.valueLabel} Analysis\n`];
      
      if (this.valuePriorType === 'auto' && this.detectedDistribution) {
        lines.push(`Auto-detected value distribution: ${this.detectedDistribution}\n`);
      }
      
      for (const [name, summary] of this.variants) {
        lines.push(`${name}:`);
        lines.push(`  Trials: ${summary.trials}`);
        lines.push(`  Conversion Rate: ${(summary.conversionRate * 100).toFixed(1)}%`);
        lines.push(`  Mean ${this.valueLabel}: $${summary.meanValue.toFixed(2)}`);
        lines.push(`  Median ${this.valueLabel}: $${summary.medianValue.toFixed(2)}`);
        lines.push(`  Max ${this.valueLabel}: $${summary.maxValue.toFixed(2)}`);
        lines.push(`  ${this.valueLabel}/user: $${(summary.totalValue / summary.trials).toFixed(2)}`);
        lines.push('');
      }
      
      return lines.join('\n');
    }
  }