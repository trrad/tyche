// Tyche VI Engine: Production-Ready Implementation with Numerical Stability Fixes
// Browser-optimized variational inference with proper error handling

import jStat from 'jstat';
import { Random, MersenneTwister19937 } from 'random-js';
import { AdamOptimizer } from '../optimizers/adam-optimizer';

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
// Tier 2: EM Algorithms  
// ============================================

interface MixtureComponent {
  mean: number;
  variance: number;
  weight: number;
}

/**
 * Mixture model posterior
 */
class MixturePosterior implements Posterior {
  constructor(private components: MixtureComponent[]) {}
  
  mean(): number[] {
    return this.components.map(c => c.mean);
  }
  
  variance(): number[] {
    return this.components.map(c => c.variance);
  }
  
  sample(): number[] {
    // Sample a component based on weights
    const weights = this.components.map(c => c.weight);
    const cumWeights = [];
    let sum = 0;
    for (const w of weights) {
      sum += w;
      cumWeights.push(sum);
    }
    
    const u = random.real(0, 1);
    let componentIdx = 0;
    for (let i = 0; i < cumWeights.length; i++) {
      if (u <= cumWeights[i]) {
        componentIdx = i;
        break;
      }
    }
    
    const comp = this.components[componentIdx];
    return [jStat.normal.sample(comp.mean, Math.sqrt(comp.variance))];
  }
  
  credibleInterval(level: number): Array<[number, number]> {
    // For each component mean
    const alpha = (1 - level) / 2;
    return this.components.map(c => {
      const z = jStat.normal.inv(1 - alpha, 0, 1);
      const std = Math.sqrt(c.variance);
      return [c.mean - z * std, c.mean + z * std] as [number, number];
    });
  }
}

/**
 * Normal mixture EM algorithm
 */
export class NormalMixtureEM {
  private maxIterations = 100;
  private tolerance = 1e-6;
  private numComponents = 2;
  
  constructor(options?: FitOptions) {
    if (options?.maxIterations) this.maxIterations = options.maxIterations;
    if (options?.tolerance) this.tolerance = options.tolerance;
  }
  
  /**
   * Initialize using K-means++
   */
  private initializeKMeansPlusPlus(data: number[], k: number): number[] {
    const centers: number[] = [];
    
    // First center randomly
    centers.push(data[Math.floor(random.real(0, 1) * data.length)]);
    
    // Remaining centers
    for (let i = 1; i < k; i++) {
      const distances = data.map(x => {
        return Math.min(...centers.map(c => Math.abs(x - c))) ** 2;
      });
      
      const totalDist = distances.reduce((a, b) => a + b, 0);
      const r = random.real(0, 1) * totalDist;
      
      let cumSum = 0;
      for (let j = 0; j < data.length; j++) {
        cumSum += distances[j];
        if (cumSum >= r) {
          centers.push(data[j]);
          break;
        }
      }
    }
    
    return centers;
  }
  
  /**
   * E-step: compute responsibilities
   */
  private eStep(data: number[], components: MixtureComponent[]): number[][] {
    const n = data.length;
    const k = components.length;
    const responsibilities: number[][] = [];
    
    for (let i = 0; i < n; i++) {
      const logProbs: number[] = [];
      
      for (const comp of components) {
        const logWeight = Math.log(comp.weight);
        const logDensity = -0.5 * Math.log(2 * Math.PI * comp.variance) - 
                          0.5 * Math.pow(data[i] - comp.mean, 2) / comp.variance;
        logProbs.push(logWeight + logDensity);
      }
      
      const logNorm = NumericalUtils.logSumExp(logProbs);
      const probs = logProbs.map(lp => Math.exp(lp - logNorm));
      responsibilities.push(probs);
    }
    
    return responsibilities;
  }
  
  /**
   * M-step: update parameters
   */
  private mStep(data: number[], responsibilities: number[][]): MixtureComponent[] {
    const n = data.length;
    const k = responsibilities[0].length;
    const components: MixtureComponent[] = [];
    
    for (let j = 0; j < k; j++) {
      const nj = responsibilities.reduce((sum, r) => sum + r[j], 0);
      const weight = nj / n;
      
      const mean = responsibilities.reduce((sum, r, i) => 
        sum + r[j] * data[i], 0) / nj;
      
      const variance = responsibilities.reduce((sum, r, i) => 
        sum + r[j] * Math.pow(data[i] - mean, 2), 0) / nj;
      
      components.push({
        mean,
        variance: Math.max(variance, 1e-6), // Prevent collapse
        weight
      });
    }
    
    return components;
  }
  
