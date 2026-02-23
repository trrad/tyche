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

// Analyzers
export { RevenueAnalyzer } from './domain/analyzers/RevenueAnalyzer';
export { ConversionAnalyzer } from './domain/analyzers/ConversionAnalyzer';

// Inference engines (needed for analyzers to work properly)
export { CompoundInferenceEngine } from './inference/compound/CompoundInferenceEngine';
export { LogNormalConjugate } from './inference/exact/LogNormalConjugate';
export { BetaBinomialConjugate } from './inference/exact/BetaBinomialConjugate';
export { ModelRouter } from './inference/ModelRouter';

// D3 Visualization Components
export {
  QuantileDots,
  RidgeDotplot,
  DraggableCIBounds,
  ThresholdLine,
  Tooltip,
} from './visualizations';

// Visualization Types
export type {
  QuantileDotsData,
  RidgeDotplotData,
  VariantData,
  ColorScheme,
  QuantileDotsOptions,
  CIBoundsOptions,
  ThresholdLineOptions,
  DotHoverEventDetail,
  DotClickEventDetail,
  CIDragEventDetail,
  ThresholdDragEventDetail,
  VariantClickEventDetail,
} from './visualizations';

// Visualization Utilities
export {
  computeQuantiles,
  sortSamples,
  getCIBounds,
  getPercentile,
  computeKDE,
  validateSamples,
  validateCIBounds,
  validateNumDots,
} from './visualizations';

// Version
export const VERSION = '0.1.0';
