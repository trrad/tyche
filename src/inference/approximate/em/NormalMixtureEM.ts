/**
 * Normal Mixture Model using Expectation-Maximization
 * Extracted from vi-engine.ts with numerical stability improvements preserved
 */

import jStat from 'jstat';
import { InferenceEngine } from '../../base/InferenceEngine';
import { 
  DataInput, 
  FitOptions, 
  InferenceResult, 
  Posterior 
} from '../../base/types';

/**
 * Parameters for a normal mixture component
 */
interface ComponentParams {
  mean: number;
  variance: number;
  weight: number;
}

/**
 * Normal mixture posterior
 */
class NormalMixturePosterior implements Posterior {
  constructor(
    private readonly components: ComponentParams[],
    private readonly data: number[]  // Keep data for sampling
  ) {}
  
  mean(): number[] {
    // Return means of all components
    return this.components.map(c => c.mean);
  }
  
  variance(): number[] {
    // Return variances of all components
    return this.components.map(c => c.variance);
  }
  
  sample(): number[] {
    // Sample a component based on weights
    const weights = this.components.map(c => c.weight);
    const cumWeights = weights.reduce((acc, w, i) => {
      acc.push(i === 0 ? w : acc[i-1] + w);
      return acc;
    }, [] as number[]);
    
    const u = Math.random();
    let componentIdx = cumWeights.findIndex(cw => u <= cw);
    if (componentIdx === -1) componentIdx = this.components.length - 1;
    
    const component = this.components[componentIdx];
    const z = jStat.normal.sample(0, 1);
    
    return [component.mean + Math.sqrt(component.variance) * z];
  }
  
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // For mixture, return interval containing most probability mass
    // This is approximate - uses data quantiles
    const alpha = (1 - level) / 2;
    const sorted = [...this.data].sort((a, b) => a - b);
    const lowerIdx = Math.floor(alpha * sorted.length);
    const upperIdx = Math.floor((1 - alpha) * sorted.length);
    
    return [[sorted[lowerIdx], sorted[upperIdx]]];
  }
  
  /**
   * Get mixture parameters
   */
  getComponents(): ComponentParams[] {
    return this.components.map(c => ({ ...c }));
  }
  
  /**
   * Get overall mean of mixture
   */
  overallMean(): number {
    return this.components.reduce((sum, c) => sum + c.weight * c.mean, 0);
  }
  
  /**
   * Get overall variance of mixture
   */
  overallVariance(): number {
    const mean = this.overallMean();
    return this.components.reduce((sum, c) => {
      const componentVar = c.variance + Math.pow(c.mean - mean, 2);
      return sum + c.weight * componentVar;
    }, 0);
  }
}

/**
 * EM algorithm for Normal mixture models
 * Supports 1-4 components with automatic selection
 */
export class NormalMixtureEM extends InferenceEngine {
  private readonly minVariance = 1e-10;
  private readonly logTwoPi = Math.log(2 * Math.PI);
  
  constructor() {
    super('Normal Mixture EM');
  }
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    this.validateInput(data);
    
    if (!Array.isArray(data.data)) {
      throw new Error('NormalMixtureEM requires array data');
    }
    
    const values = data.data;
    const numComponents = data.config?.numComponents || 2;
    
    if (numComponents < 1 || numComponents > 4) {
      throw new Error('Number of components must be between 1 and 4');
    }
    
    // Handle degenerate cases
    if (values.length < numComponents) {
      return this.handleDegenerateCase(values);
    }
    
    // Run EM algorithm
    const maxIterations = options?.maxIterations || 100;
    const tolerance = options?.tolerance || 1e-6;
    
    const { result, runtime } = await this.measureRuntime(
      () => this.runEM(values, numComponents, maxIterations, tolerance)
    );
    
    const { components, converged, iterations, logLikelihoodHistory } = result;
    