  /**
   * Compute log-likelihood
   */
  private computeLogLikelihood(data: number[], components: MixtureComponent[]): number {
    let logLik = 0;
    
    for (const x of data) {
      const logProbs: number[] = [];
      
      for (const comp of components) {
        const logWeight = Math.log(comp.weight);
        const logDensity = -0.5 * Math.log(2 * Math.PI * comp.variance) - 
                          0.5 * Math.pow(x - comp.mean, 2) / comp.variance;
        logProbs.push(logWeight + logDensity);
      }
      
      logLik += NumericalUtils.logSumExp(logProbs);
    }
    
    return logLik;
  }
  
  /**
   * Fit normal mixture using EM algorithm
   */
  async fit(data: DataInput, options?: FitOptions): Promise<VIResult> {
    // Extract data array
    if (!Array.isArray(data.data)) {
      throw new Error('Normal mixture requires array data format');
    }
    
    const dataArray = data.data;
    const k = data.config?.numComponents || this.numComponents;

    if (!dataArray || dataArray.length === 0) {
      throw new Error('Data cannot be empty');
    }

    if (k > dataArray.length) {
      throw new Error('Number of components cannot exceed data size');
    }
    
    // Initialize
    const centers = this.initializeKMeansPlusPlus(dataArray, k);
    let components: MixtureComponent[] = centers.map(c => ({
      mean: c,
      variance: jStat.variance(dataArray) / k,
      weight: 1 / k
    }));
    
    let oldLogLik = -Infinity;
    let converged = false;
    let iterations = 0;
    const elboHistory: number[] = [];
    
    for (iterations = 0; iterations < this.maxIterations; iterations++) {
      // E-step
      const responsibilities = this.eStep(dataArray, components);
      
      // M-step
      components = this.mStep(dataArray, responsibilities);
      
      // Check convergence
      const logLik = this.computeLogLikelihood(dataArray, components);
      elboHistory.push(logLik);
      
      if (Math.abs(logLik - oldLogLik) < this.tolerance) {
        converged = true;
        break;
      }
      
      oldLogLik = logLik;
    }
    
    return {
      posterior: new MixturePosterior(components),
      diagnostics: {
        converged,
        iterations,
        finalELBO: oldLogLik,
        elboHistory
      }
    };
  }
}

// ============================================
// Tier 3: Gradient-Based VI Models
// ============================================

// Types for Zero-Inflated Log-Normal
interface ZILNParams {
  zeroLogitMean: number;      // Logit of zero probability
  zeroLogitLogVar: number;    // Log variance of zero probability (for VI)
  valueMean: number;          // Mean of log-normal (mu parameter)
  valueLogVar: number;        // Log variance of log-normal (log(sigma^2))
  // REMOVED: valueSigma - compute from valueLogVar when needed
}

/**
 * Zero-inflated log-normal posterior
 */
class ZILNPosterior implements Posterior {
  private valueSigma: number;
  
  constructor(private params: ZILNParams) {
    // Compute valueSigma from valueLogVar
    this.valueSigma = Math.sqrt(Math.exp(params.valueLogVar));
  }
  
  /**
   * Get zero probability estimate
   */
  getZeroProbability(): number {
    // Direct posterior mean: sigmoid of the mean parameter
    return 1 / (1 + Math.exp(-this.params.zeroLogitMean));
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
    if (!isZero) {
      const valueMu = jStat.normal.sample(
        this.params.valueMean,
        Math.sqrt(Math.exp(this.params.valueLogVar))
      );
      // Log-normal: exp(normal)
      value = Math.exp(valueMu + this.valueSigma * jStat.normal.sample(0, 1));
    }
    
    return [isZero, value];
  }
  
  /**
   * Sample from posterior
   */
  sample(): number[] {
    const [isZero, value] = this.sampleOne();
    return [isZero, value, isZero ? 0 : value];
  }
  
  /**
   * Get credible intervals
   */
/**
 * Get credible intervals
 */
credibleInterval(level: number): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    
    // 1. Zero probability CI using delta method approximation
    // For logit-normal, we can use the normal approximation on the logit scale
    const logitStd = Math.sqrt(Math.exp(this.params.zeroLogitLogVar));
    const z = jStat.normal.inv(1 - alpha, 0, 1);
    const logitLower = this.params.zeroLogitMean - z * logitStd;
    const logitUpper = this.params.zeroLogitMean + z * logitStd;
    
    const zeroProbCI: [number, number] = [
      1 / (1 + Math.exp(-logitLower)),
      1 / (1 + Math.exp(-logitUpper))
    ];
    
