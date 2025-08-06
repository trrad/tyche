/**
 * Pure Mathematical Distribution Module
 *
 * This module provides clean mathematical probability distributions
 * without automatic differentiation coupling.
 */

// Re-export the RNG for convenience
export { RNG, defaultRNG } from '../utils/math/random';

// Pure mathematical distributions
export { BetaDistribution } from './BetaDistribution';
export { GammaDistribution } from './GammaDistribution';
export { LogNormalDistribution } from './LogNormalDistribution';
export { NormalDistribution } from './NormalDistribution';
export { HalfNormalDistribution } from './HalfNormalDistribution';

// Import for factory functions
import { BetaDistribution } from './BetaDistribution';
import { NormalDistribution } from './NormalDistribution';
import { HalfNormalDistribution } from './HalfNormalDistribution';

// Re-export the canonical Distribution interface (when we define it)
// export type { Distribution } from './Distribution';

/**
 * Common distribution factory functions for Bayesian modeling
 * These provide convenient constructors for common priors
 */

/**
 * Weakly informative prior for probability parameters
 * Beta(2, 2) - slight preference for values away from 0 and 1
 */
export function createWeaklyInformativeBeta(rng?: import('../utils/math/random').RNG) {
  return new BetaDistribution(2, 2, rng);
}

/**
 * Jeffreys prior for probability parameters
 * Beta(0.5, 0.5) - invariant under reparameterization
 */
export function createJeffreysBeta(rng?: import('../utils/math/random').RNG) {
  return new BetaDistribution(0.5, 0.5, rng);
}

/**
 * Uniform prior for probability parameters
 * Beta(1, 1) - all values equally likely
 */
export function createUniformBeta(rng?: import('../utils/math/random').RNG) {
  return new BetaDistribution(1, 1, rng);
}

/**
 * Standard normal distribution N(0, 1)
 */
export function createStandardNormal(rng?: import('../utils/math/random').RNG) {
  return new NormalDistribution(0, 1, rng);
}

/**
 * Unit half-normal distribution HalfNormal(1)
 */
export function createUnitHalfNormal(rng?: import('../utils/math/random').RNG) {
  return new HalfNormalDistribution(1, rng);
}
