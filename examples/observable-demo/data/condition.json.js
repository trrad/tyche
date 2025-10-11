/**
 * Condition data loader - single variant deep dive
 *
 * Analyzes a single variant (control or treatment) in detail,
 * returning posterior samples, decomposition, and PPC diagnostics.
 */

import * as Tyche from '../dist/tyche.js';
import { generateMarketplace } from './marketplace.js';

export async function analyzeCondition(variantKey = 'control') {
  const rawData = generateMarketplace();
  const variantData = rawData[variantKey];

  if (!variantData) {
    throw new Error(`Variant '${variantKey}' not found`);
  }

  // Create minimal experiment with just this variant as control
  // (Analyzer needs ExperimentData format)
  const experimentData = {
    id: `condition-${variantKey}`,
    name: `Analysis of ${variantData.name}`,
    variants: {
      control: {
        name: variantKey,
        data: Tyche.StandardDataFactory.fromUserLevel(
          variantData.users.map(u => u.value)
        )
      },
      treatments: new Map() // Empty - no comparisons needed
    },
    metadata: {
      startDate: new Date(),
      hypothesis: `Deep dive into ${variantData.name}`
    }
  };

  // Run analyzer
  const analyzer = new Tyche.RevenueAnalyzer();
  const result = await analyzer.analyze(experimentData);

  // Get the variant result
  const variantResult = result.getVariantResult(variantKey);

  if (!variantResult) {
    throw new Error(`Failed to get result for variant '${variantKey}'`);
  }

  // Get posterior samples
  const posteriorSamples = variantResult.getPosteriorSamples(10000);

  // Get decomposition if available
  const decomposition = variantResult.getDecomposition();
  let freqSamples = null;
  let sevSamples = null;

  if (decomposition) {
    freqSamples = decomposition.frequency.sample(10000);
    sevSamples = decomposition.severity.sample(10000);
  }

  // Get mixture components if available
  const components = variantResult.getComponents();

  // Compute summary stats
  const summary = variantResult.getSummaryStats(10000);

  // Return serializable data for Observable
  return {
    variantKey,
    name: variantData.name,
    description: variantData.description,
    posteriorSamples,
    observedData: variantData.users.map(u => u.value),
    decomposition: decomposition ? {
      frequency: {
        samples: freqSamples
      },
      severity: {
        samples: sevSamples
      }
    } : null,
    components,
    summary,
    groundTruth: variantData.groundTruth,
    metadata: {
      sampleSize: variantData.users.length,
      isCompound: variantResult.isCompoundModel(),
      hasComponents: components !== null
    }
  };
}
