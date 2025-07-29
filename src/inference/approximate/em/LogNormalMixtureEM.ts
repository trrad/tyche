/**
 * LogNormal Mixture EM with optional fast M-step optimization
 * 
 * Performance optimization: Set useFastMStep: true for 10-100x speedup
 * - Fast mode: Direct parameter updates in log space, no fitWeighted calls
 * - Bayesian mode: Original behavior with full posterior updates
 * 
 * Usage:
 *   const fastEngine = new LogNormalMixtureEM({ useFastMStep: true });
 *   const result = await fastEngine.fit({ data: revenueData });
 */
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
  
  sample(n: number = 1): number[] {
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
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
      samples.push(selectedComponent.posterior.sample(1)[0]);
    }
    return samples;
  }
  
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Delegate to each component's posterior
    return this.components.map(c => c.posterior.credibleInterval(level)[0]);
  }

  logPdf(data: number): number {
    // Compute log-likelihood of data point under the mixture
    const logProbs = this.components.map(comp => {
      const logCompProb = comp.posterior.logPdf(data);
      return Math.log(comp.weight) + logCompProb;
    });
    
    // Use log-sum-exp trick for numerical stability
    const maxLogProb = Math.max(...logProbs);
    const logSumExp = maxLogProb + Math.log(
      logProbs.reduce((sum, lp) => sum + Math.exp(lp - maxLogProb), 0)
    );
    
    return logSumExp;
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

  /**
   * Get mixture components in standardized format
   * Returns same interface as NormalMixturePosterior.getComponents()
   */
  getComponents(): { mean: number; variance: number; weight: number }[] {
    return this.components.map(c => ({
      mean: c.posterior.mean()[0],
      variance: c.posterior.variance()[0],
      weight: c.weight
    }));
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
  private readonly useFastMStep: boolean;
  
  constructor(options?: {
    numComponents?: number;
    maxIterations?: number;
    tolerance?: number;
    useFastMStep?: boolean;  // New option for performance optimization
  }) {
    super('LogNormal Mixture EM');
    this.numComponents = options?.numComponents || 2;
    this.maxIterations = options?.maxIterations || 100;
    this.tolerance = options?.tolerance || 1e-4; // Relax from 1e-6
    this.useFastMStep = options?.useFastMStep !== undefined ? options.useFastMStep : true;
  }
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    this.validateInput(data);
    
    if (!Array.isArray(data.data)) {
      throw new Error('LogNormal mixture requires array data');
    }
    
    const values = data.data;
    
    // Check all values are positive and filter out non-positive values
    const positiveValues = values.filter(x => x > 0);
    if (positiveValues.length === 0) {
      throw new Error('LogNormal requires at least one positive value');
    }
    
    if (positiveValues.length < values.length) {
      console.warn(`LogNormalMixtureEM: Filtered out ${values.length - positiveValues.length} non-positive values`);
    }
    
    // Transform to log scale
    const logValues = positiveValues.map(x => Math.log(x));
    const n = logValues.length;
    
    // Get requested components and be honest about what we can support
    const requestedComponents = data.config?.numComponents || this.numComponents;
    const maxViableComponents = Math.floor(n / 8); // More lenient: ~8 points minimum per component
    const actualComponents = Math.min(requestedComponents, maxViableComponents);
    
    // Warn if we had to reduce components
    if (actualComponents < requestedComponents) {
      console.warn(`LogNormalMixtureEM: Reduced components from ${requestedComponents} to ${actualComponents} due to data size (${n} points)`);
    }
    
    // If we can't support multiple components, fallback to single LogNormal
    if (actualComponents <= 1) {
      console.warn(`LogNormalMixtureEM: Insufficient data for mixture (${n} points), falling back to single LogNormal`);
      const singleComponent = new LogNormalBayesian();
      return singleComponent.fit(data, options);
    }
    
    // Initialize components with the honest count
    const components = await this.initializeComponents(logValues, options, actualComponents);
    
    // EM algorithm
    let prevLogLik = -Infinity;
    let iter = 0;
    
    for (; iter < this.maxIterations; iter++) {
      // E-step: compute responsibilities
      const responsibilities = this.eStep(logValues, components);
      
      // M-step: use fast or Bayesian approach
      if (this.useFastMStep) {
        this.mStepFast(logValues, responsibilities, components);
      } else {
        await this.mStep(logValues, responsibilities, components, options);
      }
      
      // Enforce ordering constraint μ₁ ≤ μ₂ ≤ ... ≤ μₖ
      this.enforceOrdering(components);
      
      // Compute log-likelihood
      const logLik = this.computeLogLikelihood(logValues, components);
      
      // Check convergence
      if (Math.abs(logLik - prevLogLik) < this.tolerance || 
          (logLik - prevLogLik) < 0 && Math.abs(logLik - prevLogLik) < this.tolerance * 10) {
        break; // Allow small decreases due to numerical errors
      }
      prevLogLik = logLik;
    }
    
    return {
      posterior: new LogNormalMixturePosterior(components, n),
      diagnostics: {
        converged: iter < this.maxIterations,
        iterations: iter,
        runtime: 0,
        finalLogLikelihood: prevLogLik,
        modelType: 'lognormal-mixture'
      }
    };
  }
  
  private async initializeComponents(
    logValues: number[], 
    options?: FitOptions,
    numComponents?: number
  ): Promise<LogNormalComponent[]> {
    // Use k-means++ initialization on log values
    const k = numComponents || this.numComponents;
    const centers = this.kMeansPlusPlus(logValues, k);
    
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
  
  /**
   * Fast M-step with direct updates in log space
   * Optimized version that avoids fitWeighted calls
   */
  private mStepFast(
    logValues: number[],
    responsibilities: number[][],
    components: LogNormalComponent[]
  ): void {
    const n = logValues.length;
    const k = components.length;
    
    for (let j = 0; j < k; j++) {
      // Effective sample size for this component
      const Nj = responsibilities.reduce((sum, r) => sum + r[j], 0);
      
      // Update mixture weight
      components[j].weight = Nj / n;
      
      // Skip update if component has no responsibility
      if (Nj < 1e-10) continue;
      
      // Weighted mean in log space
      const muLog = responsibilities.reduce(
        (sum, r, i) => sum + r[j] * logValues[i], 0
      ) / Nj;
      
      // Weighted variance in log space
      const varLog = responsibilities.reduce(
        (sum, r, i) => sum + r[j] * Math.pow(logValues[i] - muLog, 2), 0
      ) / Nj;
      
      const sigmaLog = Math.sqrt(varLog);
      
      // Create a simple posterior object with these parameters
      // This avoids the overhead of fitWeighted while maintaining the interface
      components[j].posterior = {
        mean(): number[] {
          // E[X] for lognormal
          return [Math.exp(muLog + sigmaLog * sigmaLog / 2)];
        },
        variance(): number[] {
          // Var[X] for lognormal
          const m = this.mean()[0];
          return [m * m * (Math.exp(sigmaLog * sigmaLog) - 1)];
        },
        sample(n: number = 1): number[] {
          const samples: number[] = [];
          for (let i = 0; i < n; i++) {
            // Sample from lognormal using Box-Muller transform
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            samples.push(Math.exp(muLog + sigmaLog * z));
          }
          return samples;
        },
        credibleInterval(level: number = 0.95): Array<[number, number]> {
          // Use normal approximation for credible interval
          const alpha = (1 - level) / 2;
          const zAlpha = jStat.normal.inv(alpha, 0, 1);
          const lower = Math.exp(muLog + sigmaLog * zAlpha);
          const upper = Math.exp(muLog + sigmaLog * (-zAlpha));
          return [[lower, upper]];
        },
        logPdf(data: number): number {
          // LogNormal PDF
          if (data <= 0) return -Infinity;
          const logData = Math.log(data);
          const z = (logData - muLog) / sigmaLog;
          return -logData - 0.5 * Math.log(2 * Math.PI) - Math.log(sigmaLog) - 0.5 * z * z;
        }
      };
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