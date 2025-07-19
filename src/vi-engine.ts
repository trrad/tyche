// Tyche VI Engine: Production-Ready Implementation
// Browser-optimized variational inference with proper numerical libraries

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
  warmStart?: any;
}

// Initialize seedable RNG
export const random = new Random(MersenneTwister19937.seed(12345));

// ============================================
// Numerical Utilities using jStat
// ============================================

export class NumericalUtils {
  /**
   * Numerically stable log-sum-exp computation
   * @param logValues Array of log values
   * @returns log(sum(exp(logValues)))
   */
  static logSumExp(logValues: number[]): number {
    if (logValues.length === 0) return -Infinity;
    
    // Filter out -Infinity values
    const finiteValues = logValues.filter(v => isFinite(v));
    if (finiteValues.length === 0) return -Infinity;
    
    const maxVal = Math.max(...finiteValues);
    const sum = finiteValues.reduce((acc, logVal) => {
      return acc + Math.exp(logVal - maxVal);
    }, 0);
    
    return maxVal + Math.log(sum);
  }
  
  /**
   * Digamma function approximation
   * @param x Input value (must be positive)
   * @returns Digamma(x)
   */
  static digamma(x: number): number {
    if (x <= 0) {
      throw new Error('Digamma is not defined for non-positive values');
    }
    
    if (x < 6) {
      // Use recursion with bounds checking
      return NumericalUtils.digamma(x + 1) - 1 / x;
    }
    
    // Asymptotic expansion
    const inv = 1 / x;
    const inv2 = inv * inv;
    return Math.log(x) - 0.5 * inv - inv2 / 12 + inv2 * inv2 / 120;
  }
  
  /**
   * Log Beta function using jStat
   */
  static logBeta(a: number, b: number): number {
    return jStat.betaln(a, b);
  }
  
  /**
   * Log Gamma function using jStat
   */
  static logGamma(x: number): number {
    return jStat.gammaln(x);
  }
  
  /**
   * Clip gradients to prevent instability
   * @param gradient Gradient value
   * @param maxNorm Maximum allowed norm
   * @returns Clipped gradient
   */
  static clipGradient(gradient: number, maxNorm: number = 10.0): number {
    if (Math.abs(gradient) > maxNorm) {
      return Math.sign(gradient) * maxNorm;
    }
    return gradient;
  }
  
  /**
   * Clip gradient vector
   * @param gradients Gradient vector
   * @param maxNorm Maximum allowed L2 norm
   * @returns Clipped gradient vector
   */
  static clipGradientVector(gradients: number[], maxNorm: number = 10.0): number[] {
    const norm = Math.sqrt(gradients.reduce((sum, g) => sum + g * g, 0));
    if (norm > maxNorm) {
      const scale = maxNorm / norm;
      return gradients.map(g => g * scale);
    }
    return gradients;
  }
}

// ============================================
// Tier 1: Conjugate Models (Exact Updates)
// ============================================

/**
 * Beta posterior distribution
 */
class BetaPosterior implements Posterior {
  constructor(public alpha: number, public beta: number) {
    if (alpha <= 0 || beta <= 0) {
      throw new Error('Beta parameters must be positive');
    }
  }
  
  /**
   * Get posterior mean
   */
  mean(): number[] {
    return [this.alpha / (this.alpha + this.beta)];
  }
  
  /**
   * Get posterior variance
   */
  variance(): number[] {
    const n = this.alpha + this.beta;
    return [(this.alpha * this.beta) / (n * n * (n + 1))];
  }
  
  /**
   * Sample from posterior
   */
  sample(): number[] {
    return [jStat.beta.sample(this.alpha, this.beta)];
  }
  
  /**
   * Get credible interval
   */
  credibleInterval(level: number): Array<[number, number]> {
    if (level <= 0 || level >= 1) {
      throw new Error('Credible level must be between 0 and 1');
    }
    
    const alpha = (1 - level) / 2;
    return [[
      jStat.beta.inv(alpha, this.alpha, this.beta),
      jStat.beta.inv(1 - alpha, this.alpha, this.beta)
    ]];
  }
}

