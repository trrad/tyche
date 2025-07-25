/**
 * Compound Model Architecture
 * 
 * Separates frequency (conversion) from severity (value given conversion)
 * for clearer business insights and better statistical modeling.
 * 
 * This replaces zero-inflated models with a more interpretable approach.
 */

import { InferenceEngine } from '../../inference/InferenceEngine';
import type { ModelType } from '../../inference/InferenceEngine';
import { 
  DataInput, 
  FitOptions, 
  InferenceResult,
  Posterior
} from '../../inference/base/types';

/**
 * User data for compound models
 */
export interface UserData {
  converted: boolean;
  value: number;
}

/**
 * Compound model results with business metrics
 */
export interface CompoundPosterior extends Posterior {
  /** Frequency (conversion) posterior */
  frequency: Posterior;
  /** Severity (value | converted) posterior */
  severity: Posterior;
  /** Get expected value per user */
  expectedValuePerUser(): number;
}

/**
 * Implementation of compound posterior
 */
class CompoundPosteriorImpl implements CompoundPosterior {
  private _cachedStats?: { mean: number[]; variance: number[] };
  private readonly MC_SAMPLES = 10000; // Cheap in browser!
  
  constructor(
    public readonly frequency: Posterior,
    public readonly severity: Posterior
  ) {}
  
  /**
   * Compute statistics via Monte Carlo to handle any correlation structure
   */
  private computeStats(): { mean: number[]; variance: number[] } {
    if (this._cachedStats) return this._cachedStats;
    
    // Monte Carlo samples
    const samples = {
      convRate: [] as number[],
      valueGivenConv: [] as number[],
      revenuePerUser: [] as number[]
    };
    
    for (let i = 0; i < this.MC_SAMPLES; i++) {
      // Sample from posteriors
      const p = this.frequency.sample()[0];
      const v = this.severity.sample()[0];
      
      // Revenue per user = p * v
      const revenue = p * v;
      
      samples.convRate.push(p);
      samples.valueGivenConv.push(v);
      samples.revenuePerUser.push(revenue);
    }
    
    // Compute means
    const mean = [
      samples.convRate.reduce((a, b) => a + b) / this.MC_SAMPLES,
      samples.valueGivenConv.reduce((a, b) => a + b) / this.MC_SAMPLES,
      samples.revenuePerUser.reduce((a, b) => a + b) / this.MC_SAMPLES
    ];
    
    // Compute variances
    const variance = [
      this.computeVariance(samples.convRate, mean[0]),
      this.computeVariance(samples.valueGivenConv, mean[1]),
      this.computeVariance(samples.revenuePerUser, mean[2])
    ];
    
    this._cachedStats = { mean, variance };
    return this._cachedStats;
  }
  
  private computeVariance(samples: number[], mean: number): number {
    const sumSq = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0);
    return sumSq / (samples.length - 1);
  }
  
  mean(): number[] {
    return this.computeStats().mean;
  }
  
  variance(): number[] {
    return this.computeStats().variance;
  }
  
  /**
   * Sample from the compound distribution
   * This naturally handles any dependence structure
   */
  sample(): number[] {
    const convRate = this.frequency.sample()[0];
    const valueGivenConv = this.severity.sample()[0];
    const revenuePerUser = convRate * valueGivenConv;
    
    return [convRate, valueGivenConv, revenuePerUser];
  }
  
  /**
   * Get credible intervals via Monte Carlo
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    
    // Generate samples for each quantity
    const samples = {
      convRate: [] as number[],
      valueGivenConv: [] as number[],
      revenuePerUser: [] as number[]
    };
    
    for (let i = 0; i < this.MC_SAMPLES; i++) {
      const [p, v, r] = this.sample();
      samples.convRate.push(p);
      samples.valueGivenConv.push(v);
      samples.revenuePerUser.push(r);
    }
    
    // Sort and extract quantiles
    const getCI = (data: number[]): [number, number] => {
      data.sort((a, b) => a - b);
      const lower = data[Math.floor(alpha * data.length)];
      const upper = data[Math.floor((1 - alpha) * data.length)];
      return [lower, upper];
    };
    
    return [
      getCI(samples.convRate),
      getCI(samples.valueGivenConv),
      getCI(samples.revenuePerUser)
    ];
  }
  
  /**
   * Expected value per user (business metric)
   */
  expectedValuePerUser(): number {
    return this.mean()[2]; // Already computed via MC
  }
}