    // 2. Non-zero value CI (log-normal parameters)
    // For log-normal, work on the log scale then transform
    const logValueStd = Math.sqrt(this.valueSigma * this.valueSigma + 
                                   Math.exp(this.params.valueLogVar));
    const logValueLower = this.params.valueMean - z * logValueStd;
    const logValueUpper = this.params.valueMean + z * logValueStd;
    
    const valueCI: [number, number] = [
      Math.exp(logValueLower),
      Math.exp(logValueUpper)
    ];
    
    // 3. Overall mean CI is complex due to mixture - use Monte Carlo
    const overallSamples: number[] = [];
    for (let i = 0; i < 10000; i++) {
      const [isZero, value] = this.sampleOne();
      overallSamples.push(isZero ? 0 : value);
    }
    overallSamples.sort((a, b) => a - b);
    
    const lowerIdx = Math.floor(alpha * overallSamples.length);
    const upperIdx = Math.floor((1 - alpha) * overallSamples.length);
    
    const overallCI: [number, number] = [
      overallSamples[lowerIdx],
      overallSamples[upperIdx]
    ];
    
    return [zeroProbCI, valueCI, overallCI];
  }
}

/**
 * Zero-inflated log-normal variational inference
 */
export class ZeroInflatedLogNormalVI {
  private learningRate = 0.01;
  private maxIterations = 1000;
  private tolerance = 1e-5;
  private debugMode: boolean = false;
  
  constructor(options: FitOptions & { debugMode?: boolean } = {}) {
    if (options.maxIterations) this.maxIterations = options.maxIterations;
    if (options.tolerance) this.tolerance = options.tolerance;
    if (typeof options.debugMode === 'boolean') this.debugMode = options.debugMode;
  }
  
  /**
   * Compute analytical gradients of ELBO
   */
  private computeAnalyticalGradients(
    params: ZILNParams,
    data: number[]
  ): { elbo: number; gradients: ZILNParams } {
    const zeros = data.filter(x => x === 0).length;
    const nonZeros = data.filter(x => x > 0);
    const n = data.length;
    
    // Compute derived parameters
    const valueSigma = Math.sqrt(Math.exp(params.valueLogVar));
    const zeroProb = 1 / (1 + Math.exp(-params.zeroLogitMean));
    
    // Initialize gradients
    const gradients: ZILNParams = {
      zeroLogitMean: 0,
      zeroLogitLogVar: 0,
      valueMean: 0,
      valueLogVar: 0
    };
    
    let elbo = 0;
    
    // 1. Bernoulli likelihood for zero/non-zero indicators
    const logLikBernoulli = zeros * Math.log(zeroProb + 1e-10) + 
                           (n - zeros) * Math.log(1 - zeroProb + 1e-10);
    elbo += logLikBernoulli;
    
    // Gradient: standard logistic regression gradient
    gradients.zeroLogitMean = zeros - n * zeroProb;
    
    // 2. Log-normal likelihood for non-zero values
    if (nonZeros.length > 0) {
      let logLikLN = 0;
      let gradMean = 0;
      let gradLogVar = 0;
      
      for (const x of nonZeros) {
        const logX = Math.log(x);
        const z = (logX - params.valueMean) / valueSigma;
        
        // Log-normal log-likelihood
        logLikLN += -logX - 0.5 * Math.log(2 * Math.PI) - 
                    Math.log(valueSigma) - 0.5 * z * z;
        
        // Gradients w.r.t. mu and log(sigma^2)
        gradMean += z / valueSigma;
        gradLogVar += 0.5 * (-1/valueSigma + z * z) / valueSigma;
      }
      
      // Add to ELBO (no weighting - these are conditioned on being non-zero)
      elbo += logLikLN;
      
      // Add to gradients
      gradients.valueMean += gradMean;
      gradients.valueLogVar += gradLogVar;
    }
    
    // 3. KL divergences (using standard normal priors)
    // KL for logit-normal approximation
    const zeroLogitVar = Math.exp(params.zeroLogitLogVar);
    const klZero = 0.5 * (params.zeroLogitMean * params.zeroLogitMean + 
                         zeroLogitVar - Math.log(zeroLogitVar) - 1);
    
    // KL for normal approximation to log-normal parameters
    const klValue = 0.5 * (params.valueMean * params.valueMean + 
                          Math.exp(params.valueLogVar) - params.valueLogVar - 1);
    
    elbo -= (klZero + klValue);
    
    // KL gradients
    gradients.zeroLogitMean -= params.zeroLogitMean;
    gradients.zeroLogitLogVar -= 0.5 * (1 - 1/zeroLogitVar);
    gradients.valueMean -= params.valueMean;
    gradients.valueLogVar -= 0.5 * (Math.exp(params.valueLogVar) - 1);
    
    if (this.debugMode) {
      console.log('\n=== Gradient Debug ===');
      console.log('Zero prob:', zeroProb.toFixed(4), 'vs empirical:', (zeros/n).toFixed(4));
      console.log('Gradients:', {
        zeroLogit: gradients.zeroLogitMean.toFixed(4),
        valueMean: gradients.valueMean.toFixed(4),
        valueLogVar: gradients.valueLogVar.toFixed(4)
      });
      console.log('ELBO:', elbo.toFixed(4));
    }
    
    return { elbo, gradients };
  }
  
