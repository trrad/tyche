/**
 * LogNormal Mixture Model using Expectation-Maximization
 * Migrated to extend InferenceEngine base class with proper capabilities
 *
 * Performance optimization: Set useFastMStep: true for 10-100x speedup
 * - Fast mode: Direct parameter updates in log space, no fitWeighted calls
 * - Bayesian mode: Original behavior with full posterior updates
 */

import { InferenceEngine, EngineCapabilities } from '../../base/InferenceEngine';
import {
  FitOptions,
  InferenceResult,
  Posterior,
  ModelConfig,
  ModelStructure,
  ModelType,
} from '../../base/types';
import { StandardData, DataType } from '../../../core/data/StandardData';
import { TycheError, ErrorCode } from '../../../core/errors';
import { LogNormalDistribution } from '../../../core/distributions/LogNormalDistribution';
import { NormalDistribution } from '../../../core/distributions/NormalDistribution';
import { LogNormalConjugate } from '../../exact/LogNormalConjugate';

/**
 * Component of a LogNormal mixture with its inference engine
 */
interface LogNormalComponent {
  weight: number;
  inference: LogNormalConjugate;
  posterior: Posterior;
}

/**
 * Posterior for LogNormal mixture model
 * Implements the Posterior interface with sample-based methods
 */
export class LogNormalMixturePosterior implements Posterior {
  private cachedSamples: number[] | null = null;
  private readonly defaultSampleSize: number = 10000;

  constructor(
    private readonly components: LogNormalComponent[],
    private readonly sampleSize: number
  ) {
    // Don't pre-cache samples - components might not be fully initialized yet
  }

  /**
   * Ensure we have cached samples
   */
  private ensureSamples(n?: number): void {
    const size = n || this.defaultSampleSize;
    if (!this.cachedSamples || this.cachedSamples.length < size) {
      this.cachedSamples = this.generateSamples(size);
    }
  }