/**
 * Beta-Binomial conjugate variational inference
 */
export class BetaBinomialVI {
  private priorAlpha: number;
  private priorBeta: number;
  
  constructor(options: FitOptions = {}) {
    const prior = options.priorParams || { type: 'beta', params: [1, 1] };
    if (prior.type !== 'beta' || prior.params.length !== 2) {
      throw new Error('Beta-Binomial requires Beta prior');
    }
    this.priorAlpha = prior.params[0];
    this.priorBeta = prior.params[1];
    
    if (this.priorAlpha <= 0 || this.priorBeta <= 0) {
      throw new Error('Prior parameters must be positive');
    }
  }
  
  /**
   * Fit Beta-Binomial model with conjugate update
   */
  async fit(input: DataInput, options?: FitOptions): Promise<VIResult> {
    // Extract data
    let successes: number, trials: number;
    
    if (typeof input.data === 'object' && !Array.isArray(input.data)) {
      if (input.data.successes === undefined || input.data.trials === undefined) {
        throw new Error('Beta-Binomial requires successes and trials');
      }
      successes = input.data.successes;
      trials = input.data.trials;
    } else {
      throw new Error('Beta-Binomial requires summary statistics, not raw data');
    }
    
    if (successes < 0 || trials < 0 || successes > trials) {
      throw new Error('Invalid data: successes must be between 0 and trials');
    }
    
    // Exact conjugate update
    const posterior = new BetaPosterior(
      this.priorAlpha + successes,
      this.priorBeta + trials - successes
    );
    
    return {
      posterior,
      diagnostics: {
        converged: true,
        iterations: 1,
        finalELBO: this.computeELBO(posterior, successes, trials)
      }
    };
  }
  
  /**
   * Compute evidence lower bound
   */
  private computeELBO(posterior: BetaPosterior, successes: number, trials: number): number {
    // ELBO = E_q[log p(x,θ)] - E_q[log q(θ)]
    // For conjugate case, this equals log marginal likelihood
    return NumericalUtils.logBeta(
      this.priorAlpha + successes,
      this.priorBeta + trials - successes
    ) - NumericalUtils.logBeta(this.priorAlpha, this.priorBeta);
  }
}

// ============================================
// Tier 2: EM Algorithm for Mixtures
// ============================================

interface GaussianComponent {
  mean: number;
  variance: number;
  weight: number;
}

/**
 * Mixture of Gaussians posterior
 */
class MixturePosterior implements Posterior {
  constructor(public components: GaussianComponent[]) {
    // Validate components
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 1e-6) {
      throw new Error('Component weights must sum to 1');
    }
    