  async fit(input: DataInput, options?: FitOptions): Promise<VIResult> {
    let data: number[];
    
    if (Array.isArray(input.data)) {
      data = input.data;
    } else {
      throw new Error('Zero-inflated log-normal requires array of values');
    }
    
    if (data.length === 0) {
      throw new Error('Data cannot be empty');
    }
    
    const zeros = data.filter(x => x === 0).length;
    const nonZeros = data.filter(x => x > 0);
    const n = data.length;
    
    if (zeros === 0) {
      throw new Error('No zeros found in data - use standard LogNormal instead');
    }
    
    // Validate data
    if (nonZeros.length > 0) {
      const minNonZero = Math.min(...nonZeros);
      if (minNonZero > 0.5 && this.debugMode) {
        console.warn('Warning: Minimum non-zero value is', minNonZero.toFixed(4), 
                    '- data may not be truly log-normal');
      }
    }
    
    // Initialize parameters
    let params: ZILNParams;
    
    if (nonZeros.length === 0) {
      // All zeros case
      params = {
        zeroLogitMean: 3.0,  // High zero probability
        zeroLogitLogVar: Math.log(0.1),
        valueMean: 0,
        valueLogVar: 0  // log(1) = 0
      };
    } else {
      // Normal case
      const empiricalZeroProb = zeros / n;
      const boundedProb = Math.max(0.01, Math.min(0.99, empiricalZeroProb));
      const logNonZeros = nonZeros.map(x => Math.log(x));
      
      params = {
        zeroLogitMean: Math.log(boundedProb / (1 - boundedProb)),
        zeroLogitLogVar: Math.log(1.0),  // Start with unit variance
        valueMean: jStat.mean(logNonZeros),
        valueLogVar: Math.log(Math.max(0.01, jStat.variance(logNonZeros, true)))
      };
    }
    
    // Initialize optimizer
    const optimizer = new AdamOptimizer({
      learningRate: this.learningRate,
      beta1: 0.9,
      beta2: 0.999,
      epsilon: 1e-8
    });
    
    const elboHistory: number[] = [];
    let converged = false;
    let iterations = 0;
    
    // Convert to/from array for optimizer
    const toArray = (p: ZILNParams) => [
      p.zeroLogitMean, p.zeroLogitLogVar, p.valueMean, p.valueLogVar
    ];
    
    const fromArray = (arr: number[]): ZILNParams => ({
      zeroLogitMean: arr[0],
      zeroLogitLogVar: arr[1],
      valueMean: arr[2],
      valueLogVar: arr[3]
    });
    
    let paramArray = toArray(params);
    let oldParams = [...paramArray];
    
    // Optimization loop
    for (iterations = 0; iterations < this.maxIterations; iterations++) {
      const currentParams = fromArray(paramArray);
      const { elbo, gradients } = this.computeAnalyticalGradients(currentParams, data);
      
      elboHistory.push(elbo);
      
      // Check convergence
      if (iterations > 0) {
        const paramChange = Math.sqrt(
          paramArray.reduce((sum, p, i) => sum + Math.pow(p - oldParams[i], 2), 0)
        );
        const paramNorm = Math.sqrt(paramArray.reduce((sum, p) => sum + p * p, 0));
        const relativeChange = paramChange / (paramNorm + 1e-10);
        
        if (relativeChange < this.tolerance) {
          converged = true;
          break;
        }
      }
      
      oldParams = [...paramArray];
      
      // Update parameters
      const gradArray = toArray(gradients);
      paramArray = optimizer.step(paramArray, gradArray);
    }
    
    return {
      posterior: new ZILNPosterior(fromArray(paramArray)),
      diagnostics: {
        converged,
        iterations,
        finalELBO: elboHistory[elboHistory.length - 1],
        elboHistory
      }
    };
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