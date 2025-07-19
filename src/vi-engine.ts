// Tyche VI Engine: Production-Ready Implementation with Numerical Stability Fixes
// Browser-optimized variational inference with proper error handling

import jStat from 'jstat';
import { Random, MersenneTwister19937 } from 'random-js';
import { AdamOptimizer } from './optimizers/adam-optimizer';

// ============================================
// Core Types and Interfaces
// ============================================

/**
 * Probability distribution interface for all posterior distributions
 */
export interface Distribution {
  logProb(value: number): number;
  sample(): number;
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
 * Result of variational inference including diagnostics
 */
export interface VIResult {
  posterior: Posterior;
  diagnostics: {
    converged: boolean;
    iterations: number;
    finalELBO: number;
    elboHistory?: number[];
    acceptanceRate?: number;
  };
}

/**
 * Common data input format for all models
 */
export interface DataInput {
  /** Data points or summary statistics */
  data: number[] | { successes?: number; trials?: number };
  /** Optional configuration */
  config?: {
    numComponents?: number;
    [key: string]: any;
  };
}

/**
 * Prior specification for all models
 */
export interface PriorSpec {
  type: 'beta' | 'normal' | 'gamma' | 'dirichlet';
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
}

// ============================================
// Global random number generator
// ============================================

// Use the same RNG throughout for reproducibility
const randomEngine = MersenneTwister19937.autoSeed();
export const random = new Random(randomEngine);

// ============================================
// Numerical Utilities
// ============================================

export class NumericalUtils {
  /**
   * Numerically stable log-sum-exp computation
   */
  static logSumExp(logValues: number[]): number {
    if (logValues.length === 0) return -Infinity;
    
    const maxVal = Math.max(...logValues);
    if (!isFinite(maxVal)) return maxVal;
    
    const sumExp = logValues.reduce((sum, val) => {
      return sum + Math.exp(val - maxVal);
    }, 0);
    
    return maxVal + Math.log(sumExp);
  }
  
  /**
   * Gradient clipping to prevent explosions
   */
  static clipGradient(grad: number[] | Float64Array, maxNorm: number = 10.0): number[] {
    // Handle both arrays and typed arrays
    if (!grad || typeof grad.length === 'undefined') {
      return [];
    }
    
    const gradArray = Array.isArray(grad) ? grad : Array.from(grad);
    const norm = Math.sqrt(gradArray.reduce((sum, g) => sum + g * g, 0));
    
    if (norm > maxNorm) {
      const scale = maxNorm / norm;
      return gradArray.map(g => g * scale);
    }
    return gradArray;
  }
  
  /**
   * Log gamma function using jStat
   */
  static logGamma(x: number): number {
    return jStat.gammaln(x);
  }
  
  /**
   * Log beta function for numerical stability
   */
  static logBeta(a: number, b: number): number {
    return jStat.gammaln(a) + jStat.gammaln(b) - jStat.gammaln(a + b);
  }
  
  /**
   * Safe log that returns -Infinity for non-positive values
   */
  static safeLog(x: number): number {
    return x > 0 ? Math.log(x) : -Infinity;
  }
}

// ============================================
// Tier 1: Conjugate Models (Exact Updates)
// ============================================

/**
 * Beta posterior for Beta-Binomial model
 */
class BetaPosterior implements Posterior {
  constructor(
    private alpha: number,
    private beta: number
  ) {}
  
  mean(): number[] {
    return [this.alpha / (this.alpha + this.beta)];
  }
  
  variance(): number[] {
    const n = this.alpha + this.beta;
    return [(this.alpha * this.beta) / (n * n * (n + 1))];
  }
  
  sample(): number[] {
    return [jStat.beta.sample(this.alpha, this.beta)];
  }
  
  credibleInterval(level: number): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    return [[
      jStat.beta.inv(alpha, this.alpha, this.beta),
      jStat.beta.inv(1 - alpha, this.alpha, this.beta)
    ]];
  }
}

/**
 * Beta-Binomial conjugate VI
 */
export class BetaBinomialVI {
  private priorAlpha = 1;
  private priorBeta = 1;
  
