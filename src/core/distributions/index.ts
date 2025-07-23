/**
 * Distribution module exports
 * 
 * This module provides probability distributions with automatic differentiation
 * support for Bayesian inference.
 */

// Re-export the RNG for convenience
export { RNG, defaultRNG } from '../utils/math/random';

// Beta distribution
export { BetaRV, beta } from './Beta';

// Binomial distribution (includes Bernoulli)
export { BinomialRV, binomial, bernoulli } from './Binomial';

export { GammaRV, gamma } from './Gamma';

// Exponential distribution
export { ExponentialRV, exponential } from './Exponential';

// LogNormal distribution  
export { LogNormalRV, logNormal } from './LogNormal';

// Normal distribution (includes Half-Normal)
export { 
  NormalRV, 
  normal, 
  standardNormal,
  HalfNormalRV,
  halfNormal 
} from './Normal';

// Re-export RandomVariable types for convenience
export type { RandomVariable, Shape, Tensor } from '../RandomVariable';

/**
 * Common distribution patterns for Bayesian modeling
 */

import { beta } from './Beta';
import { RNG } from '../utils/math/random';

/**
 * Weakly informative prior for probability parameters
 * Beta(2, 2) - slight preference for values away from 0 and 1
 */
export function weaklyInformativeBeta(rng?: RNG) {
  return beta(2, 2, rng);
}

/**
 * Jeffreys prior for probability parameters
 * Beta(0.5, 0.5) - invariant under reparameterization
 */
export function jeffreysBeta(rng?: RNG) {
  return beta(0.5, 0.5, rng);
}

/**
 * Uniform prior for probability parameters
 * Beta(1, 1) - all values equally likely
 */
export function uniformBeta(rng?: RNG) {
  return beta(1, 1, rng);
}

/**
 * Haldane prior (improper)
 * Beta(0, 0) - use with caution
 */
export function haldaneBeta(rng?: RNG) {
  console.warn('Haldane prior Beta(0,0) is improper and may cause numerical issues');
  return beta(1e-10, 1e-10, rng); // Small values to approximate
}