/**
 * LogNormal Mixture Model using Variational Bayes EM (VBEM)
 *
 * This replaces the dual-pathway approach with proper Bayesian treatment:
 * - Always uses LogNormalConjugate for component posteriors
 * - Dirichlet posterior for mixture weights
 * - Full ELBO-based convergence
 * - No point estimates anywhere
 */

import { MixtureEMBase, MixtureComponent } from './MixtureEMBase';
import { EngineCapabilities } from '../../base/InferenceEngine';
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
import { DirichletDistribution } from '../../../core/distributions/DirichletDistribution';
import { LogNormalConjugate, LogNormalPosterior } from '../../exact/LogNormalConjugate';

/**
 * Parameters for Normal-Inverse-Gamma prior
 */
interface NormalInverseGammaParams {
  mu0: number;
  lambda: number;
  alpha: number;
  beta: number;
}

/**
 * LogNormal component with conjugate inference
 */
interface LogNormalMixtureComponent extends MixtureComponent {
  posterior: LogNormalPosterior;
  prior: NormalInverseGammaParams;
  inference: LogNormalConjugate;
}

/**
 * Unified posterior for LogNormal mixture with weight uncertainty
 */
export class LogNormalMixturePosterior implements Posterior {
  private cachedSamples: number[] | null = null;
  private readonly defaultSampleSize: number = 10000;

  constructor(
    private readonly components: LogNormalMixtureComponent[],
    private readonly weightPosterior: DirichletDistribution,
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
      this.cachedSamples = this.generateSamples(size);
    }
  }

  /**
   * Generate samples from the mixture with weight uncertainty
   */
  private generateSamples(n: number): number[] {
    const samples: number[] = [];

    for (let i = 0; i < n; i++) {
      // Sample weights from Dirichlet posterior
      const weights = this.weightPosterior.sample(1)[0];

      // Select component using sampled weights
      const u = Math.random();
      let cumWeight = 0;
      let selectedIdx = 0;

      for (let k = 0; k < weights.length; k++) {
        cumWeight += weights[k];
        if (u <= cumWeight) {
          selectedIdx = k;
          break;
        }
      }

      // Sample from selected component's posterior
      const componentSample = this.components[selectedIdx].posterior.sample(1);
      samples.push(componentSample[0]);
    }

    return samples;
  }

  /**
   * Sample from the mixture distribution
   */
  sample(n: number = 1): number[] {
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
   * Get mixture mean accounting for weight uncertainty
   */
  mean(): number[] {
    // Use expected weights for analytical mean
    const expectedWeights = this.weightPosterior.mean();

    const mixtureMean = this.components.reduce((sum, comp, k) => {
      const compMean = comp.posterior.mean();
      return sum + expectedWeights[k] * compMean[0];
    }, 0);

    return [mixtureMean];
  }

  /**
   * Get mixture variance accounting for all uncertainty
   */
  variance(): number[] {
    // For mixture: Var[X] = E[Var[X|Z,θ]] + Var[E[X|Z,θ]]
    // With uncertainty in both weights and parameters

    const expectedWeights = this.weightPosterior.mean();
    const mixtureMean = this.mean()[0];

    // Expected within-component variance
    const expectedVariance = this.components.reduce((sum, comp, k) => {
      const compVar = comp.posterior.variance();
      return sum + expectedWeights[k] * compVar[0];
    }, 0);

    // Variance of component means (including weight uncertainty)
    const varianceOfMeans = this.components.reduce((sum, comp, k) => {
      const compMean = comp.posterior.mean()[0];
      return sum + expectedWeights[k] * Math.pow(compMean - mixtureMean, 2);
    }, 0);

    // Additional variance from weight uncertainty
    const weightVariances = this.weightPosterior.variance();
    let weightContribution = 0;
    for (let k = 0; k < this.components.length; k++) {
      const compMean = this.components[k].posterior.mean()[0];
      weightContribution += weightVariances[k] * Math.pow(compMean - mixtureMean, 2);
    }

    return [expectedVariance + varianceOfMeans + weightContribution];
  }

  /**
   * Get credible interval for the mixture
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Use sample-based approach to account for all uncertainty
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
    // Use expected weights for log PDF
    const expectedWeights = this.weightPosterior.mean();

    const logProbs = this.components.map((comp, k) => {
      const logCompProb = comp.posterior.logPdf(data);
      return Math.log(expectedWeights[k]) + logCompProb;
    });

    // Log-sum-exp trick for numerical stability
    const maxLogProb = Math.max(...logProbs);
    const logSumExp =
      maxLogProb + Math.log(logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0));

    return logSumExp;
  }

  /**
   * Mixture models don't have simple analytical form
   */
  hasAnalyticalForm(): boolean {
    return false;
  }

  /**
   * Get component information with weight uncertainty
   */
  getComponents(): Array<{
    mean: number;
    variance: number;
    weight: number;
    weightCI: [number, number];
    posterior: Posterior;
  }> {
    const expectedWeights = this.weightPosterior.mean();

    return this.components.map((comp, k) => {
      // Get marginal Beta distribution for this component's weight
      const marginalBeta = this.weightPosterior.marginalBeta(k);
      const weightCI = marginalBeta.credibleInterval(0.95);

      return {
        mean: comp.posterior.mean()[0],
        variance: comp.posterior.variance()[0],
        weight: expectedWeights[k],
        weightCI: weightCI as [number, number],
        posterior: comp.posterior,
      };
    });
  }

  /**
   * Get the Dirichlet posterior for weights
   */
  getWeightPosterior(): DirichletDistribution {
    return this.weightPosterior;
  }
}