  /**
   * Generate samples from the mixture
   */
  private generateSamples(n: number): number[] {
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      // First sample which component
      const u = Math.random();
      let cumWeight = 0;
      let selectedComponent: LogNormalComponent | null = null;

      for (const comp of this.components) {
        cumWeight += comp.weight;
        if (u <= cumWeight) {
          selectedComponent = comp;
          break;
        }
      }

      if (!selectedComponent) {
        selectedComponent = this.components[this.components.length - 1];
      }

      // Delegate to selected component's posterior
      const componentSample = selectedComponent.posterior.sample(1);
      if (componentSample instanceof Promise) {
        throw new Error('Async sampling not supported in mixture components');
      }
      samples.push(componentSample[0]);
    }
    return samples;
  }

  /**
   * Sample from the mixture distribution
   */
  sample(n: number = 1): number[] {
    // Ensure we have samples
    this.ensureSamples(n);

    // Use cached samples if we have enough
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
   * Get mixture mean (weighted average of component means)
   */
  mean(): number[] {
    // Two options:
    // 1. Analytical: weighted sum of component means
    // 2. Sample-based: mean of cached samples

    // Use analytical approach if all components have means
    if (this.components.every((c) => c.posterior.mean)) {
      const mixtureMean = this.components.reduce((sum, comp) => {
        const compMean = comp.posterior.mean!();
        return sum + comp.weight * compMean[0];
      }, 0);
      return [mixtureMean];
    }

    // Fall back to sample-based
    this.ensureSamples();
    const sum = this.cachedSamples!.reduce((a, b) => a + b, 0);
    return [sum / this.cachedSamples!.length];
  }

  /**
   * Get mixture variance
   */
  variance(): number[] {
    // For mixture: Var[X] = E[Var[X|Z]] + Var[E[X|Z]]
    // where Z is the component indicator

    // Use analytical if possible
    if (this.components.every((c) => c.posterior.mean && c.posterior.variance)) {
      // E[Var[X|Z]] - expected within-component variance
      const expectedVariance = this.components.reduce((sum, comp) => {
        const compVar = comp.posterior.variance!();
        return sum + comp.weight * compVar[0];
      }, 0);

      // Var[E[X|Z]] - variance of component means
      const mixtureMean = this.mean()[0];
      const varianceOfMeans = this.components.reduce((sum, comp) => {
        const compMean = comp.posterior.mean!()[0];
        return sum + comp.weight * Math.pow(compMean - mixtureMean, 2);
      }, 0);

      return [expectedVariance + varianceOfMeans];
    }

    // Fall back to sample-based
    this.ensureSamples();
    const mean = this.mean()[0];
    const squaredDiffs = this.cachedSamples!.map((x) => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (this.cachedSamples!.length - 1);
    return [variance];
  }

  /**
   * Get credible interval for the mixture
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Use sample-based approach
    this.ensureSamples();

    const sorted = [...this.cachedSamples!].sort((a, b) => a - b);
    const alpha = (1 - level) / 2;
    const lowerIndex = Math.floor(alpha * sorted.length);
    const upperIndex = Math.floor((1 - alpha) * sorted.length);

    return [[sorted[lowerIndex], sorted[upperIndex]]];
  }

  /**
   * Log probability density for mixture
   */
  logPdf(data: number): number {
    // Compute log-likelihood of data point under the mixture
    const logProbs = this.components.map((comp) => {
      const logCompProb = comp.posterior.logPdf(data);
      return Math.log(comp.weight) + logCompProb;
    });

    // Use log-sum-exp trick for numerical stability
    const maxLogProb = Math.max(...logProbs);
    const logSumExp =
      maxLogProb + Math.log(logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0));

    return logSumExp;
  }

  /**
   * Batch log PDF computation
   */
  logPdfBatch(data: number[]): number[] {
    return data.map((d) => this.logPdf(d));
  }

  /**
   * Mixture models don't have simple analytical form
   */
  hasAnalyticalForm(): boolean {
    return false; // Mixture requires numerical methods
  }

  /**
   * Get mixture weights
   */
  getWeights(): number[] {
    return this.components.map((c) => c.weight);
  }

  /**
   * Get component posteriors
   */
  getComponentPosteriors(): Posterior[] {
    return this.components.map((c) => c.posterior);
  }

  /**
   * Expected value of the mixture
   */
  expectedValue(): number {
    return this.components.reduce((sum, comp) => sum + comp.weight * comp.posterior.mean()[0], 0);
  }

  /**
   * Get mixture components in standardized format
   */
  getComponents(): { mean: number; variance: number; weight: number }[] {
    return this.components.map((c) => ({
      mean: c.posterior.mean()[0],
      variance: c.posterior.variance()[0],
      weight: c.weight,
    }));
  }
}

/**
 * LogNormal mixture model using EM with conjugate updates
 * Composes LogNormalConjugate for each component
 */
export class LogNormalMixtureEM extends InferenceEngine {
  private readonly useFastMStep: boolean;

  /**
   * Declare capabilities for routing
   */
  readonly capabilities: EngineCapabilities = {
    structures: ['simple', 'compound'] as ModelStructure[],
    types: ['lognormal'] as ModelType[],
    dataTypes: ['user-level'] as DataType[],
    components: [1, 2, 3, 4], // Support 1-4 components
    exact: false, // Approximate inference
    fast: true, // Generally fast convergence
    stable: true, // Numerically stable with proper implementation
  };

  /**
   * Algorithm type
   */
  readonly algorithm = 'em' as const;

  constructor(options?: {
    useFastMStep?: boolean; // Performance optimization option
  }) {
    super('LogNormal Mixture EM');
    this.useFastMStep = options?.useFastMStep !== undefined ? options.useFastMStep : true;
  }

  /**
   * Fit the mixture model using EM algorithm
   */
  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const start = performance.now();

    // Validate data
    this.validateStandardData(data);

    // Extract values based on data type
    let values: number[];

