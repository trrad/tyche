// Main export: VI-based model for fast inference
export {
  ConversionValueModelVI,
  type VIAnalysisOptions,
  type UserData,
  type VariantData,
  type VariantSummary,
  type ConversionValuePosterior,
  type OutlierDiagnostic,
  type EffectDriver
} from './ConversionValueModelVI';

// Legacy MCMC-based model (deprecated - kept for reference only)
// Use ConversionValueModelVI for all new implementations
export { 
  ConversionValueModel
} from './ConversionValueModel';