  constructor(options: FitOptions = {}) {
    if (options.priorParams?.type === 'beta') {
      this.priorAlpha = options.priorParams.params[0];
      this.priorBeta = options.priorParams.params[1];
    }
  }
  
  /**
   * Fit Beta-Binomial model (exact conjugate update)
   */
  async fit(input: DataInput, options?: FitOptions): Promise<VIResult> {
    let successes: number;
    let trials: number;
    
    if (typeof input.data === 'object' && !Array.isArray(input.data)) {
      successes = input.data.successes || 0;
      trials = input.data.trials || 0;
    } else {
      throw new Error('Beta-Binomial requires {successes, trials} data format');
    }
    
    if (trials < 0 || successes < 0 || successes > trials) {
      throw new Error('Invalid data: successes must be between 0 and trials');
    }
    
    // Exact conjugate update
    const posteriorAlpha = this.priorAlpha + successes;
    const posteriorBeta = this.priorBeta + (trials - successes);
    
    // Compute ELBO (exact for conjugate case)
    const elbo = NumericalUtils.logBeta(posteriorAlpha, posteriorBeta) - 
                 NumericalUtils.logBeta(this.priorAlpha, this.priorBeta);
    
    return {
      posterior: new BetaPosterior(posteriorAlpha, posteriorBeta),
      diagnostics: {
        converged: true,
        iterations: 1,
        finalELBO: elbo
      }
    };
  }
}

// ============================================
// Tier 2: EM/Closed-Form VI Models
// ============================================

interface GaussianComponent {
  mean: number;
  variance: number;
  weight: number;
}

class NormalMixturePosterior implements Posterior {
  constructor(private components: GaussianComponent[]) {}
  
  mean(): number[] {
    // Return means of each component
    return this.components.map(c => c.mean);
  }
  
  variance(): number[] {
    // Return variances of each component
    return this.components.map(c => c.variance);
  }
  
  sample(): number[] {
    // Sample component, then sample from it
    const weights = this.components.map(c => c.weight);
    const cumWeights = weights.reduce((acc, w, i) => {
      acc.push((acc[i - 1] || 0) + w);
      return acc;
    }, [] as number[]);
    
    const u = random.real(0, 1);
    let component = 0;
    for (let i = 0; i < cumWeights.length; i++) {
      if (u <= cumWeights[i]) {
        component = i;
        break;
      }
    }
    
    const comp = this.components[component];
    return [jStat.normal.sample(comp.mean, Math.sqrt(comp.variance))];
  }
  
  credibleInterval(level: number): Array<[number, number]> {
    // For mixture, return overall interval based on samples
    const samples: number[] = [];
    for (let i = 0; i < 10000; i++) {
      samples.push(this.sample()[0]);
    }
    samples.sort((a, b) => a - b);
    
    const alpha = (1 - level) / 2;
    const lowerIdx = Math.floor(alpha * samples.length);
    const upperIdx = Math.floor((1 - alpha) * samples.length);
    
    return [[samples[lowerIdx], samples[upperIdx]]];
  }
}

/**
 * Normal mixture model via EM algorithm
 */
export class NormalMixtureEM {
  private numComponents = 2;
  private maxIterations = 100;
  private tolerance = 1e-6;
  private minVariance = 1e-6;
  
  constructor(options: FitOptions = {}) {
    if (options.maxIterations) this.maxIterations = options.maxIterations;
    if (options.tolerance) this.tolerance = options.tolerance;
  }
  