    return {
      posterior: new NormalMixturePosterior(components, values),
      diagnostics: {
        converged,
        iterations,
        finalELBO: logLikelihoodHistory[logLikelihoodHistory.length - 1],
        elboHistory: logLikelihoodHistory,
        runtime,
        modelType: 'normal-mixture'
      }
    };
  }
  
  private async runEM(
    data: number[],
    K: number,
    maxIterations: number,
    tolerance: number
  ): Promise<{
    components: ComponentParams[];
    converged: boolean;
    iterations: number;
    logLikelihoodHistory: number[];
  }> {
    // Initialize with k-means++
    let components = this.initializeKMeansPlusPlus(data, K);
    
    const logLikelihoodHistory: number[] = [];
    let oldLogLikelihood = -Infinity;
    let converged = false;
    let iterations = 0;
    
    for (let iter = 0; iter < maxIterations; iter++) {
      iterations = iter + 1;
      
      // E-step: compute responsibilities
      const { responsibilities, logLikelihood } = this.eStep(data, components);
      logLikelihoodHistory.push(logLikelihood);
      
      // Check convergence
      if (Math.abs(logLikelihood - oldLogLikelihood) < tolerance) {
        converged = true;
        break;
      }
      oldLogLikelihood = logLikelihood;
      
      // M-step: update parameters
      components = this.mStep(data, responsibilities);
      
      // Prevent degenerate solutions
      components = this.preventDegeneracy(components);
    }
    
    return { components, converged, iterations, logLikelihoodHistory };
  }
  
  private eStep(data: number[], components: ComponentParams[]): {
    responsibilities: number[][];
    logLikelihood: number;
  } {
    const n = data.length;
    const K = components.length;
    const responsibilities: number[][] = Array(n).fill(null).map(() => Array(K).fill(0));
    let logLikelihood = 0;
    
    for (let i = 0; i < n; i++) {
      const logProbs: number[] = [];
      
      for (let k = 0; k < K; k++) {
        const logProb = this.logNormalPdf(data[i], components[k].mean, Math.sqrt(components[k].variance));
        logProbs.push(Math.log(components[k].weight) + logProb);
      }
      
      // Log-sum-exp trick for numerical stability
      const maxLogProb = Math.max(...logProbs);
      const logSumExp = maxLogProb + Math.log(
        logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0)
      );
      
      logLikelihood += logSumExp;
      
      // Compute responsibilities
      for (let k = 0; k < K; k++) {
        responsibilities[i][k] = Math.exp(logProbs[k] - logSumExp);
      }
    }
    
    return { responsibilities, logLikelihood };
  }
  
  private mStep(data: number[], responsibilities: number[][]): ComponentParams[] {
    const n = data.length;
    const K = responsibilities[0].length;
    const components: ComponentParams[] = [];
    
    for (let k = 0; k < K; k++) {
      // Compute Nk (effective number of points)
      const Nk = responsibilities.reduce((sum, r) => sum + r[k], 0);
      
      if (Nk < 1e-10) {
        // Component has no responsibility - reinitialize randomly
        const randomIdx = Math.floor(Math.random() * n);
        components.push({
          mean: data[randomIdx],
          variance: this.computeVariance(data),
          weight: 1 / K
        });
        continue;
      }
      
      // Update mean
      const mean = responsibilities.reduce((sum, r, i) => sum + r[k] * data[i], 0) / Nk;
      
      // Update variance
      const variance = responsibilities.reduce(
        (sum, r, i) => sum + r[k] * Math.pow(data[i] - mean, 2), 
        0
      ) / Nk;
      
      // Update weight
      const weight = Nk / n;
      
      components.push({ mean, variance, weight });
    }
    
    // Normalize weights
    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    components.forEach(c => c.weight /= totalWeight);
    
    return components;
  }
  
  private initializeKMeansPlusPlus(data: number[], K: number): ComponentParams[] {
    const n = data.length;
    const centers: number[] = [];
    
    // Choose first center randomly
    centers.push(data[Math.floor(Math.random() * n)]);
    
    // Choose remaining centers
    for (let k = 1; k < K; k++) {
      const distances = data.map(x => {
        const minDist = Math.min(...centers.map(c => Math.abs(x - c)));
        return minDist * minDist;
      });
      
      // Sample proportional to squared distance
      const totalDist = distances.reduce((a, b) => a + b, 0);
      const probs = distances.map(d => d / totalDist);
      
      let cumSum = 0;
      const r = Math.random();
      for (let i = 0; i < n; i++) {
        cumSum += probs[i];
        if (r <= cumSum) {
          centers.push(data[i]);
          break;
        }
      }
    }
    
    // Initialize components around centers
    const dataVariance = this.computeVariance(data);
    return centers.map(center => ({
      mean: center,
      variance: Math.max(dataVariance / K, this.minVariance), // Ensure minimum variance
      weight: 1 / K
    }));
  }
  
  private logNormalPdf(x: number, mean: number, std: number): number {
    const variance = std * std;
    return -0.5 * (this.logTwoPi + Math.log(variance) + Math.pow(x - mean, 2) / variance);
  }
  
  private computeVariance(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
  }
  
  private preventDegeneracy(components: ComponentParams[]): ComponentParams[] {
    return components.map(c => ({
      ...c,
      variance: Math.max(c.variance, this.minVariance)
    }));
  }
  
  private handleDegenerateCase(values: number[]): InferenceResult {
    // For very small datasets, fit single component
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.length > 1 
      ? values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / values.length
      : 1;
    
    const components = [{ mean, variance, weight: 1 }];
    
    return {
      posterior: new NormalMixturePosterior(components, values),
      diagnostics: {
        converged: true,
        iterations: 0,
        runtime: 0,
        modelType: 'normal-mixture'
      }
    };
  }
  
  canHandle(data: DataInput): boolean {
    return Array.isArray(data.data) && data.data.length > 0;
  }
  
  getDescription(): string {
    return 'Expectation-Maximization algorithm for fitting Normal mixture models (1-4 components)';
  }
}

export { NormalMixturePosterior };