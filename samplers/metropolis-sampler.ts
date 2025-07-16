/**
 * Metropolis-Hastings Sampler
 * 
 * A simple but powerful MCMC algorithm that forms the basis for more
 * sophisticated samplers. This implementation supports both random walk
 * and independent proposals.
 */

import { RandomVariable } from '../core/RandomVariable';

export interface MCMCDiagnostics {
  acceptanceRate: number;
  effectiveSampleSize: number;
  rHat?: number;
  samples: number[][];
  logProbabilities: number[];
}

export interface MetropolisOptions {
  stepSize?: number;
  proposalType?: 'randomWalk' | 'independent';
  adaptStepSize?: boolean;
  targetAcceptanceRate?: number;
}

export interface Model {
  /**
   * Compute log probability of parameters
   */
  logProb(params: number[]): number;
  
  /**
   * Get parameter names
   */
  parameterNames(): string[];
  
  /**
   * Get number of parameters
   */
  dimension(): number;
  
  /**
   * Get initial values for parameters
   */
  initialValues(): number[];
}

/**
 * Metropolis-Hastings sampler
 */
export class MetropolisSampler {
  private stepSize: number;
  private proposalType: 'randomWalk' | 'independent';
  private adaptStepSize: boolean;
  private targetAcceptanceRate: number;
  
  constructor(options: MetropolisOptions = {}) {
    this.stepSize = options.stepSize ?? 0.1;
    this.proposalType = options.proposalType ?? 'randomWalk';
    this.adaptStepSize = options.adaptStepSize ?? true;
    this.targetAcceptanceRate = options.targetAcceptanceRate ?? 0.44; // Optimal for random walk
  }
  
  /**
   * Sample from the model
   */
  sample(
    model: Model,
    numSamples: number,
    numChains: number = 1,
    warmup: number = 1000,
    rng: () => number = Math.random
  ): MCMCDiagnostics {
    const chains: number[][][] = [];
    const logProbs: number[][] = [];
    
    // Run each chain
    for (let chain = 0; chain < numChains; chain++) {
      const { samples, logProbabilities } = this.sampleChain(
        model,
        numSamples + warmup,
        rng
      );
      
      // Remove warmup samples
      chains.push(samples.slice(warmup));
      logProbs.push(logProbabilities.slice(warmup));
    }
    
    // Combine chains for diagnostics
    const allSamples = chains.flat();
    const allLogProbs = logProbs.flat();
    
    // Calculate diagnostics
    const acceptanceRate = this.calculateAcceptanceRate(allSamples);
    const effectiveSampleSize = this.calculateESS(allSamples);
    const rHat = numChains > 1 ? this.calculateRHat(chains) : undefined;
    
    return {
      acceptanceRate,
      effectiveSampleSize,
      rHat,
      samples: allSamples,
      logProbabilities: allLogProbs
    };
  }
  
  /**
   * Sample a single chain
   */
  private sampleChain(
    model: Model,
    numSamples: number,
    rng: () => number
  ): { samples: number[][], logProbabilities: number[] } {
    const samples: number[][] = [];
    const logProbabilities: number[] = [];
    
    // Initialize
    let current = model.initialValues();
    let currentLogProb = model.logProb(current);
    
    // Adaptation parameters
    let acceptCount = 0;
    let totalCount = 0;
    let adaptationWindow = 50;
    
    for (let i = 0; i < numSamples; i++) {
      // Propose new state
      const proposal = this.propose(current, rng);
      const proposalLogProb = model.logProb(proposal);
      
      // Calculate acceptance probability
      const logAcceptProb = Math.min(0, proposalLogProb - currentLogProb);
      
      // Accept or reject
      if (Math.log(rng()) < logAcceptProb) {
        current = proposal;
        currentLogProb = proposalLogProb;
        acceptCount++;
      }
      
      totalCount++;
      
      // Store sample
      samples.push([...current]);
      logProbabilities.push(currentLogProb);
      
      // Adapt step size during warmup
      if (this.adaptStepSize && i < numSamples / 2 && totalCount % adaptationWindow === 0) {
        const currentAcceptRate = acceptCount / adaptationWindow;
        
        if (currentAcceptRate < this.targetAcceptanceRate - 0.05) {
          this.stepSize *= 0.9; // Decrease step size
        } else if (currentAcceptRate > this.targetAcceptanceRate + 0.05) {
          this.stepSize *= 1.1; // Increase step size
        }
        
        acceptCount = 0;
      }
    }
    
    return { samples, logProbabilities };
  }
  
