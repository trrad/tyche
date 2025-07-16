/**
 * Distribution module exports
 * 
 * This module provides probability distributions with automatic differentiation
 * support for Bayesian inference.
 */

// Beta distribution
export { BetaRV, beta } from './Beta';

// Binomial distribution (includes Bernoulli)
export { BinomialRV, binomial, bernoulli } from './Binomial';

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

/**
 * Weakly informative prior for probability parameters
 * Beta(2, 2) - slight preference for values away from 0 and 1
 */
export { beta as weaklyInformativeBeta } from './Beta';

/**
 * Jeffreys prior for probability parameters
 * Beta(0.5, 0.5) - invariant under reparameterization
 */
export function jeffreysBeta() {
  const { beta } = require('./Beta');
  return beta(0.5, 0.5);
}

/**
 * Uniform prior for probability parameters
 * Beta(1, 1) - all values equally likely
 */
export function uniformBeta() {
  const { beta } = require('./Beta');
  return beta(1, 1);
}