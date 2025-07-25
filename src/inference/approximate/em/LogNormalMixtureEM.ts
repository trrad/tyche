import jStat from 'jstat';
import { InferenceEngine } from '../../base/InferenceEngine';
import { DataInput, FitOptions, InferenceResult, Posterior } from '../../base/types';
import { LogNormalBayesian } from '../../exact/LogNormalInference';

/**
 * Component of a LogNormal mixture with its inference engine
 */
interface LogNormalComponent {
  weight: number;
  inference: LogNormalBayesian;
  posterior: Posterior;
}

/**
 * Posterior for LogNormal mixture model
 * Composes multiple LogNormalBayesian posteriors
 */
export class LogNormalMixturePosterior implements Posterior {
  constructor(
    private readonly components: LogNormalComponent[],
    private readonly sampleSize: number
  ) {}
  
  mean(): number[] {
    // Delegate to each component's posterior
    return this.components.map(c => c.posterior.mean()[0]);
  }
  
  variance(): number[] {
    // Delegate to each component's posterior
    return this.components.map(c => c.posterior.variance()[0]);
  }
  
  sample(): number[] {
    // First sample which component
    const u = Math.random();
    let cumWeight = 0;
    let selectedComponent: LogNormalComponent | null = null;
    
    for (const comp of this.components) {
      cumWeight += comp.weight;
      if (u <= cumWeight) {
        selectedComponent = comp;
        break;
      }
    }
    
    if (!selectedComponent) {
      selectedComponent = this.components[this.components.length - 1];
    }
    
    // Delegate to selected component's posterior
    return selectedComponent.posterior.sample();
  }
  
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Delegate to each component's posterior
    return this.components.map(c => c.posterior.credibleInterval(level)[0]);
  }
  
  /**
   * Get mixture weights
   */
  getWeights(): number[] {
    return this.components.map(c => c.weight);
  }
  
  /**
   * Get component posteriors
   */
  getComponentPosteriors(): Posterior[] {
    return this.components.map(c => c.posterior);
  }
  
  /**
   * Expected value of the mixture
   */
  expectedValue(): number {
    return this.components.reduce((sum, comp) => 
      sum + comp.weight * comp.posterior.mean()[0], 0
    );
  }
  
  /**
   * Get component parameters for diagnostics
   * Note: This assumes LogNormalPosterior has getParameters() method
   */
  getComponentParameters(): any[] {
    return this.components.map(c => {
      // If the posterior has a getParameters method, use it
      if ('getParameters' in c.posterior) {
        return (c.posterior as any).getParameters();
      }
      // Otherwise return basic info
      return {
        weight: c.weight,
        mean: c.posterior.mean()[0],
        variance: c.posterior.variance()[0]
      };
    });
  }
}

/**
 * LogNormal mixture model using EM with conjugate updates
 * Composes LogNormalBayesian for each component
 */
export class LogNormalMixtureEM extends InferenceEngine {
  private readonly maxIterations: number;
  private readonly tolerance: number;
  private readonly numComponents: number;
  
  constructor(options?: {
    numComponents?: number;
    maxIterations?: number;
    tolerance?: number;
  }) {
    super('LogNormal Mixture EM');
    this.numComponents = options?.numComponents || 2;
    this.maxIterations = options?.maxIterations || 100;
    this.tolerance = options?.tolerance || 1e-6;
  }
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    this.validateInput(data);
    
    if (!Array.isArray(data.data)) {
      throw new Error('LogNormal mixture requires array data');
    }
    
    const values = data.data;
    
    // Check all values are positive
    if (values.some(x => x <= 0)) {
      throw new Error('LogNormal requires all positive values');
    }
    
    // Transform to log scale
    const logValues = values.map(x => Math.log(x));
    const n = logValues.length;
    
    // Initialize components
    const components = await this.initializeComponents(logValues, options);
    
    // EM algorithm
    let prevLogLik = -Infinity;
    let iter = 0;
    
    for (; iter < this.maxIterations; iter++) {
      // E-step: compute responsibilities
      const responsibilities = this.eStep(logValues, components);
      
      // M-step: update components using LogNormalBayesian
      await this.mStep(logValues, responsibilities, components, options);
      
      // Enforce ordering constraint μ₁ ≤ μ₂ ≤ ... ≤ μₖ
      this.enforceOrdering(components);
      
      // Compute log-likelihood
      const logLik = this.computeLogLikelihood(logValues, components);
      
      // Check convergence
      if (Math.abs(logLik - prevLogLik) < this.tolerance) {
        break;
      }
      prevLogLik = logLik;
    }
    
