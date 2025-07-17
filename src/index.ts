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

// Mathematical utilities
export {
  logGamma,
  logBeta,
  logFactorial,
  logBinomial,
  erf,
  erfc,
  erfInv
} from './core/math/special';

// Random number generation
export {
  RNG,
  defaultRNG,
  uniform,
  normal as normalSample,
  gamma as gammaSample,
  beta as betaSample,
  binomial as binomialSample
} from './core/math/random';

// Distribution exports
export { BetaRV, beta } from './core/distributions/Beta';
export { GammaRV, gamma } from './core/distributions/Gamma';
export { BinomialRV, binomial, bernoulli } from './core/distributions/Binomial';
export { ExponentialRV, exponential } from './core/distributions/Exponential';
export { LogNormalRV, logNormal } from './core/distributions/LogNormal';
export { 
  NormalRV, 
  normal, 
  standardNormal,
  HalfNormalRV,
  halfNormal 
} from './core/distributions/Normal';

// Common distribution patterns
export { 
  jeffreysBeta, 
  uniformBeta,
  weaklyInformativeBeta,
  haldaneBeta
} from './core/distributions';

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
 * import { beta, RNG, MetropolisSampler } from 'tyche';
 * 
 * // Create a reproducible RNG
 * const rng = new RNG(12345);
 * 
 * // Define a model with better sampling
 * const prior = beta(1, 1, rng);
 * 
 * // Run inference
 * const sampler = new MetropolisSampler();
 * const results = sampler.sample(model, 1000);
 * ```
 */