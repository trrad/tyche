/**
 * Base class for Mixture Models using Variational Bayes EM (VBEM)
 *
 * This implements the shared logic for all mixture models:
 * - E-step: Compute responsibilities (unchanged from standard EM)
 * - M-step: Update both weight posteriors (Dirichlet) and component posteriors
 * - ELBO computation for convergence checking
 * - Full Bayesian treatment - no point estimates
 */

import { InferenceEngine, EngineCapabilities } from '../../base/InferenceEngine';
import { FitOptions, InferenceResult, Posterior, ModelConfig } from '../../base/types';
import { StandardData } from '../../../core/data/StandardData';
import { TycheError, ErrorCode } from '../../../core/errors';
import { DirichletDistribution } from '../../../core/distributions/DirichletDistribution';

/**
 * Component info including posterior, prior, and weight
 */
export interface MixtureComponent {
  posterior: Posterior;
  prior?: any; // Prior parameters (type depends on component type)
  weight: number; // Expected weight E[πₖ]
}

/**
 * Abstract base class for mixture models with VBEM
 */
export abstract class MixtureEMBase extends InferenceEngine {
  protected priorAlpha: number = 1.0; // Symmetric Dirichlet prior (uniform by default)
  protected readonly minVariance = 1e-10;
  protected readonly logTwoPi = Math.log(2 * Math.PI);

  constructor(name: string) {
    super(name);
  }

  /**
   * Initialize components for the mixture
   * Must be implemented by subclasses
   */
  protected abstract initializeComponents(
    values: number[],
    numComponents: number,
    options?: FitOptions
  ): Promise<MixtureComponent[]>;

  /**
   * VBEM M-step: Update component posteriors and weight posterior
   * Must be implemented by subclasses
   *
   * @param values Original data values
   * @param responsibilities E[Z_ik] from E-step
   * @param currentComponents Current component estimates
   * @param options Fitting options
   * @returns Updated components and weight posterior
   */
  protected abstract mStepVBEM(
    values: number[],
    responsibilities: number[][],
    currentComponents: MixtureComponent[],
    options?: FitOptions
  ): Promise<{
    components: MixtureComponent[];
    weightPosterior: DirichletDistribution;
  }>;

  /**
   * Compute log probability of a data point under a component
   * Must be implemented by subclasses
   */
  protected abstract computeComponentLogProb(value: number, component: MixtureComponent): number;

  /**
   * Compute KL divergence between component posterior and prior
   * Must be implemented by subclasses
   */
  protected abstract computeComponentKL(component: MixtureComponent): number;

  /**
   * E-step: Compute responsibilities using expected log weights
   * This is shared across all mixture models
   *
   * @param values Data values
   * @param components Current component estimates
   * @param weightPosterior Dirichlet posterior for weights
   * @returns Responsibilities and log-likelihood
   */
  protected eStep(
    values: number[],
    components: MixtureComponent[],
    weightPosterior: DirichletDistribution
  ): {
    responsibilities: number[][];
    logLikelihood: number;
  } {
    const n = values.length;
    const K = components.length;
    const responsibilities: number[][] = Array(n)
      .fill(null)
      .map(() => Array(K).fill(0));

    // Get expected log weights from Dirichlet posterior
    const expectedLogWeights = weightPosterior.expectedLogWeights();

    let logLikelihood = 0;

    for (let i = 0; i < n; i++) {
      const logProbs: number[] = [];

      for (let k = 0; k < K; k++) {
        // Use expected log weight instead of log(weight)
        const logProb =
          expectedLogWeights[k] + this.computeComponentLogProb(values[i], components[k]);
        logProbs.push(logProb);
      }

      // Log-sum-exp trick for numerical stability
      const maxLogProb = Math.max(...logProbs);
      if (!isFinite(maxLogProb)) {
        // Handle numerical issues
        for (let k = 0; k < K; k++) {
          responsibilities[i][k] = 1 / K;
        }
        continue;
      }

      const logSumExp =
        maxLogProb + Math.log(logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0));

      logLikelihood += logSumExp;

      // Compute responsibilities
      for (let k = 0; k < K; k++) {
        responsibilities[i][k] = Math.exp(logProbs[k] - logSumExp);
        // Ensure numerical stability
        if (isNaN(responsibilities[i][k]) || responsibilities[i][k] < 0) {
          responsibilities[i][k] = 0;
        }
      }

      // Normalize to ensure sum to 1
      const respSum = responsibilities[i].reduce((a, b) => a + b, 0);
      if (respSum > 0) {
        for (let k = 0; k < K; k++) {
          responsibilities[i][k] /= respSum;
        }
      }
    }