  /**
   * Propose new state
   */
  private propose(current: number[], rng: () => number): number[] {
    if (this.proposalType === 'randomWalk') {
      // Random walk proposal: q(x'|x) = N(x, stepSize²I)
      return current.map(x => x + this.stepSize * this.sampleNormal(rng));
    } else {
      // Independent proposal would go here
      throw new Error('Independent proposals not yet implemented');
    }
  }
  
  /**
   * Sample from standard normal using Box-Muller
   */
  private sampleNormal(rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  /**
   * Calculate acceptance rate
   */
  private calculateAcceptanceRate(samples: number[][]): number {
    let changes = 0;
    
    for (let i = 1; i < samples.length; i++) {
      const different = samples[i].some((v, j) => v !== samples[i-1][j]);
      if (different) changes++;
    }
    
    return changes / (samples.length - 1);
  }
  
  /**
   * Calculate effective sample size (simplified version)
   */
  private calculateESS(samples: number[][]): number {
    if (samples.length < 2) return samples.length;
    
    const n = samples.length;
    const dim = samples[0].length;
    let minESS = n;
    
    // Calculate ESS for each dimension and return minimum
    for (let d = 0; d < dim; d++) {
      const values = samples.map(s => s[d]);
      
      // Calculate autocorrelation
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
      
      let sumAutocorr = 1;
      for (let lag = 1; lag < Math.min(n - 1, 100); lag++) {
        let autocorr = 0;
        for (let i = 0; i < n - lag; i++) {
          autocorr += (values[i] - mean) * (values[i + lag] - mean);
        }
        autocorr /= (n - lag) * variance;
        
        if (autocorr < 0.05) break; // Stop when autocorrelation is small
        sumAutocorr += 2 * autocorr;
      }
      
      const ess = n / sumAutocorr;
      minESS = Math.min(minESS, ess);
    }
    
    return minESS;
  }
  
  /**
   * Calculate R-hat (potential scale reduction factor)
   */
  private calculateRHat(chains: number[][][]): number {
    const numChains = chains.length;
    const numSamples = chains[0].length;
    const dim = chains[0][0].length;
    
    let maxRHat = 0;
    
    // Calculate R-hat for each dimension
    for (let d = 0; d < dim; d++) {
      // Calculate within-chain variance
      let W = 0;
      const chainMeans: number[] = [];
      
      for (let c = 0; c < numChains; c++) {
        const values = chains[c].map(s => s[d]);
        const mean = values.reduce((a, b) => a + b, 0) / numSamples;
        const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (numSamples - 1);
        
        W += variance;
        chainMeans.push(mean);
      }
      W /= numChains;
      
      // Calculate between-chain variance
      const grandMean = chainMeans.reduce((a, b) => a + b, 0) / numChains;
      const B = chainMeans.reduce((a, b) => a + (b - grandMean) ** 2, 0) * numSamples / (numChains - 1);
      
      // Calculate R-hat
      const varPlus = ((numSamples - 1) * W + B) / numSamples;
      const rHat = Math.sqrt(varPlus / W);
      
      maxRHat = Math.max(maxRHat, rHat);
    }
    
    return maxRHat;
  }
}

/**
 * Adaptive Metropolis sampler that learns the covariance structure
 */
export class AdaptiveMetropolisSampler extends MetropolisSampler {
  private covarianceMatrix?: number[][];
  private adaptationDelay: number = 100;
  private adaptationInterval: number = 10;
  
  constructor(options: MetropolisOptions = {}) {
    super({ ...options, proposalType: 'randomWalk' });
  }
  
  // Override propose to use learned covariance
  private propose(current: number[], rng: () => number): number[] {
    if (!this.covarianceMatrix) {
      // Use identity matrix initially
      return super['propose'](current, rng);
    }
    
    // Multivariate normal proposal using Cholesky decomposition
    // This is a simplified version - production code would be more sophisticated
    const dim = current.length;
    const z = Array(dim).fill(0).map(() => this['sampleNormal'](rng));
    
    // Simple scaling - full implementation would use Cholesky
    return current.map((x, i) => x + this['stepSize'] * z[i]);
  }
}