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
  constructor(
    public readonly frequency: Posterior,
    public readonly severity: Posterior
  ) {}
  
  /**
   * Mean returns [conversion_rate, mean_value_given_conversion, value_per_user]
   */
  mean(): number[] {
    const convRate = this.frequency.mean()[0];
    const meanValue = this.severity.mean()[0];
    const valuePerUser = convRate * meanValue;
    return [convRate, meanValue, valuePerUser];
  }
  
  /**
   * Variance is more complex for compound models
   * Returns variances for [conversion_rate, mean_value, value_per_user]
   */
  variance(): number[] {
    const convVar = this.frequency.variance()[0];
    const valueVar = this.severity.variance()[0];
    
    const convMean = this.frequency.mean()[0];
    const valueMean = this.severity.mean()[0];
    
    // Var(XY) ≈ E[X]²Var(Y) + E[Y]²Var(X) + Var(X)Var(Y)
    // This is approximate - exact would require full joint distribution
    const perUserVar = 
      convMean * convMean * valueVar +
      valueMean * valueMean * convVar +
      convVar * valueVar;
    
    return [convVar, valueVar, perUserVar];
  }
  
  /**
   * Sample from the compound distribution
   */
  sample(): number[] {
    const convSample = this.frequency.sample()[0];
    const valueSample = this.severity.sample()[0];
    
    // For a single user: did they convert? If so, what value?
    const converted = Math.random() < convSample;
    const value = converted ? valueSample : 0;
    
    return [convSample, valueSample, value];
  }
  
  /**
   * Credible intervals for compound metrics
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Get intervals for components
    const convCI = this.frequency.credibleInterval(level)[0];
    const valueCI = this.severity.credibleInterval(level)[0];
    
    // For value per user, we need to sample the joint distribution
    // This is approximate - better would be to track samples
    const samples: number[] = [];
    for (let i = 0; i < 10000; i++) {
      const c = this.frequency.sample()[0];
      const v = this.severity.sample()[0];
      samples.push(c * v);
    }
    
    samples.sort((a, b) => a - b);
    const alpha = (1 - level) / 2;
    const lowerIdx = Math.floor(alpha * samples.length);
    const upperIdx = Math.floor((1 - alpha) * samples.length);
    
    return [
      convCI,
      valueCI,
      [samples[lowerIdx], samples[upperIdx]]
    ];
  }
  
  /**
   * Expected value per user (conversion rate × mean value)
   */
  expectedValuePerUser(): number {
    return this.mean()[2]; // Third element is value per user
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