  /**
   * Fit normal mixture model using EM
   */
  async fit(input: DataInput, options?: FitOptions): Promise<VIResult> {
    let data: number[];
    
    if (Array.isArray(input.data)) {
      data = input.data;
    } else {
      throw new Error('Normal mixture requires array of values');
    }
    
    if (data.length === 0) {
      throw new Error('Data cannot be empty');
    }
    
    // Get number of components from config
    if (input.config?.numComponents) {
      this.numComponents = input.config.numComponents;
    }
    
    if (this.numComponents > data.length) {
      throw new Error('Number of components cannot exceed data size');
    }
    
    // Initialize with k-means++
    let components = this.initializeKMeansPlusPlus(data, this.numComponents);
    const elboHistory: number[] = [];
    let converged = false;
    let iterations = 0;
    
    for (iterations = 0; iterations < this.maxIterations; iterations++) {
      // E-step
      const responsibilities = this.computeResponsibilities(data, components);
      
      // M-step
      const newComponents = this.updateParameters(data, responsibilities);
      
      // Compute ELBO
      const elbo = this.computeELBO(data, newComponents);
      elboHistory.push(elbo);
      
      // Check convergence
      if (iterations > 0) {
        const elboChange = Math.abs(elbo - elboHistory[iterations - 1]);
        if (elboChange < this.tolerance) {
          converged = true;
          break;
        }
      }
      
      components = newComponents;
    }
    
    return {
      posterior: new NormalMixturePosterior(components),
      diagnostics: {
        converged,
        iterations,
        finalELBO: elboHistory[elboHistory.length - 1],
        elboHistory
      }
    };
  }
  
  /**
   * Initialize components using k-means++
   */
  private initializeKMeansPlusPlus(data: number[], k: number): GaussianComponent[] {
    const n = data.length;
    const centers: number[] = [];
    
    // Choose first center randomly
    centers.push(data[random.integer(0, n - 1)]);
    
    // Choose remaining centers
    for (let i = 1; i < k; i++) {
      const distances = data.map(x => {
        const minDist = Math.min(...centers.map(c => Math.abs(x - c)));
        return minDist * minDist;
      });
      
      // Sample proportional to squared distance
      const totalDist = distances.reduce((a, b) => a + b, 0);
      const u = random.real(0, totalDist);
      
      let cumSum = 0;
      let idx = 0;
      for (let j = 0; j < n; j++) {
        cumSum += distances[j];
        if (cumSum >= u) {
          idx = j;
          break;
        }
      }
      centers.push(data[idx]);
    }
    
    // Initialize components with data variance
    const dataVar = jStat.variance(data, true);
    return centers.map(mean => ({
      mean,
      variance: Math.max(dataVar / k, this.minVariance),
      weight: 1.0 / k
    }));
  }
  
  /**
   * E-step: compute responsibilities
   */
  private computeResponsibilities(
    data: number[],
    components: GaussianComponent[]
  ): number[][] {
    const n = data.length;
    const k = components.length;
    const resp = Array(n).fill(0).map(() => Array(k).fill(0));
    
    for (let i = 0; i < n; i++) {
      const logProbs = components.map(c => {
        const logWeight = Math.log(Math.max(1e-10, c.weight));
        // Use log PDF to avoid numerical issues
        const z = (data[i] - c.mean) / Math.sqrt(c.variance);
        const logPdf = -0.5 * (Math.log(2 * Math.PI * c.variance) + z * z);
        return logWeight + logPdf;
      });
      
      const logSum = NumericalUtils.logSumExp(logProbs);
      
      for (let j = 0; j < k; j++) {
        resp[i][j] = Math.exp(logProbs[j] - logSum);
      }
    }
    
    return resp;
  }
  
  /**
   * M-step: update parameters
   */
  private updateParameters(
    data: number[],
    responsibilities: number[][]
  ): GaussianComponent[] {
    const n = data.length;
    const k = responsibilities[0].length;
    const components: GaussianComponent[] = [];
    
    for (let j = 0; j < k; j++) {
      // Compute soft counts
      const nj = responsibilities.reduce((sum, r) => sum + r[j], 0);
      
      // Update weight
      const weight = nj / n;
      
      // Update mean
      let mean = 0;
      for (let i = 0; i < n; i++) {
        mean += responsibilities[i][j] * data[i];
      }
      mean /= Math.max(nj, 1e-10);
      
      // Update variance
      let variance = 0;
      for (let i = 0; i < n; i++) {
        const diff = data[i] - mean;
        variance += responsibilities[i][j] * diff * diff;
      }
      variance /= Math.max(nj, 1e-10);
      variance = Math.max(variance, this.minVariance);
      
      components.push({ mean, variance, weight });
    }
    
    // Normalize weights
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    components.forEach(c => c.weight /= totalWeight);
    
    return components;
  }
  
