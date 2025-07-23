/**
 * Beta Distribution - Updated to use math libraries
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';
import { logBeta, logGamma } from '../utils/math/special';
import { RNG } from '../utils/math/random';

/**
 * Beta distribution random variable
 */
export class BetaRV extends RandomVariable {
  private rng: RNG;
  
  constructor(
    private alpha: RandomVariable,
    private beta: RandomVariable,
    graph?: ComputationGraph,
    rng?: RNG
  ) {
    const node = (graph || ComputationGraph.current()).createNode(
      'beta',
      [alpha.getNode(), beta.getNode()],
      (inputs) => {
        if (inputs.length < 2) return 0;
        const [a, b] = inputs;
        // Forward pass returns mean of Beta distribution: alpha / (alpha + beta)
        return a / (a + b);
      },
      (grad, inputs) => {
        if (inputs.length < 2) return [0, 0];
        const [a, b] = inputs;
        
        const total = a + b;
        const totalSq = total * total;
        
        // d(a/(a+b))/da = b/(a+b)^2
        // d(a/(a+b))/db = -a/(a+b)^2
        return [
          grad * b / totalSq,
          grad * (-a) / totalSq
        ];
      }
    );
    
    super(node, [], graph || ComputationGraph.current());
    this.rng = rng || new RNG();
  }
  
  /**
   * Sample from Beta distribution using better RNG
   */
  override sample(customRng?: () => number): number {
    const a = this.alpha.forward();
    const b = this.beta.forward();
    
    // Validate parameters
    if (a <= 0 || b <= 0) {
      throw new Error(`Invalid Beta parameters: alpha=${a}, beta=${b}`);
    }
    
    // If custom RNG provided, use it for backward compatibility
    if (customRng) {
      // Simple implementation for custom RNG
      const x = this.sampleGammaBasic(a, 1, customRng);
      const y = this.sampleGammaBasic(b, 1, customRng);
      return x / (x + y);
    }
    
    // Use the better RNG implementation
    return this.rng.beta(a, b);
  }
  
  /**
   * Basic gamma sampling for backward compatibility
   */
  private sampleGammaBasic(shape: number, scale: number, rng: () => number): number {
    // Simplified Marsaglia & Tsang method
    if (shape < 1) {
      const u = rng();
      return this.sampleGammaBasic(shape + 1, scale, rng) * Math.pow(u, 1 / shape);
    }
    
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
  
  private normalFromUniform(rng: () => number): number {
    // Box-Muller transform
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  
  /**
   * Sample multiple values efficiently
   */
  sampleMultiple(n: number, customRng?: () => number): number[] {
    const samples: number[] = new Array(n);
    const a = this.alpha.forward();
    const b = this.beta.forward();
    
    if (customRng) {
      // Use basic implementation
      for (let i = 0; i < n; i++) {
        const x = this.sampleGammaBasic(a, 1, customRng);
        const y = this.sampleGammaBasic(b, 1, customRng);
        samples[i] = x / (x + y);
      }
    } else {
      // Use better RNG
      for (let i = 0; i < n; i++) {
        samples[i] = this.rng.beta(a, b);
      }
    }
    
    return samples;
  }
  
  /**
   * Log probability density function using imported logBeta
   */
  override logProb(value: number | RandomVariable): RandomVariable {
    const x = RandomVariable.constant(value);
    const xVal = typeof value === 'number' ? value : value.forward();
    
    // Check bounds
    if (xVal <= 0 || xVal >= 1) {
      return RandomVariable.constant(-Infinity);
    }
    
    // (α-1)log(x)
    const term1 = multiply(
      subtract(this.alpha, 1),
      log(x)
    );
    
    // (β-1)log(1-x)
    const term2 = multiply(
      subtract(this.beta, 1),
      log(subtract(1, x))
    );
    
    // -log(B(α, β))
    const logBetaNode = ComputationGraph.current().createNode(
      'logBeta',
      [this.alpha.getNode(), this.beta.getNode()],
      (inputs) => {
        if (inputs.length < 2) return -Infinity;
        return -logBeta(inputs[0], inputs[1]); // negative because we subtract it
      },
      (grad, inputs) => {
        if (inputs.length < 2) return [0, 0];
        const [a, b] = inputs;
        
        // d/da(-log(B(a,b))) = -d/da(log(B(a,b)))
        // = -[ψ(a) - ψ(a+b)] where ψ is digamma
        // For now, use finite differences
        const h = 1e-8;
        const grad_a = -(logBeta(a + h, b) - logBeta(a, b)) / h;
        const grad_b = -(logBeta(a, b + h) - logBeta(a, b)) / h;
        
        return [grad * grad_a, grad * grad_b];
      }
    );
    
    const negLogBetaRV = new RandomVariable(logBetaNode);
    
    // Combine terms: (α-1)log(x) + (β-1)log(1-x) - log(B(α,β))
    return add(add(term1, term2), negLogBetaRV);
  }
  
  /**
   * Get the parameters of this distribution
   */
  getParameters(): { alpha: RandomVariable, beta: RandomVariable } {
    return { alpha: this.alpha, beta: this.beta };
  }
  
  /**
   * Mean of the Beta distribution: α/(α+β)
   */
  mean(): RandomVariable {
    return this.alpha.divide(this.alpha.add(this.beta));
  }
  
  /**
   * Mode of the Beta distribution (for α > 1, β > 1)
   */
  mode(): RandomVariable {
    // (α-1)/(α+β-2)
    return subtract(this.alpha, 1).divide(
      add(this.alpha, this.beta).subtract(2)
    );
  }
  
  /**
   * Variance of the Beta distribution
   */
  variance(): RandomVariable {
    // αβ / ((α+β)²(α+β+1))
    const alphaPlusBeta = this.alpha.add(this.beta);
    const numerator = this.alpha.multiply(this.beta);
    const denominator = alphaPlusBeta
      .pow(2)
      .multiply(alphaPlusBeta.add(1));
    
    return numerator.divide(denominator);
  }
  
  /**
   * Standard deviation
   */
  stdDev(): RandomVariable {
    return this.variance().pow(0.5);
  }
}

/**
 * Factory function for creating Beta distributions
 */
export function beta(
  alpha: number | RandomVariable,
  beta: number | RandomVariable,
  rng?: RNG
): BetaRV {
  const alphaRV = RandomVariable.constant(alpha);
  const betaRV = RandomVariable.constant(beta);
  
  return new BetaRV(alphaRV, betaRV, undefined, rng);
}