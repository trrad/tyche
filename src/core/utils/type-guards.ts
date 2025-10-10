/**
 * Type guard utilities for runtime type checking
 * Eliminates need for 'as any' casts throughout the codebase
 */

import { Posterior, CompoundPosterior } from '../../inference/base/types';
import { Distribution } from '../distributions/Distribution';
import { BetaDistribution } from '../distributions/BetaDistribution';
import { NormalInverseGammaDistribution } from '../distributions/NormalInverseGammaDistribution';
import { GammaDistribution } from '../distributions/GammaDistribution';

/**
 * Type guard for CompoundPosterior
 */
export function isCompoundPosterior(posterior: Posterior): posterior is CompoundPosterior {
  return 'getDecomposition' in posterior && typeof posterior.getDecomposition === 'function';
}

/**
 * Type guard for posteriors with components (mixture models)
 */
export function hasComponents(
  posterior: Posterior
): posterior is Posterior & {
  getComponents(): Array<{ mean: number; variance: number; weight: number }>;
} {
  return 'getComponents' in posterior && typeof posterior.getComponents === 'function';
}

/**
 * Type guard for posteriors with severity components (compound mixture models)
 */
export function hasSeverityComponents(
  posterior: Posterior
): posterior is Posterior & {
  getSeverityComponents(): Array<{ mean: number; variance: number; weight: number }> | null;
} {
  return (
    'getSeverityComponents' in posterior && typeof posterior.getSeverityComponents === 'function'
  );
}

/**
 * Type guard for BetaDistribution
 */
export function isBetaDistribution(distribution: Distribution): distribution is BetaDistribution {
  return distribution instanceof BetaDistribution;
}

/**
 * Type guard for NormalInverseGammaDistribution
 */
export function isNormalInverseGammaDistribution(
  distribution: Distribution
): distribution is NormalInverseGammaDistribution {
  return distribution instanceof NormalInverseGammaDistribution;
}

/**
 * Type guard for GammaDistribution
 */
export function isGammaDistribution(distribution: Distribution): distribution is GammaDistribution {
  return distribution instanceof GammaDistribution;
}

/**
 * Type guard for distributions with getParameters method
 */
export function hasGetParameters(
  obj: Distribution | Posterior
): obj is (Distribution | Posterior) & { getParameters(): any } {
  return 'getParameters' in obj && typeof obj.getParameters === 'function';
}

/**
 * Type guard for distributions with rate method (for Gamma)
 */
export function hasRateMethod(
  distribution: Distribution
): distribution is Distribution & { rate(): number } {
  return 'rate' in distribution && typeof distribution.rate === 'function';
}

/**
 * Type guard for posteriors with sampleParameters method
 */
export function hasSampleParameters(
  posterior: Posterior
): posterior is Posterior & { sampleParameters(): any } {
  return 'sampleParameters' in posterior && typeof posterior.sampleParameters === 'function';
}

/**
 * Type guard for posteriors with logLikelihood method
 */
export function hasLogLikelihood(
  posterior: Posterior
): posterior is Posterior & { logLikelihood(value: number, params?: any): number } {
  return 'logLikelihood' in posterior && typeof posterior.logLikelihood === 'function';
}
