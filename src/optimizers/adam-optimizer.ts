// Standalone Adam Optimizer for Variational Inference
// No external dependencies needed

/**
 * Adam optimizer parameters
 */
export interface AdamParams {
    learningRate?: number;
    beta1?: number;  // Momentum decay
    beta2?: number;  // RMSprop decay
    epsilon?: number;  // Numerical stability
    maxIterations?: number;
    tolerance?: number;
    gradientClip?: number;
  }
  
  /**
   * Adam optimizer state
   */
  export interface AdamState {
    m: number[];  // First moment estimates
    v: number[];  // Second moment estimates
    t: number;    // Time step
  }
  
  /**
   * Lightweight Adam optimizer implementation
   * Based on Kingma & Ba 2014: "Adam: A Method for Stochastic Optimization"
   */
  export class AdamOptimizer {
    private params: Required<AdamParams>;
    private state: AdamState | null = null;
    
    constructor(params: AdamParams = {}) {
      this.params = {
        learningRate: params.learningRate ?? 0.001,
        beta1: params.beta1 ?? 0.9,
        beta2: params.beta2 ?? 0.999,
        epsilon: params.epsilon ?? 1e-8,
        maxIterations: params.maxIterations ?? 1000,
        tolerance: params.tolerance ?? 1e-6,
        gradientClip: params.gradientClip ?? 10.0
      };
    }
    
    /**
     * Initialize optimizer state
     */
    private initializeState(dimension: number): void {
      this.state = {
        m: new Array(dimension).fill(0),
        v: new Array(dimension).fill(0),
        t: 0
      };
    }
    
    /**
     * Clip gradient to prevent explosions
     */
    private clipGradient(gradient: number[]): number[] {
      const norm = Math.sqrt(gradient.reduce((sum, g) => sum + g * g, 0));
      
      if (norm > this.params.gradientClip) {
        const scale = this.params.gradientClip / norm;
        return gradient.map(g => g * scale);
      }
      
      return gradient;
    }
    
    /**
     * Perform one Adam update step
     */
    step(
      currentParams: number[],
      gradient: number[]
    ): number[] {
      // Initialize state on first call
      if (!this.state) {
        this.initializeState(currentParams.length);
      }
      
      const state = this.state!;
      state.t += 1;
      
      // Clip gradients
      const clippedGrad = this.clipGradient(gradient);
      
      // Update biased first moment estimate
      state.m = state.m.map((m, i) => 
        this.params.beta1 * m + (1 - this.params.beta1) * clippedGrad[i]
      );
      
      // Update biased second raw moment estimate
      state.v = state.v.map((v, i) => 
        this.params.beta2 * v + (1 - this.params.beta2) * clippedGrad[i] * clippedGrad[i]
      );
      
      // Compute bias-corrected first moment estimate
      const mHat = state.m.map(m => 
        m / (1 - Math.pow(this.params.beta1, state.t))
      );
      
      // Compute bias-corrected second raw moment estimate
      const vHat = state.v.map(v => 
        v / (1 - Math.pow(this.params.beta2, state.t))
      );
      
      // Update parameters
      return currentParams.map((p, i) => 
        p - this.params.learningRate * mHat[i] / (Math.sqrt(vHat[i]) + this.params.epsilon)
      );
    }
    
    /**
     * Minimize a function using Adam
     */
    minimize(
      objectiveFn: (params: number[]) => number,
      gradientFn: (params: number[]) => number[],
      initialParams: number[]
    ): {
      params: number[];
      value: number;
      iterations: number;
      converged: boolean;
    } {
      let params = [...initialParams];
      let prevParams = [...params];
      let iterations = 0;
      let converged = false;
      
      // Reset state for new optimization
      this.state = null;
      
      for (iterations = 0; iterations < this.params.maxIterations; iterations++) {
        // Compute gradient
        const gradient = gradientFn(params);
        
        // Update parameters
        prevParams = [...params];
        params = this.step(params, gradient);
        
        // Check convergence
        const paramChange = Math.sqrt(
          params.reduce((sum, p, i) => sum + Math.pow(p - prevParams[i], 2), 0)
        );
        
        if (paramChange < this.params.tolerance) {
          converged = true;
          break;
        }
      }
      
      return {
        params,
        value: objectiveFn(params),
        iterations,
        converged
      };
    }
    
    /**
     * Reset optimizer state
     */
    reset(): void {
      this.state = null;
    }
  }