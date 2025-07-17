// src/core/distributions/Gamma.ts
/**
 * Gamma distribution with shape and scale parameters
 * 
 * The Gamma distribution is useful for modeling positive continuous values,
 * especially waiting times, income, and other skewed positive data.
 * 
 * Parameterization: shape (α) and scale (θ)
 * - Mean: α * θ
 * - Variance: α * θ²
 * - PDF: (1/Γ(α)θ^α) * x^(α-1) * e^(-x/θ)
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';
import { logGamma } from '../math/special';
import { RNG } from '../math/random';

export class GammaRV extends RandomVariable {
  private rng: RNG;
  
  constructor(
    private alpha: RandomVariable,  // shape parameter
    private theta: RandomVariable,  // scale parameter
    graph?: ComputationGraph,
    rng?: RNG
  ) {
    const node = (graph || ComputationGraph.current()).createNode(
      'gamma',
      [alpha.getNode(), theta.getNode()],
      (inputs) => {
        if (inputs.length < 2) return 0;
        const [a, t] = inputs;
        // Validate parameters
        if (a <= 0 || t <= 0) {
          throw new Error(`Invalid Gamma parameters: shape=${a}, scale=${t}. Both must be positive.`);
        }
        // Forward pass returns mean of Gamma distribution: α * θ
        return a * t;
      },
      (grad, inputs) => {
        if (inputs.length < 2) return [0, 0];
        const [a, t] = inputs;
        
        // d(αθ)/dα = θ
        // d(αθ)/dθ = α
        return [
          grad * t,  // gradient w.r.t. alpha
          grad * a   // gradient w.r.t. theta
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
    const shapeVal = this.alpha.forward();
    const scaleVal = this.theta.forward();
    
    if (shapeVal <= 0 || scaleVal <= 0) {
      throw new Error(`Invalid Gamma parameters: shape=${shapeVal}, scale=${scaleVal}`);
    }
    
    if (customRng) {
      // Use Marsaglia and Tsang method for shape >= 1
      if (shapeVal >= 1) {
        return this.sampleMarsagliaTsang(shapeVal, scaleVal, customRng);
      } else {
        // For shape < 1, use Johnk's method
        return this.sampleJohnk(shapeVal, scaleVal, customRng);
      }
    }
    
    // Use the better RNG implementation
    return this.rng.gamma(shapeVal, scaleVal);
  }
  
  /**
   * Marsaglia and Tsang method for shape >= 1
   */
  private sampleMarsagliaTsang(shape: number, scale: number, rng: () => number): number {
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      const z = this.normalFromUniform(rng);
      const v = 1 + c * z;
      
      if (v <= 0) continue;
      
      const v3 = v * v * v;
      const u = rng();
      
      if (u < 1 - 0.0331 * z * z * z * z) {
        return d * v3 * scale;
      }
      
      if (Math.log(u) < 0.5 * z * z + d * (1 - v3 + Math.log(v3))) {
        return d * v3 * scale;
      }
    }
  }
  
  /**
   * Johnk's method for shape < 1
   */
  private sampleJohnk(shape: number, scale: number, rng: () => number): number {
    const u = rng();
    const gammaPlus1 = this.sampleMarsagliaTsang(shape + 1, scale, rng);
    return gammaPlus1 * Math.pow(u, 1 / shape);
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
   * log p(x) = -log(Γ(α)) - α*log(θ) + (α-1)*log(x) - x/θ
   */
  override logProb(value: number | RandomVariable): RandomVariable {
    const x = RandomVariable.constant(value);
    const xVal = typeof value === 'number' ? value : value.forward();
    
    // Validate x > 0
    if (xVal <= 0) {
      return RandomVariable.constant(-Infinity);
    }
    
    // -log(Γ(α)) - using a computation node for differentiability
    const logGammaNode = ComputationGraph.current().createNode(
      'logGamma',
      [this.alpha.getNode()],
      (inputs) => {
        if (inputs.length < 1) return -Infinity;
        return -logGamma(inputs[0]);
      },
      (grad, inputs) => {
        if (inputs.length < 1) return [0];
        const a = inputs[0];
        
        // d(-log(Γ(a)))/da = -ψ(a) where ψ is digamma
        // For now, use finite differences
        const h = 1e-8;
        const gradA = -(logGamma(a + h) - logGamma(a)) / h;
        
        return [grad * gradA];
      }
    );
    const negLogGammaAlpha = new RandomVariable(logGammaNode);
    
    // -α*log(θ)
    const term2 = multiply(this.alpha, log(this.theta)).neg();
    
    // (α-1)*log(x)
    const term3 = multiply(subtract(this.alpha, 1), log(x));
    
    // -x/θ
    const term4 = x.divide(this.theta).neg();
    
    // Sum all terms
    return add(add(add(negLogGammaAlpha, term2), term3), term4);
  }
  
  /**
   * Mean: E[X] = α * θ
   */
  mean(): RandomVariable {
    return multiply(this.alpha, this.theta);
  }
  
  /**
   * Variance: Var[X] = α * θ²
   */
  variance(): RandomVariable {
    return multiply(this.alpha, this.theta.pow(2));
  }
  
  /**
   * Mode: (α - 1) * θ for α >= 1, 0 otherwise
   */
  mode(): RandomVariable {
    const shapeVal = this.alpha.forward();
    
    if (shapeVal >= 1) {
      return multiply(subtract(this.alpha, 1), this.theta);
    } else {
      return RandomVariable.constant(0);
    }
  }
  
  /**
   * Standard deviation
   */
  stdDev(): RandomVariable {
    return this.variance().pow(0.5);
  }
  
  /**
   * Rate parameter (inverse scale): β = 1/θ
   */
  rate(): RandomVariable {
    return RandomVariable.constant(1).divide(this.theta);
  }
  
  /**
   * Get parameters
   */
  getParameters(): { alpha: RandomVariable, theta: RandomVariable } {
    return { alpha: this.alpha, theta: this.theta };
  }
  
  /**
   * Probability density function (non-log)
   */
  pdf(value: number): number {
    const shapeVal = this.alpha.forward();
    const scaleVal = this.theta.forward();
    
    if (value <= 0) return 0;
    
    const normalizer = Math.exp(logGamma(shapeVal)) * Math.pow(scaleVal, shapeVal);
    const kernel = Math.pow(value, shapeVal - 1) * Math.exp(-value / scaleVal);
    
    return kernel / normalizer;
  }
  
  /**
   * Cumulative distribution function
   * Uses the regularized incomplete gamma function
   */
  cdf(value: number): number {
    if (value <= 0) return 0;
    
    const shapeVal = this.alpha.forward();
    const scaleVal = this.theta.forward();
    
    // For now, we'll use a simple numerical approximation
    // In production, you'd want to use the incomplete gamma function
    // P(X <= x) ≈ integral from 0 to x of pdf(t) dt
    
    // This is a placeholder - in practice you'd use a proper implementation
    console.warn('Gamma.cdf uses numerical approximation - consider implementing incomplete gamma function');
    
    const steps = 1000;
    const dx = value / steps;
    let sum = 0;
    
    for (let i = 0; i < steps; i++) {
      const x = (i + 0.5) * dx;
      sum += this.pdf(x) * dx;
    }
    
    return Math.min(1, sum);
  }
}

/**
 * Factory function for Gamma distribution
 */
export function gamma(
  shape: number | RandomVariable,
  scale: number | RandomVariable,
  rng?: RNG
): GammaRV {
  const shapeRV = RandomVariable.constant(shape);
  const scaleRV = RandomVariable.constant(scale);
  
  return new GammaRV(shapeRV, scaleRV, undefined, rng);
}