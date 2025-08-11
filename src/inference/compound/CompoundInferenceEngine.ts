/**
 * Compound Inference Engine
 *
 * Handles zero-inflated models by decomposing into:
 * - Frequency model: Beta distribution for conversion probability
 * - Value model: Distribution for positive values (when converted)
 *
 * Following the pattern from InterfaceStandards.md and ImplementationRoadmap.md
 */

import { InferenceEngine } from '../base/InferenceEngine';
import { StandardData, isUserLevelData } from '../../core/data/StandardData';
import { ModelConfig, InferenceResult, FitOptions, Posterior } from '../base/types';
import { EngineCapabilities } from '../base/InferenceEngine';
import { TycheError, ErrorCode } from '../../core/errors';
import { BetaBinomialConjugate } from '../exact/BetaBinomialConjugate';
import { LogNormalConjugate } from '../exact/LogNormalConjugate';
import { NormalConjugate } from '../exact/NormalConjugate';
import { LogNormalMixtureVBEM } from '../approximate/em/LogNormalMixtureVBEM';
import { NormalMixtureVBEM } from '../approximate/em/NormalMixtureVBEM';
import { StandardDataFactory } from '../../core/data/StandardData';

/**
 * Compound posterior that combines frequency and severity distributions
 * Implements the CompoundPosterior interface from InterfaceStandards.md
 */
export class CompoundPosterior implements Posterior {
  private cachedSamples: number[] | null = null;
  private readonly defaultSampleSize: number = 10000;

  constructor(
    private readonly frequency: Posterior,
    private readonly severity: Posterior,
    private readonly sampleSize: number
  ) {
    // Pre-cache samples for synchronous operations
    this.ensureSamples();
  }

  /**
   * Ensure we have cached samples
   */
  private ensureSamples(n?: number): void {
    const size = n || this.defaultSampleSize;
    if (!this.cachedSamples || this.cachedSamples.length < size) {
      const samples = this.generateSamples(size);
      if (samples instanceof Promise) {
        console.warn('Async sampling in compound posterior - caching deferred');
        this.cachedSamples = null;
      } else {
        this.cachedSamples = samples;
      }
    }
  }

  /**
   * Generate samples from the compound distribution
   */
  private generateSamples(n: number): number[] {
    // Sample conversion rates from frequency model
    const freqSamples = this.frequency.sample(n);
    // Sample values from severity model
    const sevSamples = this.severity.sample(n);

    // Synchronous case
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      // Each sample is frequency × severity (expected revenue per user)
      samples.push(freqSamples[i] * sevSamples[i]);
    }

    return samples;
  }

  /**
   * Sample from the joint distribution (frequency × severity)
   */
  sample(n: number = 1000): number[] {
    // Use cached samples if available and sufficient
    if (this.cachedSamples && n <= this.cachedSamples.length) {
      // Return random subset to avoid bias
      const indices = new Array(n)
        .fill(0)
        .map(() => Math.floor(Math.random() * this.cachedSamples!.length));
      return indices.map((i) => this.cachedSamples![i]);
    }

    // Generate fresh samples
    return this.generateSamples(n);
  }

  /**
   * Get the mean of the compound distribution
   * E[Revenue] = E[Conversion] * E[Value|Converted]
   */
  mean(): number[] {
    // Try analytical approach first if both components have analytical means
    if (this.frequency.mean && this.severity.mean) {
      const freqMean = this.frequency.mean();
      const sevMean = this.severity.mean();
      return [freqMean[0] * sevMean[0]];
    }

    // Fall back to sample-based calculation
    this.ensureSamples();
    if (!this.cachedSamples) {
      throw new Error('Cannot compute synchronous mean without cached samples');
    }

    const sum = this.cachedSamples.reduce((a, b) => a + b, 0);
    return [sum / this.cachedSamples.length];
  }

  /**
   * Get the variance of the compound distribution
   * Var[Revenue] = E[C]²Var[V] + E[V]²Var[C] + Var[C]Var[V]
   */
  variance(): number[] {
    // Try analytical approach first if all required methods exist
    if (
      this.frequency.mean &&
      this.frequency.variance &&
      this.severity.mean &&
      this.severity.variance
    ) {
      const freqMean = this.frequency.mean();
      const freqVar = this.frequency.variance();
      const sevMean = this.severity.mean();
      const sevVar = this.severity.variance();

      const variance =
        Math.pow(freqMean[0], 2) * sevVar[0] +
        Math.pow(sevMean[0], 2) * freqVar[0] +
        freqVar[0] * sevVar[0];

      return [variance];
    }

    // Fall back to sample-based calculation
    this.ensureSamples();
    if (!this.cachedSamples) {
      throw new Error('Cannot compute synchronous variance without cached samples');
    }

    const mean = this.mean()[0];
    const squaredDiffs = this.cachedSamples.map((x) => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (this.cachedSamples.length - 1);
    return [variance];
  }

  /**
   * Get credible interval for the compound distribution
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Use sample-based approach
    this.ensureSamples();
    if (!this.cachedSamples) {
      throw new Error('Cannot compute synchronous credible interval without cached samples');
    }

    const sorted = [...this.cachedSamples].sort((a, b) => a - b);
    const alpha = (1 - level) / 2;
    const lowerIndex = Math.floor(alpha * sorted.length);
    const upperIndex = Math.floor((1 - alpha) * sorted.length);

    return [[sorted[lowerIndex], sorted[upperIndex]]];
  }

  /**
   * Compound posteriors have analytical form for components but not joint
   */
  hasAnalyticalForm(): boolean {
    return false; // Joint distribution is not analytical
  }

  /**
   * Get decomposition into frequency and severity components
   * This is specific to CompoundPosterior
   */
  getDecomposition(): { frequency: Posterior; severity: Posterior } {
    return {
      frequency: this.frequency,
      severity: this.severity,
    };
  }

  /**
   * Get severity components if the value model is a mixture
   */
  getSeverityComponents(): Array<{
    mean: number;
    variance: number;
    weight: number;
    weightCI?: [number, number];
  }> | null {
    // Check if severity posterior has getComponents method
    if ('getComponents' in this.severity && typeof this.severity.getComponents === 'function') {
      return (this.severity as any).getComponents();
    }
    return null;
  }
}