    return {
      posterior: new LogNormalMixturePosterior(components, n),
      diagnostics: {
        converged: iter < this.maxIterations,
        iterations: iter,
        runtime: 0,
        finalLogLikelihood: prevLogLik
      }
    };
  }
  
  private async initializeComponents(
    logValues: number[], 
    options?: FitOptions
  ): Promise<LogNormalComponent[]> {
    // Use k-means++ initialization on log values
    const centers = this.kMeansPlusPlus(logValues, this.numComponents);
    
    // Initialize components around these centers
    const components: LogNormalComponent[] = [];
    
    for (let i = 0; i < centers.length; i++) {
      // Get points closest to this center
      const assignments = this.assignToCenters(logValues, centers);
      const clusterData = logValues.filter((_, j) => assignments[j] === i);
      
      if (clusterData.length === 0) {
        // Empty cluster, use center point
        clusterData.push(centers[i]);
      }
      
      // Create inference engine for this component
      const inference = new LogNormalBayesian();
      
      // Fit initial model to cluster data
      // Transform back to original scale for LogNormalBayesian
      const originalScaleData = clusterData.map(x => Math.exp(x));
      const result = await inference.fit(
        { data: originalScaleData },
        options
      );
      
      components.push({
        weight: clusterData.length / logValues.length,
        inference: inference,
        posterior: result.posterior
      });
    }
    
    return components;
  }
  
  private kMeansPlusPlus(data: number[], k: number): number[] {
    const centers: number[] = [];
    
    // Choose first center randomly
    centers.push(data[Math.floor(Math.random() * data.length)]);
    
    // Choose remaining centers
    for (let i = 1; i < k; i++) {
      const distances = data.map(x => {
        const minDist = Math.min(...centers.map(c => Math.pow(x - c, 2)));
        return minDist;
      });
      
      // Sample proportional to squared distance
      const totalDist = distances.reduce((a, b) => a + b, 0);
      let cumSum = 0;
      const r = Math.random() * totalDist;
      
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
  
  private assignToCenters(data: number[], centers: number[]): number[] {
    return data.map(x => {
      let minDist = Infinity;
      let assignment = 0;
      
      centers.forEach((center, i) => {
        const dist = Math.pow(x - center, 2);
        if (dist < minDist) {
          minDist = dist;
          assignment = i;
        }
      });
      
      return assignment;
    });
  }
  
  private eStep(
    logValues: number[],
    components: LogNormalComponent[]
  ): number[][] {
    const n = logValues.length;
    const k = components.length;
    const responsibilities: number[][] = Array(n).fill(null).map(() => Array(k).fill(0));
    
    // Convert back to original scale for likelihood computation
    const originalValues = logValues.map(x => Math.exp(x));
    
    // Compute responsibilities using current posteriors
    for (let i = 0; i < n; i++) {
      const logProbs: number[] = [];
      
      for (let j = 0; j < k; j++) {
        const comp = components[j];
        // Get log predictive density from the posterior
        // For now, approximate using posterior mean parameters
        // TODO: Use proper posterior predictive distribution
        const posteriorMean = comp.posterior.mean()[0];
        const posteriorVar = comp.posterior.variance()[0];
        
        // Convert from E[X] and Var[X] to parameters of log(X)
        // This is an approximation - ideally we'd integrate over parameter uncertainty
        const cv2 = posteriorVar / (posteriorMean * posteriorMean);
        const sigmaLog = Math.sqrt(Math.log(1 + cv2));
        const muLog = Math.log(posteriorMean) - sigmaLog * sigmaLog / 2;
        
        const predictiveLogProb = this.logPredictiveDensity(
          originalValues[i], 
          muLog,
          sigmaLog
        );
        
        logProbs.push(predictiveLogProb + Math.log(comp.weight));
      }
      
      // Normalize using log-sum-exp trick
      const maxLogProb = Math.max(...logProbs);
      const expSum = logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0);
      const logNorm = maxLogProb + Math.log(expSum);
      
      for (let j = 0; j < k; j++) {
        responsibilities[i][j] = Math.exp(logProbs[j] - logNorm);
      }
    }
    
    return responsibilities;
  }
  
  private async mStep(
    logValues: number[],
    responsibilities: number[][],
    components: LogNormalComponent[],
    options?: FitOptions
  ): Promise<void> {
    const n = logValues.length;
    const k = components.length;
    
    // Convert back to original scale for LogNormalBayesian
    const originalValues = logValues.map(x => Math.exp(x));
    
    for (let j = 0; j < k; j++) {
      // Extract weights for this component
      const componentWeights = responsibilities.map(r => r[j]);
      
      // Effective sample size for this component
      const nj = componentWeights.reduce((sum, w) => sum + w, 0);
      
      // Update mixture weight
      components[j].weight = nj / n;
      
      // Skip update if component has no responsibility
      if (nj < 1e-10) continue;
      
      // Update component using weighted inference
      const result = await components[j].inference.fitWeighted(
        { data: originalValues },
        componentWeights,
        options
      );
      
      components[j].posterior = result.posterior;
    }
  }
  
  private enforceOrdering(components: LogNormalComponent[]): void {
    // Sort by posterior mean
    components.sort((a, b) => {
      const meanA = a.posterior.mean()[0];
      const meanB = b.posterior.mean()[0];
      return meanA - meanB;
    });
  }
  
  private logPredictiveDensity(x: number, mu: number, sigma: number): number {
    // LogNormal PDF
    if (x <= 0) return -Infinity;
    
    const logX = Math.log(x);
    const z = (logX - mu) / sigma;
    return -logX - 0.5 * Math.log(2 * Math.PI) - Math.log(sigma) - 0.5 * z * z;
  }
  
  private computeLogLikelihood(
    logValues: number[],
    components: LogNormalComponent[]
  ): number {
    const originalValues = logValues.map(x => Math.exp(x));
    let logLik = 0;
    
    for (const x of originalValues) {
      const probs = components.map(comp => {
        // Use posterior mean and variance to approximate
        const posteriorMean = comp.posterior.mean()[0];
        const posteriorVar = comp.posterior.variance()[0];
        
        // Convert to log-scale parameters
        const cv2 = posteriorVar / (posteriorMean * posteriorMean);
        const sigmaLog = Math.sqrt(Math.log(1 + cv2));
        const muLog = Math.log(posteriorMean) - sigmaLog * sigmaLog / 2;
        
        const prob = Math.exp(this.logPredictiveDensity(x, muLog, sigmaLog));
        return prob * comp.weight;
      });
      logLik += Math.log(probs.reduce((a, b) => a + b, 0));
    }
    
    return logLik;
  }
  
  canHandle(data: DataInput): boolean {
    return Array.isArray(data.data) && 
           data.data.length > this.numComponents * 5 && // Need enough data
           data.data.every(x => x > 0);
  }
  
  getDescription(): string {
    return `LogNormal mixture model with ${this.numComponents} components using EM algorithm`;
  }
}