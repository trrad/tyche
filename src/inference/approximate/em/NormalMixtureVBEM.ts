/**
 * Normal Mixture Model using Variational Bayes EM (VBEM)
 *
 * Implements full Bayesian treatment for Normal mixtures:
 * - Dirichlet prior on mixture weights
 * - Normal-Inverse-Gamma conjugate priors on component parameters
 * - ELBO-based convergence checking
 */

import { MixtureEMBase, MixtureComponent } from './MixtureEMBase';
import { StandardData } from '../../../core/data/StandardData';
import {
  ModelConfig,
  FitOptions,
  InferenceResult,
  Posterior,
  ModelType,
  ModelStructure,
} from '../../base/types';
import { DataType } from '../../../core/data/StandardData';
import { EngineCapabilities } from '../../base/InferenceEngine';
import { TycheError, ErrorCode } from '../../../core/errors';
import { NormalConjugate } from '../../exact/NormalConjugate';
import { DirichletDistribution } from '../../../core/distributions/DirichletDistribution';
import { StandardDataFactory } from '../../../core/data/StandardData';
import { NormalPosterior } from '../../exact/NormalConjugate';

/**
 * Component type for Normal mixture models
 */
interface NormalMixtureComponent extends MixtureComponent {
  posterior: NormalPosterior;
  prior?: any; // NormalInverseGamma parameters
}

/**
 * Posterior for Normal mixture model with full uncertainty
 */
export class NormalMixturePosterior implements Posterior {
  private cachedSamples: number[] | null = null;
  private readonly defaultSampleSize: number = 10000;