  /**
   * Compute ELBO for EM algorithm
   */
  private computeELBO(data: number[], components: GaussianComponent[]): number {
    let elbo = 0;
    
    for (const x of data) {
      const logProbs = components.map(c => {
        const logWeight = Math.log(Math.max(1e-10, c.weight));
        const z = (x - c.mean) / Math.sqrt(c.variance);
        const logPdf = -0.5 * (Math.log(2 * Math.PI * c.variance) + z * z);
        return logWeight + logPdf;
      });
      
      elbo += NumericalUtils.logSumExp(logProbs);
    }
    
    return elbo;
  }
}

// ============================================
// Tier 3: Gradient-Based VI
// ============================================

interface ZILNParams {
  zeroLogitMean: number;      // Logit of zero probability
  zeroLogitLogVar: number;    // Log variance of zero probability
  valueMean: number;          // Mean of log-normal
  valueLogVar: number;        // Log variance of log-normal
  valueSigma: number;         // Standard deviation of log-normal (not log)
}

/**
 * Zero-inflated log-normal posterior
 */
class ZILNPosterior implements Posterior {
  constructor(private params: ZILNParams) {}
  
  /**
   * Get zero probability estimate
   */
  getZeroProbability(): number {
    // Sample many times and average for stable estimate
    const samples = 1000;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const logit = jStat.normal.sample(
        this.params.zeroLogitMean,
        Math.sqrt(Math.exp(this.params.zeroLogitLogVar))
      );
      sum += 1 / (1 + Math.exp(-logit));
    }
    return sum / samples;
  }
  
  /**
   * Get posterior means
   */
  mean(): number[] {
    const zeroProb = this.getZeroProbability();
    // Mean of log-normal: exp(μ + σ²/2)
    const valueMean = Math.exp(this.params.valueMean + Math.exp(this.params.valueLogVar) / 2);
    // Return [zero_probability, mean_of_nonzeros, overall_mean]
    return [zeroProb, valueMean, valueMean * (1 - zeroProb)];
  }
  
  /**
   * Get posterior variances
   */
  variance(): number[] {
    // Approximate variances using Monte Carlo
    const means = this.mean();
    const samples = 1000;
    let varZero = 0;
    let varValue = 0;
    let varOverall = 0;
    
    for (let i = 0; i < samples; i++) {
      const [isZero, value] = this.sampleOne();
      const zeroProb = isZero;
      varZero += Math.pow(zeroProb - means[0], 2);
      if (!isZero) {
        varValue += Math.pow(value - means[1], 2);
      }
      const overallValue = isZero ? 0 : value;
      varOverall += Math.pow(overallValue - means[2], 2);
    }
    
    return [varZero / samples, varValue / samples, varOverall / samples];
  }
  
  /**
   * Sample from posterior (internal helper)
   */
  private sampleOne(): [number, number] {
    // Sample zero indicator
    const zeroLogit = jStat.normal.sample(
      this.params.zeroLogitMean,
      Math.sqrt(Math.exp(this.params.zeroLogitLogVar))
    );
    const zeroProb = 1 / (1 + Math.exp(-zeroLogit));
    const isZero = random.real(0, 1) < zeroProb ? 1 : 0;
    
    // Sample value if not zero
    let value = 0;
    if (isZero === 0) {
      const logValue = jStat.normal.sample(
        this.params.valueMean,
        Math.sqrt(Math.exp(this.params.valueLogVar))
      );
      value = Math.exp(logValue);
    }
    
    return [isZero, value];
  }
  
  /**
   * Sample from posterior
   */
  sample(): number[] {
    const [isZero, value] = this.sampleOne();
    // Return [is_zero, value]
    return [isZero, value];
  }
  
  /**
   * Get credible intervals
   */
  credibleInterval(level: number): Array<[number, number]> {
    // Use Monte Carlo for credible intervals
    const samples = 10000;
    const zeroProbs: number[] = [];
    const values: number[] = [];
    const overallValues: number[] = [];
    
    for (let i = 0; i < samples; i++) {
      const zeroLogit = jStat.normal.sample(
        this.params.zeroLogitMean,
        Math.sqrt(Math.exp(this.params.zeroLogitLogVar))
      );
      const zeroProb = 1 / (1 + Math.exp(-zeroLogit));
      zeroProbs.push(zeroProb);
      
      // Sample value
      const logValue = jStat.normal.sample(
        this.params.valueMean,
        Math.sqrt(Math.exp(this.params.valueLogVar))
      );
      const value = Math.exp(logValue);
      values.push(value);
      
      // Overall value (including zeros)
      const isZero = random.real(0, 1) < zeroProb;
      overallValues.push(isZero ? 0 : value);
    }
    
    // Sort and extract quantiles
    const alpha = (1 - level) / 2;
    const lowerIdx = Math.floor(alpha * samples);
    const upperIdx = Math.floor((1 - alpha) * samples);
    
    zeroProbs.sort((a, b) => a - b);
    values.sort((a, b) => a - b);
    overallValues.sort((a, b) => a - b);
    
    return [
      [zeroProbs[lowerIdx], zeroProbs[upperIdx]],
      [values[lowerIdx], values[upperIdx]],
      [overallValues[lowerIdx], overallValues[upperIdx]]
    ];
  }
}