/**
 * Compound Inference Engine
 * Fits zero-inflated models by separately modeling conversion and value
 */
export class CompoundInferenceEngine extends InferenceEngine {
  readonly capabilities: EngineCapabilities = {
    structures: ['compound'],
    types: ['beta', 'lognormal', 'normal', 'gamma'], // Value types supported
    dataTypes: ['user-level'],
    components: [1, 2, 3, 4], // For value distribution mixtures
    exact: false, // Depends on component engines
    fast: true,
    stable: true,
  };

  get algorithm(): 'conjugate' | 'em' | 'vi' | 'mcmc' {
    // Algorithm is determined by the value engine used
    // This will be set when fit() is called
    return this._algorithm || 'em';
  }

  private _algorithm?: 'conjugate' | 'em' | 'vi' | 'mcmc';

  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const start = performance.now();

    // Validate inputs
    this.validateData(data, config);

    // Extract user-level data
    const users = data.userLevel!.users;

    // Separate into conversion and value data
    const { conversionData, valueData } = this.separateData(data, users);

    // Fit frequency model (always Beta for conversion)
    const freqEngine = new BetaBinomialConjugate();
    const freqConfig: ModelConfig = {
      structure: 'simple',
      type: 'beta',
      components: 1,
    };
    const freqResult = await freqEngine.fit(conversionData, freqConfig, options);

    // Fit value model based on config
    const valueEngine = this.selectValueEngine(config);

    // Set algorithm based on value engine
    this._algorithm = valueEngine.algorithm;

    const valueConfig: ModelConfig = {
      structure: 'simple',
      type: config.valueType!,
      components: config.valueComponents || 1,
    };
    const valueResult = await valueEngine.fit(valueData, valueConfig, options);

    // Combine into compound posterior
    const posterior = new CompoundPosterior(freqResult.posterior, valueResult.posterior, data.n);

    const runtime = performance.now() - start;

    return {
      posterior,
      diagnostics: {
        converged: freqResult.diagnostics.converged && valueResult.diagnostics.converged,
        iterations: Math.max(
          freqResult.diagnostics.iterations || 1,
          valueResult.diagnostics.iterations || 1
        ),
        runtime,
        modelType: `compound-beta-${config.valueType}`,
      },
    };
  }

  private validateData(data: StandardData, config: ModelConfig): void {
    if (!isUserLevelData(data)) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'CompoundInferenceEngine requires user-level data',
        { dataType: data.type }
      );
    }

    if (config.structure !== 'compound') {
      throw new TycheError(
        ErrorCode.MODEL_MISMATCH,
        'CompoundInferenceEngine requires compound model structure',
        { structure: config.structure }
      );
    }

    if (!config.valueType) {
      throw new TycheError(
        ErrorCode.INVALID_CONFIG,
        'Compound model requires valueType to be specified',
        { config }
      );
    }
  }

  private separateData(
    data: StandardData,
    users: any[]
  ): {
    conversionData: StandardData;
    valueData: StandardData;
  } {
    // Conversion data: binomial format
    const conversions = users.filter((u) => u.converted).length;
    const conversionData = StandardDataFactory.fromBinomial(conversions, users.length);

    // Value data: only positive values from converted users
    const positiveValues = users.filter((u) => u.converted && u.value > 0).map((u) => u.value);

    if (positiveValues.length === 0) {
      throw new TycheError(
        ErrorCode.INSUFFICIENT_DATA,
        'No positive values found in converted users'
      );
    }

    const valueData = StandardDataFactory.fromContinuous(positiveValues);

    return { conversionData, valueData };
  }

  private selectValueEngine(config: ModelConfig): InferenceEngine {
    const valueType = config.valueType!;
    const valueComponents = config.valueComponents || 1;

    switch (valueType) {
      case 'lognormal':
        return valueComponents > 1 ? new LogNormalMixtureVBEM() : new LogNormalConjugate();

      case 'normal':
        return valueComponents > 1 ? new NormalMixtureVBEM() : new NormalConjugate();

      case 'gamma':
        // TODO: Implement GammaConjugate and GammaMixtureEM
        throw new TycheError(
          ErrorCode.NOT_IMPLEMENTED,
          'Gamma value distribution not yet implemented'
        );

      default:
        throw new TycheError(ErrorCode.INVALID_CONFIG, `Unsupported value type: ${valueType}`, {
          valueType,
        });
    }
  }
}