    for (const c of components) {
      if (c.variance <= 0) {
        throw new Error('Component variances must be positive');
      }
    }
  }
  
  /**
   * Get mixture mean
   */
  mean(): number[] {
    const overallMean = this.components.reduce((sum, c) => sum + c.weight * c.mean, 0);
    // Return means for each component plus overall mean
    return [...this.components.map(c => c.mean), overallMean];
  }
  
  /**
   * Get mixture variance
   */
  variance(): number[] {
    const overallMean = this.mean()[this.components.length]; // Last element is overall mean
    const overallVar = this.components.reduce((sum, c) => {
      const componentVar = c.variance + Math.pow(c.mean - overallMean, 2);
      return sum + c.weight * componentVar;
    }, 0);
    
    // Return variances for each component plus overall variance
    return [...this.components.map(c => c.variance), overallVar];
  }
  
  /**
   * Sample from mixture
   */
  sample(): number[] {
    // Sample component according to weights
    const u = random.real(0, 1);
    let cumWeight = 0;
    let selectedComponent = 0;
    
    for (let i = 0; i < this.components.length; i++) {
      cumWeight += this.components[i].weight;
      if (u <= cumWeight) {
        selectedComponent = i;
        break;
      }
    }
    
    const component = this.components[selectedComponent];
    const value = jStat.normal.sample(component.mean, Math.sqrt(component.variance));
    
    // Return [component_index, sampled_value]
    return [selectedComponent, value];
  }
  
  /**
   * Get credible intervals for each component mean
   */
  credibleInterval(level: number): Array<[number, number]> {
    // For mixture, we return intervals for each component mean
    // Generate many samples and compute empirical quantiles
    const componentSamples: number[][] = this.components.map(() => []);
    
    // Generate samples
    for (let i = 0; i < 10000; i++) {
      const [compIdx, value] = this.sample();
      componentSamples[compIdx].push(value);
    }
    
    // Compute quantiles for each component
    const alpha = (1 - level) / 2;
    return this.components.map((_, idx) => {
      const samples = componentSamples[idx].sort((a, b) => a - b);
      if (samples.length === 0) return [0, 0] as [number, number];
      
      const lowerIdx = Math.floor(alpha * samples.length);
      const upperIdx = Math.floor((1 - alpha) * samples.length);
      
      return [samples[lowerIdx], samples[upperIdx]] as [number, number];
    });
  }
}

/**
 * Normal mixture model using EM algorithm
 */
export class NormalMixtureEM {
  private maxIterations = 100;
  private tolerance = 1e-6;
  private minVariance = 1e-6;
  private numComponents: number = 2;
  
  constructor(options: FitOptions = {}) {
    if (options.maxIterations) this.maxIterations = options.maxIterations;
    if (options.tolerance) this.tolerance = options.tolerance;
  }
  