/**
 * LogNormal mixture model using VBEM
 */
export class LogNormalMixtureVBEM extends MixtureEMBase {
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
   * Algorithm type - VBEM uses variational inference
   */
  readonly algorithm = 'vi' as const;

  constructor() {
    super('LogNormal Mixture VBEM');
  }

  /**
   * Initialize components using k-means++ on log values
   */
  protected async initializeComponents(
    values: number[],
    numComponents: number,
    options?: FitOptions
  ): Promise<LogNormalMixtureComponent[]> {
    // Transform to log scale for clustering
    const logValues = values.map((x) => Math.log(x));

    // Use k-means++ initialization
    const centers = this.kMeansPlusPlus(logValues, numComponents);

    // Initialize components
    const components: LogNormalMixtureComponent[] = [];

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

      // Set up prior (weakly informative)
      const clusterMean = clusterData.reduce((a, b) => a + b, 0) / clusterData.length;
      const clusterLogMean = Math.log(clusterMean);
      const clusterVar =
        clusterData.length > 1
          ? clusterData.reduce((sum, x) => sum + Math.pow(x - clusterMean, 2), 0) /
            clusterData.length
          : 1;

      // Handle case where all values in cluster are identical
      const clusterLogValues = clusterData.map((v) => Math.log(v));
      const clusterLogVar =
        clusterLogValues.length > 1
          ? clusterLogValues.reduce((sum, logV, _, arr) => {
              const logMean = arr.reduce((a, b) => a + b, 0) / arr.length;
              return sum + Math.pow(logV - logMean, 2);
            }, 0) / clusterLogValues.length
          : 0;

      const prior: NormalInverseGammaParams = {
        mu0: clusterLogMean,
        lambda: 1, // Weak confidence in prior mean
        alpha: 2, // Minimum for finite variance
        beta: Math.max(0.1, clusterLogVar * 2), // Ensure positive, even for identical values
      };

      // Fit initial model to cluster data
      const clusterStandardData: StandardData = {
        type: 'user-level',
        n: clusterData.length,
        userLevel: {
          users: clusterData.map((v, i) => ({
            userId: `init_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: clusterMean,
            variance: clusterVar,
            min: Math.min(...clusterData),
            max: Math.max(...clusterData),
            q25: 0,
            q50: 0,
            q75: 0,
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
        posterior: result.posterior as LogNormalPosterior,
        prior: prior,
      });
    }

    return components;
  }

  /**
   * VBEM M-step: Update both component and weight posteriors
   */
  protected async mStepVBEM(
    values: number[],
    responsibilities: number[][],
    currentComponents: LogNormalMixtureComponent[],
    options?: FitOptions
  ): Promise<{
    components: LogNormalMixtureComponent[];
    weightPosterior: DirichletDistribution;
  }> {
    const n = values.length;
    const K = currentComponents.length;

    // Update weight posterior using Dirichlet-Multinomial conjugacy
    const weightPosterior = this.updateWeightPosterior(responsibilities, this.priorAlpha);

    // Update component posteriors
    const components: LogNormalMixtureComponent[] = [];

    for (let k = 0; k < K; k++) {
      // Compute effective sample size
      const Nk = responsibilities.reduce((sum, r) => sum + r[k], 0);

      if (Nk < 1e-10) {
        // Keep current component if degenerate
        components.push(currentComponents[k]);
        continue;
      }

      // Get responsibilities for this component
      const weights = responsibilities.map((r) => r[k]);

      // Use weighted fit with LogNormalConjugate
      const weightedData: StandardData = {
        type: 'user-level',
        n: values.length,
        userLevel: {
          users: values.map((v, i) => ({
            userId: `weighted_${i}`,
            value: v,
            converted: true,
          })),
          empiricalStats: {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            variance: 0,
            min: Math.min(...values),
            max: Math.max(...values),
            q25: 0,
            q50: 0,
            q75: 0,
          },
        },
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0,
        },
      };

      // Keep the same prior throughout
      const componentOptions: FitOptions = {
        ...options,
        priorParams: {
          type: 'normal-inverse-gamma',
          params: [
            currentComponents[k].prior.mu0,
            currentComponents[k].prior.lambda,
            currentComponents[k].prior.alpha,
            currentComponents[k].prior.beta,
          ],
        },
      };

      const result = await currentComponents[k].inference.fitWeighted(
        weightedData,
        weights,
        componentOptions
      );

      components.push({
        weight: Nk / n, // This is just for tracking, actual weights come from Dirichlet
        inference: currentComponents[k].inference,
        posterior: result.posterior as LogNormalPosterior,
        prior: currentComponents[k].prior, // Keep the same prior
      });
    }

    return { components, weightPosterior };
  }

  /**
   * Compute log probability under a component
   */
  protected computeComponentLogProb(value: number, component: LogNormalMixtureComponent): number {
    return component.posterior.logPdf(value);
  }

  /**
   * Compute KL divergence for a component
   */
  protected computeComponentKL(component: LogNormalMixtureComponent): number {
    return component.posterior.klDivergenceFromPrior(component.prior);
  }

  /**
   * Helper to assign points to centers
   */
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

  /**
   * Main fitting method
   */
  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const start = performance.now();

    // Validate data
    this.validateStandardData(data);

    // Extract positive values
    let values: number[];

    if (data.type === 'user-level' && data.userLevel) {
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
        'LogNormalMixtureVBEM requires user-level data with positive values',
        { actualType: data.type }
      );
    }

    // Get number of components
    const requestedComponents = config.valueComponents || config.components || 2;
    const maxViableComponents = Math.floor(values.length / 10); // ~10 points minimum per component
    const actualComponents = Math.min(requestedComponents, maxViableComponents);

    if (actualComponents < requestedComponents) {
      console.warn(
        `LogNormalMixtureVBEM: Reduced components from ${requestedComponents} to ${actualComponents} due to data size (${values.length} points)`
      );
    }

    // If we can't support multiple components, fallback to single LogNormal
    if (actualComponents <= 1) {
      const singleComponent = new LogNormalConjugate();
      return singleComponent.fit(data, config, options);
    }

    // Run VBEM algorithm
    const result = await this.runVBEM(values, actualComponents, options);

    const runtime = performance.now() - start;

    return {
      posterior: new LogNormalMixturePosterior(
        result.components as LogNormalMixtureComponent[],
        result.weightPosterior,
        values.length
      ),
      diagnostics: {
        converged: result.converged,
        iterations: result.iterations,
        runtime,
        finalELBO: result.elboHistory[result.elboHistory.length - 1],
        elboHistory: result.elboHistory,
        modelType: 'lognormal-mixture-vbem',
      },
    };
  }

  /**
   * Check if this engine can handle the given configuration
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
