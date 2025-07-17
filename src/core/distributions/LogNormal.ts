// src/core/distributions/LogNormal.ts
/**
 * Log-Normal distribution
 * 
 * The log-normal distribution models positive values whose logarithm is normally distributed.
 * It's useful for modeling quantities that are products of many independent positive factors,
 * such as income, stock prices, and highly skewed revenue data.
 * 
 * If X ~ LogNormal(μ, σ), then log(X) ~ Normal(μ, σ)
 * 
 * Parameterization: location (μ) and scale (σ) of the underlying normal
 * - Mean: exp(μ + σ²/2)
 * - Variance: (exp(σ²) - 1) * exp(2μ + σ²)
 * - Mode: exp(μ - σ²)
 * - PDF: (1/(x*σ*√(2π))) * exp(-(log(x)-μ)²/(2σ²)) for x > 0
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';
import { erf } from '../math/special';
import { RNG } from '../math/random';

const LOG_TWO_PI = Math.log(2 * Math.PI);

export class LogNormalRV extends RandomVariable {
  private rng: RNG;
  
  constructor(
    private mu: RandomVariable,      // location parameter (mean of log)
    private sigma: RandomVariable,   // scale parameter (std dev of log)
    graph?: ComputationGraph,
    rng?: RNG
  ) {
    const node = (graph || ComputationGraph.current()).createNode(
      'lognormal',
      [mu.getNode(), sigma.getNode()],
      (inputs) => {
        if (inputs.length < 2) return 0;
        const [muVal, sigmaVal] = inputs;
        
        // Validate parameters
        if (sigmaVal < 0) {
          throw new Error(`Invalid LogNormal sigma: ${sigmaVal}. Must be non-negative.`);
        }
        
        // Forward pass returns mean: exp(μ + σ²/2)
        return Math.exp(muVal + sigmaVal * sigmaVal / 2);
      },
      (grad, inputs) => {
        if (inputs.length < 2) return [0, 0];
        const [muVal, sigmaVal] = inputs;
        
        // mean = exp(μ + σ²/2)
        const mean = Math.exp(muVal + sigmaVal * sigmaVal / 2);
        
        // d(mean)/dμ = mean
        // d(mean)/dσ = mean * σ
        return [
          grad * mean,
          grad * mean * sigmaVal
        ];
      }
    );
    
    super(node, [], graph || ComputationGraph.current());
    this.rng = rng || new RNG();
  }
  
  /**
   * Sample from the distribution
   */
  override sample(customRng?: () => number): number {
    const muVal = this.mu.forward();
    const sigmaVal = this.sigma.forward();
    
    if (sigmaVal < 0) {
      throw new Error(`Invalid LogNormal sigma: ${sigmaVal}`);
    }
    
    if (customRng) {
      // Sample from normal and exponentiate
      const z = this.normalFromUniform(customRng);
      return Math.exp(muVal + sigmaVal * z);
    }
    
    // Use the better RNG implementation
    const z = this.rng.normal();
    return Math.exp(muVal + sigmaVal * z);
  }
  
  private normalFromUniform(rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  /**
   * Sample multiple values
   */
  sampleMultiple(n: number, customRng?: () => number): number[] {
    const samples: number[] = new Array(n);
    
    for (let i = 0; i < n; i++) {
      samples[i] = this.sample(customRng);
    }
    
    return samples;
  }
  
  /**
   * Log probability density function
   * log p(x) = -log(x) - log(σ) - 0.5*log(2π) - (log(x)-μ)²/(2σ²)
   */
  override logProb(value: number | RandomVariable): RandomVariable {
    const x = RandomVariable.constant(value);
    const xVal = typeof value === 'number' ? value : value.forward();
    
    // Validate x > 0
    if (xVal <= 0) {
      return RandomVariable.constant(-Infinity);
    }
    
    const logX = log(x);
    
    // -log(x)
    const term1 = logX.neg();
    
    // -log(σ)
    const term2 = log(this.sigma).neg();
    
    // -0.5*log(2π)
    const term3 = RandomVariable.constant(-0.5 * LOG_TWO_PI);
    
    // -(log(x)-μ)²/(2σ²)
    const diff = subtract(logX, this.mu);
    const term4 = diff.pow(2).divide(multiply(2, this.sigma.pow(2))).neg();
    
    // Sum all terms
    return add(add(add(term1, term2), term3), term4);
  }
  
  /**
   * Mean: E[X] = exp(μ + σ²/2)
   */
  mean(): RandomVariable {
    // exp(μ + σ²/2)
    const exponent = add(this.mu, multiply(0.5, this.sigma.pow(2)));
    
    // Create a node for exp to maintain differentiability
    const expNode = ComputationGraph.current().createNode(
      'exp',
      [exponent.getNode()],
      (inputs) => Math.exp(inputs[0]),
      (grad, inputs) => [grad * Math.exp(inputs[0])]
    );
    
    return new RandomVariable(expNode);
  }
  
  /**
   * Variance: Var[X] = (exp(σ²) - 1) * exp(2μ + σ²)
   */
  variance(): RandomVariable {
    const sigma2 = this.sigma.pow(2);
    
    // exp(σ²) - 1
    const expSigma2Node = ComputationGraph.current().createNode(
      'exp',
      [sigma2.getNode()],
      (inputs) => Math.exp(inputs[0]) - 1,
      (grad, inputs) => [grad * Math.exp(inputs[0])]
    );
    const factor1 = new RandomVariable(expSigma2Node);
    
    // exp(2μ + σ²)
    const exponent2 = add(multiply(2, this.mu), sigma2);
    const exp2Node = ComputationGraph.current().createNode(
      'exp',
      [exponent2.getNode()],
      (inputs) => Math.exp(inputs[0]),
      (grad, inputs) => [grad * Math.exp(inputs[0])]
    );
    const factor2 = new RandomVariable(exp2Node);
    
    return multiply(factor1, factor2);
  }
  
  /**
   * Mode: exp(μ - σ²) for σ > 0, exp(μ) for σ = 0
   */
  mode(): RandomVariable {
    const sigmaVal = this.sigma.forward();
    
    if (sigmaVal === 0) {
      // Degenerate case: just exp(μ)
      const expNode = ComputationGraph.current().createNode(
        'exp',
        [this.mu.getNode()],
        (inputs) => Math.exp(inputs[0]),
        (grad, inputs) => [grad * Math.exp(inputs[0])]
      );
      return new RandomVariable(expNode);
    }
    
    // exp(μ - σ²)
    const exponent = subtract(this.mu, this.sigma.pow(2));
    const expNode = ComputationGraph.current().createNode(
      'exp',
      [exponent.getNode()],
      (inputs) => Math.exp(inputs[0]),
      (grad, inputs) => [grad * Math.exp(inputs[0])]
    );
    
    return new RandomVariable(expNode);
  }
  
  /**
   * Median: exp(μ)
   */
  median(): RandomVariable {
    const expNode = ComputationGraph.current().createNode(
      'exp',
      [this.mu.getNode()],
      (inputs) => Math.exp(inputs[0]),
      (grad, inputs) => [grad * Math.exp(inputs[0])]
    );
    return new RandomVariable(expNode);
  }
  
  /**
   * Standard deviation
   */
  stdDev(): RandomVariable {
    return this.variance().pow(0.5);
  }
  
  /**
   * Coefficient of variation: sqrt(exp(σ²) - 1)
   */
  coefficientOfVariation(): RandomVariable {
    const sigma2 = this.sigma.pow(2);
    
    // sqrt(exp(σ²) - 1)
    const expNode = ComputationGraph.current().createNode(
      'cv',
      [sigma2.getNode()],
      (inputs) => Math.sqrt(Math.exp(inputs[0]) - 1),
      (grad, inputs) => {
        const expVal = Math.exp(inputs[0]);
        const sqrtVal = Math.sqrt(expVal - 1);
        return [grad * expVal / (2 * sqrtVal)];
      }
    );
    
    return new RandomVariable(expNode);
  }
  
  /**
   * Get parameters
   */
  getParameters(): { mu: RandomVariable, sigma: RandomVariable } {
    return { mu: this.mu, sigma: this.sigma };
  }
  
  /**
   * Get parameters of the underlying normal distribution
   */
  getNormalParameters(): { mean: RandomVariable, stdDev: RandomVariable } {
    return { mean: this.mu, stdDev: this.sigma };
  }
  
  /**
   * Probability density function (non-log)
   */
  pdf(value: number): number {
    if (value <= 0) return 0;
    
    const muVal = this.mu.forward();
    const sigmaVal = this.sigma.forward();
    
    if (sigmaVal === 0) {
      // Degenerate case: point mass at exp(μ)
      return value === Math.exp(muVal) ? Infinity : 0;
    }
    
    const logX = Math.log(value);
    const coefficient = 1 / (value * sigmaVal * Math.sqrt(2 * Math.PI));
    const exponent = -Math.pow(logX - muVal, 2) / (2 * sigmaVal * sigmaVal);
    
    return coefficient * Math.exp(exponent);
  }
  
  /**
   * Cumulative distribution function
   * Uses the error function via the underlying normal CDF
   */
  cdf(value: number): number {
    if (value <= 0) return 0;
    
    const muVal = this.mu.forward();
    const sigmaVal = this.sigma.forward();
    
    if (sigmaVal === 0) {
      // Degenerate case
      return value >= Math.exp(muVal) ? 1 : 0;
    }
    
    // Standardize log(x)
    const standardized = (Math.log(value) - muVal) / sigmaVal;
    
    // Use error function for normal CDF
    // Φ(z) = 0.5 * (1 + erf(z/√2))
    return 0.5 * (1 + erf(standardized / Math.sqrt(2)));
  }
  
  /**
   * Inverse CDF (quantile function)
   * Uses bisection method as a simple implementation
   */
  inverseCDF(p: number): number {
    if (p < 0 || p > 1) {
      throw new Error(`Invalid probability: ${p}. Must be in [0, 1].`);
    }
    
    if (p === 0) return 0;
    if (p === 1) return Infinity;
    
    // Use bisection on a reasonable range
    const median = Math.exp(this.mu.forward());
    let low = median / 100;
    let high = median * 100;
    
    // Expand bounds if needed
    while (this.cdf(high) < p) high *= 10;
    while (this.cdf(low) > p) low /= 10;
    
    // Bisection
    const tolerance = 1e-6;
    while (high - low > tolerance * median) {
      const mid = (low + high) / 2;
      if (this.cdf(mid) < p) {
        low = mid;
      } else {
        high = mid;
      }
    }
    
    return (low + high) / 2;
  }
}

/**
 * Factory function for LogNormal distribution
 */
export function logNormal(
  mu: number | RandomVariable,
  sigma: number | RandomVariable,
  rng?: RNG
): LogNormalRV {
  const muRV = RandomVariable.constant(mu);
  const sigmaRV = RandomVariable.constant(sigma);
  
  return new LogNormalRV(muRV, sigmaRV, undefined, rng);
}