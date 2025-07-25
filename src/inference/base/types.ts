/**
 * Core types for Tyche inference engine
 * Extracted from vi-engine.ts to enable modular inference algorithms
 */

import { RNG } from '../../core/utils/math/random';

/**
 * Probability distribution interface for all posterior distributions
 */
export interface Distribution {
  logProb(value: number): number;
  sample(rng?: RNG): number;
  mean(): number;
  variance(): number;
}

/**
 * Base interface for posterior distributions with consistent API
 */
export interface Posterior {
  /** Get the posterior mean(s) */
  mean(): number[];
  /** Get the posterior variance(s) */
  variance(): number[];
  /** Sample from the posterior - returns array for consistency */
  sample(): number[];
  /** Get credible interval(s) at specified level */
  credibleInterval(level: number): Array<[number, number]>;
}

/**
 * Result of inference including diagnostics
 */
export interface InferenceResult {
    posterior: Posterior;
    diagnostics: {
      converged: boolean;
      iterations: number;
      finalELBO?: number;           // For VI
      finalLogLikelihood?: number;  // For EM
      elboHistory?: number[];
      likelihoodHistory?: number[]; // For EM
      acceptanceRate?: number;      // For MCMC
      runtime?: number;
    };
  }

/**
 * Common data input format for all models
 */
export interface DataInput {
  /** Data points or summary statistics */
  data: number[] | BinomialData | SummaryStats;
  /** Optional configuration */
  config?: {
    numComponents?: number;
    [key: string]: any;
  };
}

/**
 * Binomial data format for Beta-Binomial model
 */
export interface BinomialData {
  successes: number;
  trials: number;
}

/**
 * Summary statistics format
 */
export interface SummaryStats {
  n: number;
  mean?: number;
  variance?: number;
  sum?: number;
  sumSquares?: number;
}

/**
 * Prior specification for all models
 */
export interface PriorSpec {
  type: 'beta' | 'normal' | 'gamma' | 'dirichlet' | 'normal-inverse-gamma';
  params: number[];
}

/**
 * Common options for all model fitting
 */
export interface FitOptions {
  priorParams?: PriorSpec;
  maxIterations?: number;
  tolerance?: number;
  warmStart?: boolean;
  verbose?: boolean;
  seed?: number;
}

/**
 * Base interface for all inference engines
 */
export interface InferenceEngine {
  /**
   * Fit a model to data
   * @param data Input data in standardized format
   * @param options Optional fitting parameters
   * @returns Inference result with posterior and diagnostics
   */
  fit(data: DataInput, options?: FitOptions): Promise<InferenceResult>;
  
  /**
   * Get a description of the inference method
   */
  getDescription(): string;
  
  /**
   * Check if this engine can handle the given data
   */
  canHandle(data: DataInput): boolean;
}

/**
 * Type aliases for backward compatibility
 */
export type VIResult = InferenceResult;  // Legacy name from vi-engine.ts