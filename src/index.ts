/**
 * Tyche - Browser-based Bayesian inference with GPU acceleration
 * 
 * A TypeScript library for probabilistic programming and experimental design,
 * running entirely in the browser with automatic differentiation and 
 * (future) GPU acceleration via WebGL.
 */

// Core exports
export {
  RandomVariable,
  type Shape,
  type Tensor,
  // Mathematical operations
  add,
  subtract,
  multiply,
  divide,
  pow,
  log,
  exp,
  sigmoid,
  logit
} from './core/RandomVariable';

export {
  ComputationGraph,
  ComputationNode,
  ParameterNode,
  GradientTape,
  GraphContext,
  withGraph
} from './core/ComputationGraph';

// Distribution exports
export { BetaRV, beta } from './core/distributions/Beta';
export { BinomialRV, binomial, bernoulli } from './core/distributions/Binomial';
export { 
  NormalRV, 
  normal, 
  standardNormal,
  HalfNormalRV,
  halfNormal 
} from './core/distributions/Normal';

// Common distribution patterns
export { jeffreysBeta, uniformBeta } from './core/distributions';

// Sampler exports
export {
  MetropolisSampler,
  AdaptiveMetropolisSampler,
  type Model,
  type MCMCDiagnostics,
  type MetropolisOptions
} from './samplers/Metropolis';

// Version
export const VERSION = '0.1.0';

/**
 * Quick start example
 * 
 * @example
 * ```typescript
 * import { beta, MetropolisSampler } from 'tyche';
 * 
 * // Define a simple model
 * const prior = beta(1, 1);
 * 
 * // Run inference
 * const sampler = new MetropolisSampler();
 * const results = sampler.sample(model, 1000);
 * ```
 */