    return { responsibilities, logLikelihood };
  }

  /**
   * Compute ELBO (Evidence Lower Bound) for convergence checking
   * ELBO = E_q[log p(X,Z,θ,π)] - E_q[log q(Z,θ,π)]
   *
   * @param values Data values
   * @param responsibilities E[Z_ik]
   * @param components Component posteriors
   * @param weightPosterior Dirichlet posterior
   * @param priorWeightPosterior Prior Dirichlet
   * @returns ELBO value
   */
  protected computeELBO(
    values: number[],
    responsibilities: number[][],
    components: MixtureComponent[],
    weightPosterior: DirichletDistribution,
    priorWeightPosterior: DirichletDistribution
  ): number {
    const n = values.length;
    const K = components.length;

    // 1. Expected log-likelihood: E_q[log p(X|Z,θ)]
    let expectedLogLikelihood = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        if (responsibilities[i][k] > 0) {
          expectedLogLikelihood +=
            responsibilities[i][k] * this.computeComponentLogProb(values[i], components[k]);
        }
      }
    }

    // 2. Expected log prior on Z: E_q[log p(Z|π)]
    const expectedLogWeights = weightPosterior.expectedLogWeights();
    let expectedLogPriorZ = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        if (responsibilities[i][k] > 0) {
          expectedLogPriorZ += responsibilities[i][k] * expectedLogWeights[k];
        }
      }
    }

    // 3. KL divergence for weights: KL(q(π)||p(π))
    const klWeights = weightPosterior.klDivergence(priorWeightPosterior);

    // 4. KL divergence for components: Σ_k KL(q(θ_k)||p(θ_k))
    let klComponents = 0;
    for (let k = 0; k < K; k++) {
      klComponents += this.computeComponentKL(components[k]);
    }

    // 5. Entropy of responsibilities: H[q(Z)]
    let entropyZ = 0;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < K; k++) {
        if (responsibilities[i][k] > 0) {
          entropyZ -= responsibilities[i][k] * Math.log(responsibilities[i][k]);
        }
      }
    }

    // Full ELBO = expected log-likelihood + expected log prior - KL divergences + entropy
    const elbo = expectedLogLikelihood + expectedLogPriorZ - klWeights - klComponents + entropyZ;

    // Debug logging (can be removed later)
    // Only log in development/test environments
    if (
      typeof globalThis !== 'undefined' &&
      (globalThis as any).NODE_ENV === 'test' &&
      elbo < -1000
    ) {
      console.log('ELBO components:', {
        expectedLogLikelihood,
        expectedLogPriorZ,
        klWeights,
        klComponents,
        entropyZ,
        total: elbo,
      });
    }

    return elbo;
  }

  /**
   * Check convergence based on ELBO change
   */
  protected checkConvergence(
    currentELBO: number,
    previousELBO: number,
    tolerance: number
  ): boolean {
    // ELBO should increase monotonically (up to numerical error)
    if (currentELBO < previousELBO - 1e-10) {
      console.warn('ELBO decreased:', currentELBO - previousELBO, '- possible numerical issues');
    }

    return Math.abs(currentELBO - previousELBO) < tolerance;
  }

  /**
   * K-means++ initialization
   * Shared utility for component initialization
   */
  protected kMeansPlusPlus(data: number[], k: number): number[] {
    const n = data.length;
    const centers: number[] = [];

    // Choose first center randomly
    centers.push(data[Math.floor(Math.random() * n)]);

    // Choose remaining centers
    for (let i = 1; i < k; i++) {
      const distances = data.map((x) => {
        const minDist = Math.min(...centers.map((c) => Math.abs(x - c)));
        return minDist * minDist;
      });

      // Sample proportional to squared distance
      const totalDist = distances.reduce((a, b) => a + b, 0);
      if (totalDist === 0) {
        // All points are at centers, pick randomly
        centers.push(data[Math.floor(Math.random() * n)]);
        continue;
      }

      const probs = distances.map((d) => d / totalDist);

      let cumSum = 0;
      const r = Math.random();
      for (let j = 0; j < n; j++) {
        cumSum += probs[j];
        if (r <= cumSum) {
          centers.push(data[j]);
          break;
        }
      }
    }

    return centers;
  }

  /**
   * Run the VBEM algorithm
   * Shared main loop for all mixture models
   */
  protected async runVBEM(
    values: number[],
    numComponents: number,
    options?: FitOptions
  ): Promise<{
    components: MixtureComponent[];
    weightPosterior: DirichletDistribution;
    converged: boolean;
    iterations: number;
    elboHistory: number[];
  }> {
    const maxIterations = options?.maxIterations || 100;
    const tolerance = options?.tolerance || 1e-6;

    // Initialize components
    let components = await this.initializeComponents(values, numComponents, options);

    // Initialize weight posterior with uniform prior
    const priorAlphas = new Array(numComponents).fill(this.priorAlpha);
    const priorWeightPosterior = new DirichletDistribution(priorAlphas);
    let weightPosterior = priorWeightPosterior;

    const elboHistory: number[] = [];
    let previousELBO = -Infinity;
    let converged = false;
    let iterations = 0;

    for (iterations = 0; iterations < maxIterations; iterations++) {
      // E-step: compute responsibilities
      const { responsibilities, logLikelihood } = this.eStep(values, components, weightPosterior);

      // M-step: update posteriors
      const mStepResult = await this.mStepVBEM(values, responsibilities, components, options);
      components = mStepResult.components;
      weightPosterior = mStepResult.weightPosterior;

      // Compute ELBO
      const elbo = this.computeELBO(
        values,
        responsibilities,
        components,
        weightPosterior,
        priorWeightPosterior
      );
      elboHistory.push(elbo);

      // Check convergence
      if (this.checkConvergence(elbo, previousELBO, tolerance)) {
        converged = true;
        break;
      }

      previousELBO = elbo;

      // Optional progress callback
      if (options?.onProgress) {
        options.onProgress({
          stage: 'VBEM iteration',
          progress: (iterations + 1) / maxIterations,
          iteration: iterations + 1,
          totalIterations: maxIterations,
        });
      }
    }

    return {
      components,
      weightPosterior,
      converged,
      iterations: iterations + 1,
      elboHistory,
    };
  }

  /**
   * Compute effective sample size for each component
   * N_k = Σᵢ responsibilities[i][k]
   */
  protected computeEffectiveSampleSizes(responsibilities: number[][]): number[] {
    const K = responsibilities[0].length;
    const Nk: number[] = new Array(K).fill(0);

    for (const resp of responsibilities) {
      for (let k = 0; k < K; k++) {
        Nk[k] += resp[k];
      }
    }

    return Nk;
  }

  /**
   * Update Dirichlet posterior for weights
   * α_post[k] = α_prior[k] + N_k
   */
  protected updateWeightPosterior(
    responsibilities: number[][],
    priorAlpha: number = 1.0
  ): DirichletDistribution {
    const Nk = this.computeEffectiveSampleSizes(responsibilities);
    const posteriorAlpha = Nk.map((nk) => priorAlpha + nk);

    return new DirichletDistribution(posteriorAlpha);
  }

  /**
   * Handle degenerate components (empty or near-empty)
   */
  protected handleDegenerateComponents(
    components: MixtureComponent[],
    effectiveSampleSizes: number[],
    values: number[]
  ): MixtureComponent[] {
    const minEffectiveSize = 1e-10;

    for (let k = 0; k < components.length; k++) {
      if (effectiveSampleSizes[k] < minEffectiveSize) {
        // Reinitialize degenerate component randomly
        console.warn(
          `Component ${k} is degenerate (N_k = ${effectiveSampleSizes[k]}), reinitializing`
        );

        // Pick a random data point as new center
        // In subclasses, this would create a new component around that point
        const randomIdx = Math.floor(Math.random() * values.length);
        // Subclasses will override this behavior
      }
    }

    return components;
  }
}