/**
 * Zero-inflated log-normal variational inference
 */
export class ZeroInflatedLogNormalVI {
  private learningRate = 0.001;  // Reduced learning rate for stability
  private maxIterations = 1000;
  private tolerance = 1e-6;
  private numSamples = 50;  // Increased samples for more stable ELBO
  
  constructor(options: FitOptions = {}) {
    if (options.maxIterations) this.maxIterations = options.maxIterations;
    if (options.tolerance) this.tolerance = options.tolerance;
  }
  
  /**
   * Fit zero-inflated log-normal model
   */
  async fit(input: DataInput, options?: FitOptions): Promise<VIResult> {
    // Extract data
    let data: number[];
    
    if (Array.isArray(input.data)) {
      data = input.data;
    } else {
      throw new Error('Zero-inflated log-normal requires array of values');
    }
    
    if (data.length === 0) {
      throw new Error('Data cannot be empty');
    }
    
    // Separate zeros and non-zeros
    const zeros = data.filter(x => x === 0).length;
    const nonZeros = data.filter(x => x > 0);
    const n = data.length;
    
    if (zeros === 0) {
      throw new Error('No zeros found in data - use standard LogNormal instead');
    }
    
    // Initialize parameters with better defaults
    let params: ZILNParams;
    
    // Special handling for all-zeros case
    if (nonZeros.length === 0) {
      params = {
        zeroLogitMean: 2.0,  // High logit for high zero probability
        zeroLogitLogVar: Math.log(0.1),  // Low uncertainty
        valueMean: 0,  // Doesn't matter much
        valueLogVar: Math.log(1),
        valueSigma: 1
      };
    } else {
      // Normal initialization
      const empiricalZeroProb = zeros / n;
      // Use logit transform with bounds to avoid infinity
      const boundedProb = Math.max(0.01, Math.min(0.99, empiricalZeroProb));
      
      params = {
        zeroLogitMean: Math.log(boundedProb / (1 - boundedProb)),
        zeroLogitLogVar: Math.log(0.5),
        valueMean: jStat.mean(nonZeros.map(x => Math.log(x))),
        valueLogVar: Math.log(0.5),
        valueSigma: Math.max(0.1, Math.sqrt(jStat.variance(nonZeros.map(x => Math.log(x)), true)))
      };
    }
    
    // Initialize optimizer with adaptive learning rate
    const optimizer = new AdamOptimizer({
      learningRate: this.learningRate,
      beta1: 0.9,
      beta2: 0.999,
      epsilon: 1e-8,
      gradientClip: 5.0  // Reduced clip value
    });
    
    const elboHistory: number[] = [];
    let converged = false;
    let iterations = 0;
    
    // Convert params to array for optimizer
    const paramsToArray = (p: ZILNParams) => [
      p.zeroLogitMean, p.zeroLogitLogVar, p.valueMean, p.valueLogVar, p.valueSigma
    ];
    
    const arrayToParams = (arr: number[]): ZILNParams => ({
      zeroLogitMean: arr[0],
      zeroLogitLogVar: Math.min(2, arr[1]),  // Cap log variance
      valueMean: arr[2],
      valueLogVar: Math.min(2, arr[3]),  // Cap log variance
      valueSigma: Math.max(0.01, Math.min(10, arr[4]))  // Bounded sigma
    });
    
    let paramArray = paramsToArray(params);
    let oldELBO = -Infinity;
    
    for (iterations = 0; iterations < this.maxIterations; iterations++) {
      // Estimate ELBO and gradients using finite differences
      const { elbo, gradients } = this.estimateELBOAndGradients(
        arrayToParams(paramArray), 
        data
      );
      
      // Store ELBO history
      elboHistory.push(elbo);
      
      // Check for convergence based on ELBO change
      if (iterations > 20) {
        const elboChange = Math.abs(elbo - oldELBO);
        const relativeChange = elboChange / (Math.abs(oldELBO) + 1e-10);
        
        if (relativeChange < this.tolerance) {
          converged = true;
          break;
        }
      }
      
      oldELBO = elbo;
      
      // Update parameters using optimizer
      const gradArray = paramsToArray(gradients);
      paramArray = optimizer.step(paramArray, gradArray);
    }
    
    // Final parameters
    params = arrayToParams(paramArray);
    
    return {
      posterior: new ZILNPosterior(params),
      diagnostics: {
        converged,
        iterations,
        finalELBO: elboHistory[elboHistory.length - 1],
        elboHistory
      }
    };
  }
  
