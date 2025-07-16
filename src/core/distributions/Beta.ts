/**
 * Beta Distribution - Refactored for pragmatic TypeScript usage
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';

/**
 * Log of the Beta function with basic validation
 */
function logBeta(a: number, b: number): number {
  if (a <= 0 || b <= 0) {
    return -Infinity;
  }
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Simple log-gamma implementation
 */
function logGamma(x: number): number {
  if (x < 0.5) {
    throw new Error('logGamma not implemented for x < 0.5');
  }
  
  const logTwoPi = Math.log(2 * Math.PI);
  return (x - 0.5) * Math.log(x) - x + 0.5 * logTwoPi;
}

/**
 * Beta distribution random variable
 */
export class BetaRV extends RandomVariable {
  constructor(
    private alpha: RandomVariable,
    private beta: RandomVariable,
    graph?: ComputationGraph
  ) {
    const node = (graph || ComputationGraph.current()).createNode(
      'beta',
      [alpha.getNode(), beta.getNode()],
      (inputs) => {
        // Validate inputs
        if (inputs.length < 2) return 0;
        const [a, b] = inputs;
        
        // Forward pass returns mean of Beta distribution: alpha / (alpha + beta)
        return a / (a + b);
      },
      (grad, inputs) => {
        // Validate inputs
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
  }
  
  /**
   * Sample from Beta distribution
   */
  override sample(rng: () => number): number {
    const a = this.alpha.forward();
    const b = this.beta.forward();
    
    // Sample from Gamma distributions
    const gammaA = this.sampleGamma(a, 1, rng);
    const gammaB = this.sampleGamma(b, 1, rng);
    
    return gammaA / (gammaA + gammaB);
  }
  
  /**
   * Sample from Gamma distribution (simplified)
   */
  private sampleGamma(shape: number, scale: number, rng: () => number): number {
    if (shape < 1) {
      const u = rng();
      return this.sampleGamma(shape + 1, scale, rng) * Math.pow(u, 1 / shape);
    }
    
    // For shape >= 1, use Marsaglia & Tsang method
    const d = shape - 1/3;
    const c = 1 / Math.sqrt(9 * d);
    
    while (true) {
      let x, v;
      
      do {
        x = this.sampleNormal(0, 1, rng);
        v = 1 + c * x;
      } while (v <= 0);
      
      v = v * v * v;
      const u = rng();
      
      if (u < 1 - 0.0331 * x * x * x * x) {
        return d * v * scale;
      }
      
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }
  
  /**
   * Sample from standard normal using Box-Muller
   */
  private sampleNormal(mean: number, stdDev: number, rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
  
  /**
   * Log probability density function
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
    
    // log(B(α, β))
    const logBetaNode = ComputationGraph.current().createNode(
      'logBeta',
      [this.alpha.getNode(), this.beta.getNode()],
      (inputs) => {
        if (inputs.length < 2) return -Infinity;
        return logBeta(inputs[0], inputs[1]);
      },
      (grad, inputs) => {
        if (inputs.length < 2) return [0, 0];
        const [a, b] = inputs;
        
        // Approximate gradients using finite differences
        return [
          grad * (Math.log(a) - Math.log(a + b)),
          grad * (Math.log(b) - Math.log(a + b))
        ];
      }
    );
    
    const logBetaRV = new RandomVariable(logBetaNode);
    
    // Combine terms
    return add(term1, term2).subtract(logBetaRV);
  }
  
  /**
   * Get the parameters of this distribution
   */
  getParameters(): { alpha: RandomVariable, beta: RandomVariable } {
    return { alpha: this.alpha, beta: this.beta };
  }
  
  /**
   * Mean of the Beta distribution
   */
  mean(): RandomVariable {
    return this.alpha.divide(this.alpha.add(this.beta));
  }
  
  /**
   * Mode of the Beta distribution (for α > 1, β > 1)
   */
  mode(): RandomVariable {
    return subtract(this.alpha, 1).divide(
      add(this.alpha, this.beta).subtract(2)
    );
  }
  
  /**
   * Variance of the Beta distribution
   */
  variance(): RandomVariable {
    const alphaPlusBeta = this.alpha.add(this.beta);
    const numerator = this.alpha.multiply(this.beta);
    const denominator = alphaPlusBeta
      .pow(2)
      .multiply(alphaPlusBeta.add(1));
    
    return numerator.divide(denominator);
  }
}

/**
 * Factory function for creating Beta distributions
 */
export function beta(
  alpha: number | RandomVariable,
  beta: number | RandomVariable
): BetaRV {
  const alphaRV = RandomVariable.constant(alpha);
  const betaRV = RandomVariable.constant(beta);
  
  return new BetaRV(alphaRV, betaRV);
}