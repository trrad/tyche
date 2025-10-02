/**
 * Result objects for Tyche analysis
 * Enhanced for Phase 2 with full posterior comparison support
 */

export { AnalysisResult } from './AnalysisResult';
export { ResultMetadata } from './ResultMetadata';
export { VariantResult, ComponentInfo } from './VariantResult';
export { ExperimentResult } from './ExperimentResult';

// New comparison types and utilities
export {
  ComparisonOptions,
  ComparisonResult,
  VariantComparison,
  EffectDecomposition,
  ComparisonMetadata,
} from './types';
export { ComparisonUtils } from './ComparisonUtils';
