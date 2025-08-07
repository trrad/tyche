/**
 * Model descriptions for UI display
 * Maps model keys to human-readable names and descriptions
 */

export interface ModelDescription {
  name: string;
  description: string;
}

export const MODEL_DESCRIPTIONS: Record<string, ModelDescription> = {
  auto: {
    name: 'Automatic',
    description: 'Automatically select the best model based on data characteristics',
  },
  beta: {
    name: 'Beta-Binomial',
    description: 'For conversion rate analysis',
  },
  normal: {
    name: 'Normal',
    description: 'For symmetric continuous data',
  },
  lognormal: {
    name: 'Log-Normal',
    description: 'For positive skewed data like revenue',
  },
  gamma: {
    name: 'Gamma',
    description: 'For positive continuous data with shape parameter',
  },
  'normal-mixture': {
    name: 'Normal Mixture',
    description: 'For multimodal symmetric data',
  },
  'lognormal-mixture': {
    name: 'Log-Normal Mixture',
    description: 'For multimodal positive data',
  },
  'compound-beta-normal': {
    name: 'Compound Beta-Normal',
    description: 'For zero-inflated symmetric data',
  },
  'compound-beta-lognormal': {
    name: 'Compound Beta-LogNormal',
    description: 'For zero-inflated revenue data',
  },
  'compound-beta-lognormalmixture': {
    name: 'Compound Beta-LogNormal Mixture',
    description: 'For zero-inflated multimodal revenue data',
  },
};

/**
 * Get model name from config
 */
export function getModelName(modelType?: string): string {
  if (!modelType) return 'Unknown';
  return MODEL_DESCRIPTIONS[modelType]?.name || modelType;
}
