/**
 * Tyche - Browser-based Bayesian inference and probabilistic modeling
 *
 * A TypeScript library for probabilistic programming with clean mathematical
 * distributions and Bayesian inference capabilities.
 */

// Error handling
export { TycheError, ErrorCode, isTycheError, wrapError } from './core/errors';

// Mathematical utilities
export {
  logGamma,
  logBeta,
  logFactorial,
  logBinomial,
  erf,
  erfc,
  erfInv,
} from './core/utils/math/special';

// Random number generation
export {
  RNG,
  defaultRNG,
  uniform,
  normal as normalSample,
  gamma as gammaSample,
  beta as betaSample,
  binomial as binomialSample,
} from './core/utils/math/random';

// Pure mathematical distributions
export {
  BetaDistribution,
  GammaDistribution,
  LogNormalDistribution,
  NormalDistribution,
  HalfNormalDistribution,
} from './core/distributions';

// Common distribution factory functions
export {
  createJeffreysBeta,
  createUniformBeta,
  createWeaklyInformativeBeta,
  createStandardNormal,
  createUnitHalfNormal,
} from './core/distributions';

// Data structures
export * from './core/data';

// Version
export const VERSION = '0.1.0';