  /**
   * Estimate ELBO and gradients using finite differences
   */
  private estimateELBOAndGradients(
    params: ZILNParams, 
    data: number[]
  ): { elbo: number; gradients: ZILNParams } {
    // Compute base ELBO
    const baseELBO = this.estimateELBO(params, data);
    
    // Use central differences for better accuracy
    const epsilon = 1e-5;
    const gradients: ZILNParams = {
      zeroLogitMean: 0,
      zeroLogitLogVar: 0,
      valueMean: 0,
      valueLogVar: 0,
      valueSigma: 0
    };
    
    // Compute gradients via central differences
    const paramNames: (keyof ZILNParams)[] = [
      'zeroLogitMean', 'zeroLogitLogVar', 'valueMean', 'valueLogVar', 'valueSigma'
    ];
    
    for (const paramName of paramNames) {
      const perturbedParamsPlus = { ...params };
      const perturbedParamsMinus = { ...params };
      
      // Special handling for variance parameters
      if (paramName === 'valueSigma') {
        perturbedParamsPlus[paramName] = Math.max(0.01, params[paramName] + epsilon);
        perturbedParamsMinus[paramName] = Math.max(0.01, params[paramName] - epsilon);
      } else {
        perturbedParamsPlus[paramName] = params[paramName] + epsilon;
        perturbedParamsMinus[paramName] = params[paramName] - epsilon;
      }
      
      const elboPlus = this.estimateELBO(perturbedParamsPlus, data);
      const elboMinus = this.estimateELBO(perturbedParamsMinus, data);
      
      // Central difference
      gradients[paramName] = (elboPlus - elboMinus) / (2 * epsilon);
    }
    
    return { elbo: baseELBO, gradients };
  }
  
  /**
   * Estimate ELBO using Monte Carlo
   */
  private estimateELBO(params: ZILNParams, data: number[]): number {
    let elboSum = 0;
    let validSamples = 0;
    
    // Use more samples for better stability
    const actualSamples = this.numSamples;
    
    for (let s = 0; s < actualSamples; s++) {
      try {
        const { sample, logQ } = this.sampleVariational(params);
        const logP = this.computeLogJoint(sample, data, params);
        
        if (isFinite(logP) && isFinite(logQ)) {
          elboSum += logP - logQ;
          validSamples++;
        }
      } catch (e) {
        // Skip bad samples
        continue;
      }
    }
    
    // Return average over valid samples
    return validSamples > 0 ? elboSum / validSamples : -1e10;
  }
  
