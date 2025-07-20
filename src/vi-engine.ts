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
      value = Math.exp(valueMu + this.params.valueSigma * jStat.normal.sample(0, 1));
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
    const logValueStd = Math.sqrt(this.params.valueSigma * this.params.valueSigma + 
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
  private learningRate = 0.01;  // Increased learning rate for analytical gradients
  private maxIterations = 1000;
  private tolerance = 1e-5;  // Slightly relaxed tolerance
  private numSamples = 50;  // Kept at original value
  private debugMode: boolean = false;
  
  constructor(options: FitOptions & { debugMode?: boolean } = {}) {
    if (options.maxIterations) this.maxIterations = options.maxIterations;
    if (options.tolerance) this.tolerance = options.tolerance;
    if (typeof options.debugMode === 'boolean') this.debugMode = options.debugMode;
  }
  
    /**
     * Compute analytical gradients of ELBO w.r.t. variational parameters
     * This is much more efficient than finite differences!
     * 
     * Note: This uses a mean-field approximation and evaluates at the 
     * variational means (Laplace approximation).
     */
    private computeAnalyticalGradients(
    params: ZILNParams,
    data: number[]
    ): { elbo: number; gradients: ZILNParams } {
    // Separate zeros and non-zeros
    const zeros = data.filter(x => x === 0).length;
    const nonZeros = data.filter(x => x > 0);
    const n = data.length;
    
    // Current variational parameters
    const zeroLogitStd = Math.sqrt(Math.exp(params.zeroLogitLogVar));
    const valueStd = Math.sqrt(Math.exp(params.valueLogVar));
    
    // Initialize gradients
    const gradients: ZILNParams = {
        zeroLogitMean: 0,
        zeroLogitLogVar: 0,
        valueMean: 0,
        valueLogVar: 0,
        valueSigma: 0
    };
    
    // ELBO components
    let elbo = 0;
    
    // 1. Expected log likelihood for zero probability
    // Using logistic function: p(zero) = 1/(1 + exp(-logit))
    const zeroProb = 1 / (1 + Math.exp(-params.zeroLogitMean));
    
    if (this.debugMode) {
        console.log('\n=== Gradient Computation ===');
        console.log('Data: zeros =', zeros, 'nonZeros =', nonZeros.length, 'total =', n);
        console.log('True zero proportion:', (zeros / n).toFixed(4));
        console.log('Current zero prob:', zeroProb.toFixed(4));
        console.log('Current logit:', params.zeroLogitMean.toFixed(4));
    }
    
    // Likelihood contribution (using log1p for numerical stability)
    const logLikZero = zeros * (-Math.log1p(Math.exp(-params.zeroLogitMean))) + 
                        (n - zeros) * (-Math.log1p(Math.exp(params.zeroLogitMean)));
    elbo += logLikZero;
    
    // Gradient for zero probability (standard logistic regression gradient)
    gradients.zeroLogitMean = zeros - n * zeroProb;
    
    // 2. Expected log likelihood for non-zero values (if any)
    let logLikValue = 0;
    let crossTermGrad = 0;
    
    if (nonZeros.length > 0) {
        let gradMean = 0;
        let gradSigma = 0;
        
        // Compute log-likelihood and gradients for non-zero values
        for (const x of nonZeros) {
        const logX = Math.log(x);
        const z = (logX - params.valueMean) / params.valueSigma;
        
        // Log-normal log likelihood for this data point
        logLikValue += -logX - Math.log(params.valueSigma) - 0.5 * Math.log(2 * Math.PI) - 0.5 * z * z;
        
        // Gradients w.r.t. value parameters (accumulate over data points)
        gradMean += z / params.valueSigma;
        gradSigma += -1 / params.valueSigma + z * z / params.valueSigma;
        }
        
        // Weight by expected probability of non-zero
        const nonZeroProb = 1 - zeroProb;
        
        // Add weighted likelihood to ELBO
        elbo += nonZeroProb * logLikValue;
        
        // Weight the gradients
        gradients.valueMean = nonZeroProb * gradMean;
        gradients.valueSigma = nonZeroProb * gradSigma;
        
        // Cross-term gradient contribution
        // d/d(logit) [(1-p) * logLik] = -p(1-p) * logLik
        crossTermGrad = -zeroProb * nonZeroProb * logLikValue;
        gradients.zeroLogitMean += crossTermGrad;
    }
    
    // 3. KL divergence for zero probability (logit-normal to standard normal prior)
    const klZero = 0.5 * (params.zeroLogitMean * params.zeroLogitMean / (zeroLogitStd * zeroLogitStd) + 
                            Math.log(zeroLogitStd * zeroLogitStd) - 1);
    elbo -= klZero;
    
    // KL gradients
    const klGradZero = -params.zeroLogitMean / (zeroLogitStd * zeroLogitStd);
    gradients.zeroLogitMean += klGradZero;
    gradients.zeroLogitLogVar -= 0.5 * (1 / (zeroLogitStd * zeroLogitStd) - 1);
    
    // 4. KL divergence for value parameters (normal to standard normal prior)
    const klValue = 0.5 * (params.valueMean * params.valueMean / (valueStd * valueStd) + 
                            Math.log(valueStd * valueStd) - 1);
    elbo -= klValue;
    
    // KL gradients
    gradients.valueMean -= params.valueMean / (valueStd * valueStd);
    gradients.valueLogVar -= 0.5 * (1 / (valueStd * valueStd) - 1);
    
    // 5. Entropy bonus for variational distributions
    const entropyZero = 0.5 * Math.log(2 * Math.PI * Math.E * zeroLogitStd * zeroLogitStd);
    const entropyValue = 0.5 * Math.log(2 * Math.PI * Math.E * valueStd * valueStd);
    elbo += entropyZero + entropyValue;
    
    // Entropy gradients
    gradients.zeroLogitLogVar += 0.5;
    gradients.valueLogVar += 0.5;
    
    if (this.debugMode) {
        // Log gradient components
        const likelihoodGradZero = zeros - n * zeroProb;
        
        console.log('\nGradient components for zeroLogitMean:');
        console.log('  Likelihood (zeros):', likelihoodGradZero.toFixed(4));
        console.log('  Cross-term (non-zeros):', crossTermGrad.toFixed(4));
        console.log('  KL regularization:', klGradZero.toFixed(4));
        console.log('  Total gradient:', gradients.zeroLogitMean.toFixed(4));
        
        const shouldIncrease = (zeros / n) > zeroProb;
        console.log('  Expected direction:', shouldIncrease ? 'INCREASE' : 'DECREASE');
        console.log('  Actual direction:', gradients.zeroLogitMean > 0 ? 'INCREASE' : 'DECREASE');
        console.log('  Match?', (gradients.zeroLogitMean > 0) === shouldIncrease ? '✓' : '✗ MISMATCH!');
        
        console.log('\nOther gradients:');
        console.log('  valueMean:', gradients.valueMean.toFixed(4));
        console.log('  valueSigma:', gradients.valueSigma.toFixed(4));
        console.log('  ELBO:', elbo.toFixed(4));
    }
    
    return { elbo, gradients };
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
        zeroLogitLogVar: arr[1],
        valueMean: arr[2],
        valueLogVar: arr[3],
        valueSigma: Math.abs(arr[4])  // Just ensure positive, no bounds
    });
    
    let paramArray = paramsToArray(params);
    let oldELBO = -Infinity;
    let oldParams = [...paramArray];  // Track for parameter-based convergence

    if (this.debugMode) {
        console.log('\n=== Initialization ===');
        console.log('Empirical zero prob:', (zeros / n).toFixed(4));
        console.log('Non-zero count:', nonZeros.length);
        
        if (nonZeros.length > 0) {
          const logNonZeros = nonZeros.map(x => Math.log(x));
          console.log('Data log-mean:', jStat.mean(logNonZeros).toFixed(4));
          console.log('Data log-std:', Math.sqrt(jStat.variance(logNonZeros, true)).toFixed(4));
          
          // Check for extreme values
          const sorted = [...nonZeros].sort((a, b) => a - b);
          console.log('Non-zero quantiles:');
          console.log('  Min:', sorted[0].toFixed(6));
          console.log('  25%:', sorted[Math.floor(sorted.length * 0.25)].toFixed(6));
          console.log('  50%:', sorted[Math.floor(sorted.length * 0.5)].toFixed(6));
          console.log('  75%:', sorted[Math.floor(sorted.length * 0.75)].toFixed(6));
          console.log('  Max:', sorted[sorted.length - 1].toFixed(6));
        }
        
        console.log('\nInitial parameters:');
        console.log('  zeroLogitMean:', params.zeroLogitMean.toFixed(4));
        console.log('  zero prob:', (1 / (1 + Math.exp(-params.zeroLogitMean))).toFixed(4));
        console.log('  valueMean:', params.valueMean.toFixed(4));
        console.log('  valueSigma:', params.valueSigma.toFixed(4));
        
        // Compute initial log-likelihood to see if we start in a terrible place
        const { elbo } = this.computeAnalyticalGradients(params, data);
        console.log('  Initial ELBO:', elbo.toFixed(4));
      }   
    
    for (iterations = 0; iterations < this.maxIterations; iterations++) {
      // Use analytical gradients instead of finite differences!
      const { elbo, gradients } = this.computeAnalyticalGradients(
        arrayToParams(paramArray), 
        data
      );
      
      // Store ELBO history
      elboHistory.push(elbo);
      
      // Check for convergence based on parameter change
      if (iterations > 0) {
        const paramChange = Math.sqrt(
          paramArray.reduce((sum, p, i) => sum + Math.pow(p - oldParams[i], 2), 0)
        );
        
        // Relative parameter change
        const paramNorm = Math.sqrt(paramArray.reduce((sum, p) => sum + p * p, 0));
        const relativeChange = paramChange / (paramNorm + 1e-10);
        
        if (relativeChange < this.tolerance) {
          converged = true;
          break;
        }
      }
      
      oldELBO = elbo;
      oldParams = [...paramArray];
      
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