  /**
   * Fit normal mixture model using EM algorithm
   */
  async fit(input: DataInput, options?: FitOptions): Promise<VIResult> {
    // Extract data
    let data: number[];
    
    if (Array.isArray(input.data)) {
      data = input.data;
    } else {
      throw new Error('Normal mixture requires array of values');
    }
    
    if (data.length === 0) {
      throw new Error('Data cannot be empty');
    }
    
    // Get number of components
    this.numComponents = input.config?.numComponents || 2;
    
    if (this.numComponents < 1) {
      throw new Error('Number of components must be at least 1');
    }
    
    if (this.numComponents > data.length) {
      throw new Error('Number of components cannot exceed data size');
    }
    
    const n = data.length;
    
    // Initialize with k-means++
    let components = this.initializeKMeansPlusPlus(data, this.numComponents);
    let oldLogLik = -Infinity;
    let iterations = 0;
    const elboHistory: number[] = [];
    
    for (iterations = 0; iterations < this.maxIterations; iterations++) {
      // E-step: compute responsibilities
      const responsibilities = this.computeResponsibilities(data, components);
      
      // M-step: update parameters
      const newComponents = this.updateParameters(data, responsibilities);
      
      // Compute log likelihood
      const logLik = this.computeLogLikelihood(data, newComponents);
      elboHistory.push(logLik);
      
      // Check convergence
      if (Math.abs(logLik - oldLogLik) < this.tolerance) {
        break;
      }
      
      components = newComponents;
      oldLogLik = logLik;
    }
    
    return {
      posterior: new MixturePosterior(components),
      diagnostics: {
        converged: iterations < this.maxIterations,
        iterations,
        finalELBO: oldLogLik,
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
        const logWeight = Math.log(c.weight);
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
      
      // Avoid empty components
      if (nj < 1e-10) {
        // Reinitialize this component randomly
        const randomIdx = random.integer(0, n - 1);
        components.push({
          mean: data[randomIdx],
          variance: jStat.variance(data, true),
          weight: 1e-10
        });
        continue;
      }
      
      // Update weight
      const weight = nj / n;
      
      // Update mean
      let mean = 0;
      for (let i = 0; i < n; i++) {
        mean += responsibilities[i][j] * data[i];
      }
      mean /= nj;
      
      // Update variance
      let variance = 0;
      for (let i = 0; i < n; i++) {
        variance += responsibilities[i][j] * Math.pow(data[i] - mean, 2);
      }
      variance /= nj;
      variance = Math.max(variance, this.minVariance);
      
      components.push({ mean, variance, weight });
    }
    
    // Normalize weights
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    components.forEach(c => c.weight /= totalWeight);
    
    return components;
  }
  
  /**
   * Compute log likelihood
   */
  private computeLogLikelihood(
    data: number[],
    components: GaussianComponent[]
  ): number {
    return data.reduce((sum, x) => {
      const logProbs = components.map(c => {
        const logWeight = Math.log(c.weight);
        const z = (x - c.mean) / Math.sqrt(c.variance);
        const logPdf = -0.5 * (Math.log(2 * Math.PI * c.variance) + z * z);
        return logWeight + logPdf;
      });
      return sum + NumericalUtils.logSumExp(logProbs);
    }, 0);
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
  private learningRate = 0.01;
  private maxIterations = 1000;
  private tolerance = 1e-6;
  private numSamples = 10; // For ELBO estimation
  
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
    
    // Initialize parameters
    let params: ZILNParams = {
      zeroLogitMean: Math.log(Math.max(0.01, zeros / (n - zeros))),
      zeroLogitLogVar: 0,
      valueMean: nonZeros.length > 0 
        ? jStat.mean(nonZeros.map(x => Math.log(x))) 
        : 0,
      valueLogVar: 0,
      valueSigma: nonZeros.length > 0
        ? Math.sqrt(jStat.variance(nonZeros.map(x => Math.log(x)), true))
        : 1
    };
    
    // Initialize optimizer
    const optimizer = new AdamOptimizer({
      learningRate: this.learningRate,
      beta1: 0.9,
      beta2: 0.999,
      epsilon: 1e-8,
      gradientClip: 10.0
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
      zeroLogitLogVar: arr[1],
      valueMean: arr[2],
      valueLogVar: arr[3],
      valueSigma: Math.max(0.01, arr[4]) // Ensure positive
    });
    
    let paramArray = paramsToArray(params);
    let oldParams = [...paramArray];
    
    for (iterations = 0; iterations < this.maxIterations; iterations++) {
      // Estimate ELBO and gradients
      const { elbo, gradients } = this.estimateELBOAndGradients(
        arrayToParams(paramArray), 
        data
      );
      elboHistory.push(elbo);
      
      // Update parameters using optimizer
      const gradArray = paramsToArray(gradients);
      paramArray = optimizer.step(paramArray, gradArray);
      
      // Check convergence
      if (iterations > 0) {
        const paramChange = Math.sqrt(
          paramArray.reduce((sum, p, i) => 
            sum + Math.pow(p - oldParams[i], 2), 0
          )
        );
        
        if (paramChange < this.tolerance) {
          converged = true;
          break;
        }
      }
      
      oldParams = [...paramArray];
      params = arrayToParams(paramArray);
      
      // Yield to UI every 100 iterations
      if (iterations % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
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
   * Estimate ELBO and gradients using REINFORCE
   */
  private estimateELBOAndGradients(
    params: ZILNParams,
    data: number[]
  ): { elbo: number; gradients: ZILNParams } {
    // Use REINFORCE with baseline for variance reduction
    let elboSum = 0;
    const gradSum: ZILNParams = {
      zeroLogitMean: 0,
      zeroLogitLogVar: 0,
      valueMean: 0,
      valueLogVar: 0,
      valueSigma: 0
    };
    
    // First pass: compute baseline (mean ELBO)
    const baselineSamples = 5;
    let baseline = 0;
    for (let s = 0; s < baselineSamples; s++) {
      const { sample, logQ } = this.sampleVariational(params);
      const logP = this.computeLogJoint(sample, data, params);
      baseline += (logP - logQ) / baselineSamples;
    }
    
    // Second pass: compute gradients with baseline
    for (let s = 0; s < this.numSamples; s++) {
      const { sample, logQ } = this.sampleVariational(params);
      const logP = this.computeLogJoint(sample, data, params);
      const elboSample = logP - logQ;
      elboSum += elboSample;
      
      // Gradient with baseline
      const advantage = elboSample - baseline;
      const gradLogQ = this.computeGradLogQ(sample, params);
      
      for (const key in gradLogQ) {
        const k = key as keyof ZILNParams;
        gradSum[k] += advantage * gradLogQ[k];
      }
    }
    
    // Average
    const elbo = elboSum / this.numSamples;
    const gradients = {} as ZILNParams;
    for (const key in gradSum) {
      const k = key as keyof ZILNParams;
      gradients[k] = gradSum[k] / this.numSamples;
    }
    
    return { elbo, gradients };
  }
  
  /**
   * Sample from variational distribution
   */
  private sampleVariational(params: ZILNParams): { sample: any; logQ: number } {
    // Sample from variational distribution
    const zeroLogit = jStat.normal.sample(
      params.zeroLogitMean,
      Math.sqrt(Math.exp(params.zeroLogitLogVar))
    );
    
    const valueMu = jStat.normal.sample(
      params.valueMean,
      Math.sqrt(Math.exp(params.valueLogVar))
    );
    
    const sample = { 
      zeroLogit,
      valueMu,
      zeroProb: 1 / (1 + Math.exp(-zeroLogit))
    };
    
    // Compute log q(z|λ)
    const zeroLogitStd = Math.sqrt(Math.exp(params.zeroLogitLogVar));
    const valueMuStd = Math.sqrt(Math.exp(params.valueLogVar));
    
    const logQ = 
      Math.log(jStat.normal.pdf(zeroLogit, params.zeroLogitMean, zeroLogitStd)) +
      Math.log(jStat.normal.pdf(valueMu, params.valueMean, valueMuStd));
    
    return { sample, logQ };
  }
  
  /**
   * Compute log joint probability
   */
  private computeLogJoint(sample: any, data: number[], params: ZILNParams): number {
    let logP = 0;
    
    // Prior: standard normal on transformed parameters
    logP += Math.log(jStat.normal.pdf(sample.zeroLogit, 0, 1));
    logP += Math.log(jStat.normal.pdf(sample.valueMu, 0, 1));
    
    // Likelihood
    for (const x of data) {
      if (x === 0) {
        logP += Math.log(sample.zeroProb);
      } else {
        logP += Math.log(1 - sample.zeroProb);
        // Log-normal likelihood with proper variance
        logP += Math.log(jStat.lognormal.pdf(x, sample.valueMu, params.valueSigma));
      }
    }
    
    return logP;
  }
  
  /**
   * Compute gradient of log q (score function)
   */
  private computeGradLogQ(sample: any, params: ZILNParams): ZILNParams {
    // Score function: ∇_λ log q(z|λ)
    const zeroSigma = Math.sqrt(Math.exp(params.zeroLogitLogVar));
    const valueSigma = Math.sqrt(Math.exp(params.valueLogVar));
    
    return {
      zeroLogitMean: (sample.zeroLogit - params.zeroLogitMean) / (zeroSigma * zeroSigma),
      zeroLogitLogVar: 0.5 * (Math.pow((sample.zeroLogit - params.zeroLogitMean) / zeroSigma, 2) - 1),
      valueMean: (sample.valueMu - params.valueMean) / (valueSigma * valueSigma),
      valueLogVar: 0.5 * (Math.pow((sample.valueMu - params.valueMean) / valueSigma, 2) - 1),
      valueSigma: 0  // Will be computed via finite differences if needed
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