    if (data.type === 'user-level' && data.userLevel) {
      // Extract positive values from user-level data
      values = data.userLevel.users.map((u) => u.value).filter((v) => v > 0);

      if (values.length === 0) {
        throw new TycheError(
          ErrorCode.INSUFFICIENT_DATA,
          'No positive values found in user-level data'
        );
      }
    } else {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'LogNormalMixtureEM requires user-level data with positive values',
        { actualType: data.type }
      );
    }

    // Transform to log scale
    const logValues = values.map((x) => Math.log(x));
    const n = logValues.length;

    // Get number of components from config
    const requestedComponents = config.valueComponents || config.components || 2;
    const maxViableComponents = Math.floor(n / 8); // ~8 points minimum per component
    const actualComponents = Math.min(requestedComponents, maxViableComponents);

    // Warn if we had to reduce components
    if (actualComponents < requestedComponents) {
      console.warn(
        `LogNormalMixtureEM: Reduced components from ${requestedComponents} to ${actualComponents} due to data size (${n} points)`
      );
    }

    // If we can't support multiple components, fallback to single LogNormal
    if (actualComponents <= 1) {
      console.warn(
        `LogNormalMixtureEM: Insufficient data for mixture (${n} points), falling back to single LogNormal`
      );
      const singleComponent = new LogNormalConjugate();
      return singleComponent.fit(data, config, options);
    }

    // Initialize components
    const components = await this.initializeComponents(values, actualComponents, options);

    // EM algorithm
    const maxIterations = options?.maxIterations || 100;
    const tolerance = options?.tolerance || 1e-4;
    let prevLogLik = -Infinity;
    let iter = 0;
    const logLikelihoodHistory: number[] = [];

    for (; iter < maxIterations; iter++) {
      // E-step: compute responsibilities
      const responsibilities = this.eStep(logValues, components);

      // M-step: use fast or Bayesian approach
      if (this.useFastMStep) {
        this.mStepFast(logValues, responsibilities, components);
      } else {
        await this.mStep(values, responsibilities, components, options);
      }

      // Enforce ordering constraint μ₁ ≤ μ₂ ≤ ... ≤ μₖ
      this.enforceOrdering(components);

      // Compute log-likelihood
      const logLik = this.computeLogLikelihood(logValues, components);
      logLikelihoodHistory.push(logLik);

      // Check convergence
      if (
        Math.abs(logLik - prevLogLik) < tolerance ||
        (logLik - prevLogLik < 0 && Math.abs(logLik - prevLogLik) < tolerance * 10)
      ) {
        break; // Allow small decreases due to numerical errors
      }
      prevLogLik = logLik;
    }

    const runtime = performance.now() - start;

    return {
      posterior: new LogNormalMixturePosterior(components, n),
      diagnostics: {
        converged: iter < maxIterations,
        iterations: iter,
        runtime,
        finalLogLikelihood: prevLogLik,
        likelihoodHistory: logLikelihoodHistory,
        modelType: 'lognormal-mixture',
      },
    };
  }

  private async initializeComponents(
    values: number[],
    numComponents: number,
    options?: FitOptions
  ): Promise<LogNormalComponent[]> {
    // Transform to log scale for clustering
    const logValues = values.map((x) => Math.log(x));

    // Use k-means++ initialization on log values
    const centers = this.kMeansPlusPlus(logValues, numComponents);

    // Initialize components around these centers
    const components: LogNormalComponent[] = [];

    for (let i = 0; i < centers.length; i++) {
      // Get points closest to this center
      const assignments = this.assignToCenters(logValues, centers);
      const clusterData = values.filter((_, j) => assignments[j] === i);

      if (clusterData.length === 0) {
        // Empty cluster, use center point
        clusterData.push(Math.exp(centers[i]));
      }

      // Create inference engine for this component
      const inference = new LogNormalConjugate();

      // Fit initial model to cluster data
      const clusterStandardData: StandardData = {
        type: 'user-level',
        n: clusterData.length,
        userLevel: {
          users: clusterData.map((v) => ({ value: v, converted: true })),
          empiricalStats: {
            mean: clusterData.reduce((a, b) => a + b, 0) / clusterData.length,
            variance: 0, // Will be computed if needed
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      const result = await inference.fit(
        clusterStandardData,
        { structure: 'simple', type: 'lognormal', components: 1 },
        options
      );

      components.push({
        weight: clusterData.length / values.length,
        inference: inference,
        posterior: result.posterior,
      });
    }

    return components;
  }

  private kMeansPlusPlus(data: number[], k: number): number[] {
    const centers: number[] = [];

    // Choose first center randomly
    centers.push(data[Math.floor(Math.random() * data.length)]);

    // Choose remaining centers
    for (let i = 1; i < k; i++) {
      const distances = data.map((x) => {
        const minDist = Math.min(...centers.map((c) => Math.abs(x - c)));
        return minDist * minDist;
      });

      // Sample proportional to squared distance
      const totalDist = distances.reduce((a, b) => a + b, 0);
      const probs = distances.map((d) => d / totalDist);

      let cumSum = 0;
      const r = Math.random();
      for (let j = 0; j < data.length; j++) {
        cumSum += probs[j];
        if (r <= cumSum) {
          centers.push(data[j]);
          break;
        }
      }
    }

    return centers;
  }

  private assignToCenters(data: number[], centers: number[]): number[] {
    return data.map((x) => {
      let minDist = Infinity;
      let assignment = 0;
      for (let i = 0; i < centers.length; i++) {
        const dist = Math.abs(x - centers[i]);
        if (dist < minDist) {
          minDist = dist;
          assignment = i;
        }
      }
      return assignment;
    });
  }

  private eStep(logValues: number[], components: LogNormalComponent[]): number[][] {
    const n = logValues.length;
    const k = components.length;
    const responsibilities: number[][] = Array(n)
      .fill(null)
      .map(() => Array(k).fill(0));

    for (let i = 0; i < n; i++) {
      const logProbs: number[] = [];

      for (let j = 0; j < k; j++) {
        const comp = components[j];
        // Compute log probability under this component's posterior
        const params = (comp.posterior as any).getParameters();
        const mu = params.mu0;
        const sigma2 = params.beta / (params.alpha - 1);
        const sigma = Math.sqrt(sigma2);

        // Normal log PDF on log scale
        const z = (logValues[i] - mu) / sigma;
        const logProb = -0.5 * Math.log(2 * Math.PI) - Math.log(sigma) - 0.5 * z * z;

        logProbs.push(Math.log(comp.weight) + logProb);
      }

      // Normalize using log-sum-exp trick
      const maxLogProb = Math.max(...logProbs);
      const logSumExp =
        maxLogProb + Math.log(logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0));

      for (let j = 0; j < k; j++) {
        responsibilities[i][j] = Math.exp(logProbs[j] - logSumExp);
      }
    }

    return responsibilities;
  }

  private mStepFast(
    logValues: number[],
    responsibilities: number[][],
    components: LogNormalComponent[]
  ): void {
    const n = logValues.length;
    const k = components.length;

    for (let j = 0; j < k; j++) {
      // Compute effective number of points
      const Nj = responsibilities.reduce((sum, r) => sum + r[j], 0);

      if (Nj < 1e-10) {
        // Empty component, skip update
        continue;
      }

      // Update weight
      components[j].weight = Nj / n;

      // Compute weighted statistics in log space
      const weightedSum = responsibilities.reduce((sum, r, i) => sum + r[j] * logValues[i], 0);
      const weightedMean = weightedSum / Nj;
      const weightedSumSq = responsibilities.reduce(
        (sum, r, i) => sum + r[j] * logValues[i] * logValues[i],
        0
      );
      const weightedVar = weightedSumSq / Nj - weightedMean * weightedMean;

      // Create a simple posterior with these parameters
      // This is a fast approximation - not full Bayesian update
      const mockPosterior = {
        sample: (n: number = 1) => {
          const samples = [];
          for (let i = 0; i < n; i++) {
            const normal = new NormalDistribution(
              weightedMean,
              Math.sqrt(Math.max(weightedVar, 1e-10))
            );
            const logSample = normal.sample(1)[0];
            samples.push(Math.exp(logSample));
          }
          return samples;
        },
        mean: () => [Math.exp(weightedMean + weightedVar / 2)],
        variance: () => {
          const mean = Math.exp(weightedMean + weightedVar / 2);
          return [(Math.exp(weightedVar) - 1) * mean * mean];
        },
        credibleInterval: (level: number = 0.95) => {
          const samples = mockPosterior.sample(10000);
          samples.sort((a, b) => a - b);
          const alpha = (1 - level) / 2;
          const lower = samples[Math.floor(samples.length * alpha)];
          const upper = samples[Math.floor(samples.length * (1 - alpha))];
          return [[lower, upper]] as Array<[number, number]>;
        },
        logPdf: (data: number) => {
          if (data <= 0) return -Infinity;
          const logData = Math.log(data);
          const z = (logData - weightedMean) / Math.sqrt(Math.max(weightedVar, 1e-10));
          return (
            -logData -
            0.5 * Math.log(2 * Math.PI) -
            0.5 * Math.log(Math.max(weightedVar, 1e-10)) -
            0.5 * z * z
          );
        },
        logPdfBatch: (data: number[]) => data.map((d) => mockPosterior.logPdf(d)),
        hasAnalyticalForm: () => false,
        getParameters: () => ({
          mu0: weightedMean,
          lambda: Nj,
          alpha: 2 + Nj / 2,
          beta: weightedVar * (1 + Nj / 2),
        }),
      } as Posterior;

      components[j].posterior = mockPosterior;
    }
  }

  private async mStep(
    values: number[],
    responsibilities: number[][],
    components: LogNormalComponent[],
    options?: FitOptions
  ): Promise<void> {
    const n = values.length;
    const k = components.length;

    for (let j = 0; j < k; j++) {
      // Compute effective number of points
      const Nj = responsibilities.reduce((sum, r) => sum + r[j], 0);

      if (Nj < 1e-10) {
        // Empty component, skip update
        continue;
      }

      // Update weight
      components[j].weight = Nj / n;

      // Get responsibilities for this component
      const weights = responsibilities.map((r) => r[j]);

      // Use weighted fit
      const result = await components[j].inference.fitWeighted(
        {
          type: 'user-level',
          n: values.length,
          userLevel: {
            users: values.map((v) => ({ value: v, converted: true })),
            empiricalStats: {
              mean: values.reduce((a, b) => a + b, 0) / values.length,
              variance: 0,
            },
          },
          quality: {
            hasZeros: false,
            hasNegatives: false,
            hasOutliers: false,
            missingData: 0,
          },
        },
        weights,
        options
      );

      components[j].posterior = result.posterior;
    }
  }

  private enforceOrdering(components: LogNormalComponent[]): void {
    // Sort components by mean in log space
    components.sort((a, b) => {
      const paramsA = (a.posterior as any).getParameters();
      const paramsB = (b.posterior as any).getParameters();
      return paramsA.mu0 - paramsB.mu0;
    });
  }

  private computeLogLikelihood(logValues: number[], components: LogNormalComponent[]): number {
    let logLik = 0;

    for (const logX of logValues) {
      const logProbs: number[] = [];

      for (const comp of components) {
        const params = (comp.posterior as any).getParameters();
        const mu = params.mu0;
        const sigma2 = params.beta / (params.alpha - 1);
        const sigma = Math.sqrt(sigma2);

        // Normal log PDF on log scale
        const z = (logX - mu) / sigma;
        const logProb = -0.5 * Math.log(2 * Math.PI) - Math.log(sigma) - 0.5 * z * z;

        logProbs.push(Math.log(comp.weight) + logProb);
      }

      // Log-sum-exp trick
      const maxLogProb = Math.max(...logProbs);
      const logSumExp =
        maxLogProb + Math.log(logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0));

      logLik += logSumExp;
    }

    return logLik;
  }

  /**
   * Override canHandle to provide more specific checks
   */
  canHandle(config: ModelConfig, data: StandardData, options?: FitOptions): boolean {
    // Use base class method which checks capabilities
    if (!super.canHandle(config, data, options)) {
      return false;
    }

    // For simple models
    if (config.structure === 'simple' && config.type !== 'lognormal') {
      return false;
    }

    // For compound models, check value type
    if (config.structure === 'compound' && config.valueType !== 'lognormal') {
      return false;
    }

    // Must have user-level data with positive values
    if (data.type !== 'user-level' || !data.userLevel) {
      return false;
    }

    // Check for positive values
    const hasPositiveValues = data.userLevel.users.some((u) => u.value > 0);
    if (!hasPositiveValues) {
      return false;
    }

    // Check component count
    const components = config.valueComponents || config.components || 1;
    return components >= 1 && components <= 4;
  }
}

// For backward compatibility
export const LogNormalBayesian = LogNormalConjugate;