  /**
   * Sample from variational distribution
   */
  private sampleVariational(params: ZILNParams): { sample: any; logQ: number } {
    // Ensure valid variances
    const zeroLogitStd = Math.sqrt(Math.exp(Math.min(2, params.zeroLogitLogVar)));
    const valueMuStd = Math.sqrt(Math.exp(Math.min(2, params.valueLogVar)));
    
    // Sample from variational distribution
    const zeroLogit = jStat.normal.sample(params.zeroLogitMean, zeroLogitStd);
    const valueMu = jStat.normal.sample(params.valueMean, valueMuStd);
    
    const sample = { 
      zeroLogit,
      valueMu,
      zeroProb: 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, zeroLogit))))
    };
    
    // Compute log q(z|λ) with numerical stability
    const logQ1 = -0.5 * Math.log(2 * Math.PI) - Math.log(zeroLogitStd) - 
                  0.5 * Math.pow((zeroLogit - params.zeroLogitMean) / zeroLogitStd, 2);
    const logQ2 = -0.5 * Math.log(2 * Math.PI) - Math.log(valueMuStd) - 
                  0.5 * Math.pow((valueMu - params.valueMean) / valueMuStd, 2);
    
    return { sample, logQ: logQ1 + logQ2 };
  }
  
  /**
   * Compute log joint probability with numerical stability
   */
  private computeLogJoint(sample: any, data: number[], params: ZILNParams): number {
    let logP = 0;
    
    // Prior: standard normal on transformed parameters
    const prior1 = -0.5 * Math.log(2 * Math.PI) - 0.5 * sample.zeroLogit * sample.zeroLogit;
    const prior2 = -0.5 * Math.log(2 * Math.PI) - 0.5 * sample.valueMu * sample.valueMu;
    logP += prior1 + prior2;
    
    // Likelihood
    for (const x of data) {
      if (x === 0) {
        // Log probability of zero
        logP += Math.log(Math.max(1e-10, sample.zeroProb));
      } else {
        // Log probability of non-zero value
        logP += Math.log(Math.max(1e-10, 1 - sample.zeroProb));
        
        // Log-normal log PDF computed manually for stability
        if (params.valueSigma > 0) {
          const logX = Math.log(x);
          const z = (logX - sample.valueMu) / params.valueSigma;
          const logPdf = -logX - Math.log(params.valueSigma) - 0.5 * Math.log(2 * Math.PI) - 0.5 * z * z;
          logP += logPdf;
        } else {
          logP += -1e10;  // Invalid sigma
        }
      }
    }
    
    return logP;
  }
}

// ============================================
// Unified VI Engine
// ============================================

/**
 * Main variational inference engine with consistent API
 */
export class VariationalInferenceEngine {
  /**
   * Fit a model using variational inference
   * @param modelType Type of model to fit
   * @param input Standardized data input
   * @param options Optional fitting options
   * @returns VI result with posterior and diagnostics
   */
  async fit(
    modelType: string, 
    input: DataInput,
    options?: FitOptions
  ): Promise<VIResult> {
    switch (modelType) {
      case 'beta-binomial':
        const bbVI = new BetaBinomialVI(options);
        return await bbVI.fit(input, options);
        
      case 'normal-mixture':
        const nmEM = new NormalMixtureEM(options);
        return await nmEM.fit(input, options);
        
      case 'zero-inflated-lognormal':
        const zilnVI = new ZeroInflatedLogNormalVI(options);
        return await zilnVI.fit(input, options);
        
      default:
        throw new Error(`Unknown model type: ${modelType}`);
    }
  }
  
  /**
   * Create a standardized data input from various formats
   */
  static createDataInput(
    data: any,
    config?: any
  ): DataInput {
    // Helper to standardize input formats
    if (typeof data === 'object' && !Array.isArray(data)) {
      // Summary statistics format
      return { data, config };
    } else if (Array.isArray(data)) {
      // Raw data format
      return { data, config };
    } else {
      throw new Error('Invalid data format');
    }
  }
}