/**
 * Base class for compound models
 * 
 * @template TFreq - Type of frequency model (e.g., 'beta-binomial')
 * @template TSev - Type of severity model (e.g., 'gamma', 'lognormal')
 */
export abstract class CompoundModel<
  TFreq extends ModelType = ModelType,
  TSev extends ModelType = ModelType
> {
  constructor(
    protected readonly frequencyModel: TFreq,
    protected readonly severityModel: TSev,
    protected readonly inferenceEngine: InferenceEngine
  ) {}
  
  /**
   * Fit the compound model to user data
   */
  async fit(
    data: UserData[],
    options?: {
      frequencyOptions?: FitOptions;
      severityOptions?: FitOptions;
    }
  ): Promise<CompoundPosterior> {
    // Separate frequency and severity data
    const { frequencyData, severityData } = this.separateData(data);
    
    // Fit frequency model (conversion)
    const frequencyResult = await this.inferenceEngine.fit(
      this.frequencyModel,
      frequencyData,
      options?.frequencyOptions
    );
    
    // Fit severity model (value | converted)
    const severityResult = await this.inferenceEngine.fit(
      this.severityModel,
      severityData,
      options?.severityOptions
    );
    
    // Combine into compound posterior
    return new CompoundPosteriorImpl(
      frequencyResult.posterior,
      severityResult.posterior
    );
  }
  
  /**
   * Separate user data into frequency and severity components
   */
  protected separateData(data: UserData[]): {
    frequencyData: DataInput;
    severityData: DataInput;
  } {
    // Frequency: binary conversion data
    const conversions = data.filter(u => u.converted).length;
    const trials = data.length;
    
    const frequencyData: DataInput = {
      data: { successes: conversions, trials }
    };
    
    // Severity: values for converted users only
    const convertedValues = data
      .filter(u => u.converted && u.value > 0)
      .map(u => u.value);
    
    const severityData: DataInput = {
      data: convertedValues
    };
    
    return { frequencyData, severityData };
  }
  
  /**
   * Get a description of the compound model
   */
  getDescription(): string {
    return `Compound model: ${this.frequencyModel} (frequency) × ${this.severityModel} (severity)`;
  }
}

/**
 * Concrete implementation: Beta-Binomial × Gamma
 * For conversion rate with positive continuous values
 */
export class BetaGammaCompound extends CompoundModel<'beta-binomial', 'gamma'> {
  constructor(inferenceEngine: InferenceEngine) {
    super('beta-binomial', 'gamma', inferenceEngine);
  }
}

/**
 * Concrete implementation: Beta-Binomial × LogNormal  
 * For conversion rate with heavy-tailed revenue
 */
export class BetaLogNormalCompound extends CompoundModel<'beta-binomial', 'lognormal'> {
  constructor(inferenceEngine: InferenceEngine) {
    super('beta-binomial', 'lognormal', inferenceEngine);
  }
  
  /**
   * Override to handle LogNormal's need for proper Bayesian priors
   */
  protected separateData(data: UserData[]): {
    frequencyData: DataInput;
    severityData: DataInput;
  } {
    const base = super.separateData(data);
    
    // For LogNormal Bayesian, we don't need mixture components
    // The Normal-Inverse-Gamma prior handles uncertainty properly
    return base;
  }
}

/**
 * Factory function for creating compound models
 */
export function createCompoundModel(
  frequencyType: 'beta-binomial',
  severityType: 'gamma' | 'lognormal' | 'normal-mixture',
  inferenceEngine: InferenceEngine
): CompoundModel {
  if (frequencyType === 'beta-binomial' && severityType === 'gamma') {
    return new BetaGammaCompound(inferenceEngine);
  }
  
  if (frequencyType === 'beta-binomial' && severityType === 'lognormal') {
    return new BetaLogNormalCompound(inferenceEngine);
  }
  
  // Generic compound model for other combinations
  return new (class extends CompoundModel {
    constructor() {
      super(frequencyType, severityType, inferenceEngine);
    }
  })();
}