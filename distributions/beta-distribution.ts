/**
 * Beta Distribution
 * 
 * The Beta distribution is the conjugate prior for the Binomial distribution,
 * making it essential for A/B testing and conversion rate analysis.
 */

import { RandomVariable, log, subtract, multiply, add } from '../RandomVariable';
import { ComputationGraph } from '../ComputationGraph';

/**
 * Log of the Beta function: log(B(a, b)) = log(Γ(a)) + log(Γ(b)) - log(Γ(a + b))
 * Using Stirling's approximation for numerical stability
 */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Log-gamma function using Stirling's approximation
 * More sophisticated implementations can be added later
 */
function logGamma(x: number): number {
  // Simple implementation - can be improved
  if (x < 0.5) {
    throw new Error('logGamma not implemented for x < 0.5');
  }
  
  // Stirling's approximation for large x
  // log(Γ(x)) ≈ (x - 0.5) * log(x) - x + 0.5 * log(2π)
  const logTwoPi = Math.log(2 * Math.PI);
  return (x - 0.5) * Math.log(x) - x + 0.5 * logTwoPi;
}

/**
 * Beta distribution random variable
 */
export class BetaRV extends RandomVariable<number> {
  constructor(
    private alpha: RandomVariable<number>,
    private beta: RandomVariable<number>,
    graph?: ComputationGraph
  ) {
    // Create a node that represents sampling from Beta(alpha, beta)
    // For now, this is a placeholder - actual sampling logic will be in sample()
    const node = (graph || ComputationGraph.current()).createNode(
      'beta',
      [alpha.getNode(), beta.getNode()],
      (inputs) => {
        // Forward pass returns mean of Beta distribution: alpha / (alpha + beta)
        return inputs[0] / (inputs[0] + inputs[1]);
      },
      (grad, inputs) => {
        // Gradient of mean w.r.t. alpha and beta
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
   * Sample from Beta distribution using the ratio of Gamma variates method
   * Beta(a, b) = Gamma(a, 1) / (Gamma(a, 1) + Gamma(b, 1))
   */
  sample(rng: () => number): number {
    const a = this.alpha.forward();
    const b = this.beta.forward();
    
    // Sample from Gamma distributions using Marsaglia & Tsang method
    const gammaA = this.sampleGamma(a, 1, rng);
    const gammaB = this.sampleGamma(b, 1, rng);
    
    return gammaA / (gammaA + gammaB);
  }
  
  /**
   * Sample from Gamma distribution using Marsaglia & Tsang method
   * This is a simplified version - production code would be more sophisticated
   */
  private sampleGamma(shape: number, scale: number, rng: () => number): number {
    if (shape < 1) {
      // Use the method from "A Simple Method for Generating Gamma Variables"
      const u = rng();
      return this.sampleGamma(shape + 1, scale, rng) * Math.pow(u, 1 / shape);
    }
    
    // For shape >= 1
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
   * Sample from standard normal using Box-Muller transform
   */
  private sampleNormal(mean: number, stdDev: number, rng: () => number): number {
    const u1 = rng();
    const u2 = rng();
    
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  }
  
  /**
   * Log probability density function
   * log p(x | α, β) = (α-1)log(x) + (β-1)log(1-x) - log(B(α, β))
   */
  logProb(value: number | RandomVariable<number>): RandomVariable<number> {
    const x = RandomVariable.constant(value);
    
    // Ensure value is in (0, 1)
    if (value instanceof RandomVariable || (value > 0 && value < 1)) {
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
      
      // log(B(α, β)) - we'll need to implement this as a custom operation
      const logBetaNode = ComputationGraph.current().createNode(
        'logBeta',
        [this.alpha.getNode(), this.beta.getNode()],
        (inputs) => logBeta(inputs[0], inputs[1]),
        (grad, inputs) => {
          // Gradient of log(B(a,b)) w.r.t. a and b
          // d/da log(B(a,b)) = ψ(a) - ψ(a+b)  [ψ is digamma function]
          // For now, return approximate gradients
          const [a, b] = inputs;
          return [
            grad * (Math.log(a) - Math.log(a + b)),  // Approximate
            grad * (Math.log(b) - Math.log(a + b))   // Approximate
          ];
        }
      );
      
      const logBetaRV = new RandomVariable(logBetaNode);
      
      // Combine terms: (α-1)log(x) + (β-1)log(1-x) - log(B(α, β))
      return add(term1, term2).subtract(logBetaRV);
    } else {
      // Return -infinity for values outside support
      return RandomVariable.constant(-Infinity);
    }
  }
  
  /**
   * Get the parameters of this distribution
   */
  getParameters(): { alpha: RandomVariable<number>, beta: RandomVariable<number> } {
    return { alpha: this.alpha, beta: this.beta };
  }
  
  /**
   * Mean of the Beta distribution: α / (α + β)
   */
  mean(): RandomVariable<number> {
    return this.alpha.divide(this.alpha.add(this.beta));
  }
  
  /**
   * Mode of the Beta distribution (for α > 1, β > 1): (α - 1) / (α + β - 2)
   */
  mode(): RandomVariable<number> {
    return subtract(this.alpha, 1).divide(
      add(this.alpha, this.beta).subtract(2)
    );
  }
  
  /**
   * Variance of the Beta distribution: αβ / ((α + β)² (α + β + 1))
   */
  variance(): RandomVariable<number> {
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
  alpha: number | RandomVariable<number>,
  beta: number | RandomVariable<number>
): BetaRV {
  const alphaRV = RandomVariable.constant(alpha);
  const betaRV = RandomVariable.constant(beta);
  
  return new BetaRV(alphaRV, betaRV);
}