  constructor(
    private readonly components: NormalMixtureComponent[],
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
   * Generate samples from the mixture with full uncertainty
   */
  private generateSamples(n: number): number[] {
    const samples: number[] = [];

    for (let i = 0; i < n; i++) {
      // Sample weights from Dirichlet posterior
      const weights = this.weightPosterior.sample(1)[0];

      // Sample component based on weights
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
      const compMean = comp.posterior.mean!();
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
 * Normal mixture model using VBEM
 */
export class NormalMixtureVBEM extends MixtureEMBase {
  /**
   * Declare capabilities for routing
   */
  readonly capabilities: EngineCapabilities = {
    structures: ['simple', 'compound'] as ModelStructure[],
    types: ['normal'] as ModelType[],
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
    super('Normal Mixture VBEM');
  }

  /**
   * Initialize components using k-means++ on the data
   */
  protected async initializeComponents(
    values: number[],
    numComponents: number,
    options?: FitOptions
  ): Promise<NormalMixtureComponent[]> {
    // Use k-means++ initialization
    const centers = this.kMeansPlusPlus(values, numComponents);

    // Initialize components around these centers
    const components: NormalMixtureComponent[] = [];

    for (let i = 0; i < centers.length; i++) {
      // Get points closest to this center
      const assignments = this.assignToCenters(values, centers);
      const clusterData = values.filter((_, j) => assignments[j] === i);

      if (clusterData.length === 0) {
        // Empty cluster, use center point
        clusterData.push(centers[i]);
      }

      // Calculate cluster statistics for prior
      const clusterMean = clusterData.reduce((a, b) => a + b, 0) / clusterData.length;
      const clusterVar =
        clusterData.length > 1
          ? clusterData.reduce((sum, v) => sum + Math.pow(v - clusterMean, 2), 0) /
            clusterData.length
          : 1.0; // Default variance for single point

      // Set Normal-Inverse-Gamma prior parameters
      const prior = {
        mu0: clusterMean,
        lambda: 1, // Weak confidence in prior mean
        alpha: 2, // Minimum for finite variance
        beta: Math.max(0.1, clusterVar * 2), // Ensure positive
      };

      // Create conjugate engine for this component
      const conjugate = new NormalConjugate();

      // Fit initial model to cluster data
      const clusterStandardData = StandardDataFactory.fromUserLevel(
        clusterData.map((v, idx) => ({
          userId: `init_${i}_${idx}`,
          value: v,
          converted: true,
        }))
      );

      const result = await conjugate.fit(
        clusterStandardData,
        { structure: 'simple', type: 'normal', components: 1 },
        options
      );

      components.push({
        posterior: result.posterior as NormalPosterior,
        weight: clusterData.length / values.length,
        prior: prior,
      });
    }

    return components;
  }

  /**
   * VBEM M-step: Update component posteriors and weight posterior
   */
  protected async mStepVBEM(
    values: number[],
    responsibilities: number[][],
    currentComponents: NormalMixtureComponent[],
    options?: FitOptions
  ): Promise<{
    components: NormalMixtureComponent[];
    weightPosterior: DirichletDistribution;
  }> {
    const K = currentComponents.length;
    const updatedComponents: NormalMixtureComponent[] = [];

    // Update weight posterior using responsibilities
    const weightPosterior = this.updateWeightPosterior(responsibilities, this.priorAlpha);

    // Update each component's posterior
    for (let k = 0; k < K; k++) {
      // Get effective sample size for this component
      const Nk = responsibilities.reduce((sum, r) => sum + r[k], 0);

      if (Nk < 1e-10) {
        // Component has no responsibility, keep current posterior
        updatedComponents.push(currentComponents[k]);
        continue;
      }

      // Create weighted data for this component
      const weights = responsibilities.map((r) => r[k]);

      // Use NormalConjugate for Bayesian update
      const conjugate = new NormalConjugate();

      // Create StandardData for weighted fitting
      const weightedData = StandardDataFactory.fromUserLevel(
        values.map((v, i) => ({
          userId: `vbem_${k}_${i}`,
          value: v,
          converted: true,
        }))
      );

      // Perform weighted fit to get updated posterior
      const result = await conjugate.fitWeighted(weightedData, weights, options);

      updatedComponents.push({
        posterior: result.posterior as NormalPosterior,
        weight: Nk / values.length, // This is for reference only
        prior: currentComponents[k].prior, // Preserve prior for KL computation
      });
    }

    return {
      components: updatedComponents,
      weightPosterior,
    };
  }

  /**
   * Compute log probability of a data point under a component
   */
  protected computeComponentLogProb(value: number, component: NormalMixtureComponent): number {
    return component.posterior.logPdf(value);
  }

  /**
   * Compute KL divergence between component posterior and prior
   */
  protected computeComponentKL(component: NormalMixtureComponent): number {
    // NormalPosterior has klDivergenceFromPrior method
    return component.posterior.klDivergenceFromPrior(component.prior);
  }

  /**
   * Helper to assign data points to nearest centers
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
   * Main fit method
   */
  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const start = performance.now();

    // Validate data
    this.validateStandardData(data);

    // Extract values
    let values: number[];
    if (data.type === 'user-level' && data.userLevel) {
      values = data.userLevel.users.map((u) => u.value);
    } else {
      throw new TycheError(ErrorCode.INVALID_DATA, 'NormalMixtureVBEM requires user-level data', {
        actualType: data.type,
      });
    }

    const n = values.length;

    // Determine number of components
    const requestedComponents = config.components || 2;
    const maxViableComponents = Math.floor(n / 10); // Need ~10 points minimum per component
    const actualComponents = Math.min(requestedComponents, maxViableComponents);

    // Log if we reduced components
    if (actualComponents < requestedComponents) {
      console.warn(
        `NormalMixtureVBEM: Reduced components from ${requestedComponents} to ${actualComponents} due to data size (${n} points)`
      );
    }

    // Fallback for insufficient data
    if (actualComponents <= 1) {
      console.warn(
        `NormalMixtureVBEM: Insufficient data for mixture (${n} points), falling back to single Normal`
      );
      const singleComponent = new NormalConjugate();
      return singleComponent.fit(data, config, options);
    }

    // Run VBEM algorithm
    const vbemResult = await this.runVBEM(values, actualComponents, options);

    const runtime = performance.now() - start;

    return {
      posterior: new NormalMixturePosterior(
        vbemResult.components as NormalMixtureComponent[],
        vbemResult.weightPosterior,
        n
      ),
      diagnostics: {
        converged: vbemResult.converged,
        iterations: vbemResult.iterations,
        runtime,
        elboHistory: vbemResult.elboHistory,
        modelType: 'normal-mixture-vbem',
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

    // Additional checks specific to Normal mixture
    if (config.structure === 'simple' && config.type !== 'normal') {
      return false;
    }

    if (config.structure === 'compound' && config.valueType !== 'normal') {
      return false;
    }

    // Must have user-level data
    if (data.type !== 'user-level' || !data.userLevel) {
      return false;
    }

    // Check component count
    const components = config.valueComponents || config.components || 1;
    return components >= 1 && components <= 4;
  }
}
