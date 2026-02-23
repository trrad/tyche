/**
 * Analysis Utilities
 *
 * Wrapper functions for Tyche analysis to simplify Observable integration
 */

import * as d3 from 'npm:d3';
import * as Tyche from '../dist/tyche.js';
import { probabilityAbove } from '../components/utils.js';

/**
 * Run Tyche analysis on experiment data
 * Returns both the analysis result and comparison
 */
export async function runAnalysis(experimentData, baseline = null) {
  const analyzer = new Tyche.RevenueAnalyzer();
  const result = await analyzer.analyze(experimentData);

  // Get baseline name
  const baselineName = baseline || result.getVariantNames()[0];

  // Run comparison
  const comparison = await result.compareVariants({ baseline: baselineName });

  return {
    result,
    comparison,
    baseline: baselineName,
  };
}

/**
 * Format analysis results for visualization
 * Converts Tyche results into plain objects with computed statistics
 */
export function formatResults(analysisData, ciLevel = 0.80, threshold = 0.10) {
  const { comparison } = analysisData;
  const ciLower = (1 - ciLevel) / 2;
  const ciUpper = 1 - ciLower;

  const variants = [];

  for (const [name, comp] of comparison.comparisons.entries()) {
    const liftSamples = Array.from(comp.liftSamples);

    variants.push({
      name,
      liftSamples,
      median: d3.median(liftSamples),
      mean: d3.mean(liftSamples),
      ci: [
        d3.quantile(liftSamples, ciLower),
        d3.quantile(liftSamples, ciUpper),
      ],
      probPositive: comp.probabilityPositive,
      probMeaningful: probabilityAbove(liftSamples, threshold),
      metadata: comp.metadata,
    });
  }

  return {
    variants,
    ciLevel,
    ciLower,
    ciUpper,
    threshold,
  };
}

/**
 * Get winner based on decision criteria
 */
export function getWinner(formattedResults, criteria = {}) {
  const {
    requiredProbability = 0.75,
    minimumEffectSize = 0.05,
  } = criteria;

  const { variants, threshold } = formattedResults;

  // Find variant with highest probability of exceeding threshold
  let winner = null;
  let maxProb = 0;

  variants.forEach(variant => {
    if (variant.probMeaningful > maxProb) {
      maxProb = variant.probMeaningful;
      winner = variant;
    }
  });

  // Determine if winner meets criteria
  const meetsThreshold = maxProb >= requiredProbability;
  const meetsEffectSize = winner && winner.median >= minimumEffectSize;

  return {
    variant: winner,
    probability: maxProb,
    meetsThreshold,
    meetsEffectSize,
    shouldShip: meetsThreshold && meetsEffectSize,
    confidence: maxProb > 0.90 ? 'high' : maxProb > 0.75 ? 'medium' : 'low',
  };
}

/**
 * Extract posterior samples for a specific variant
 */
export function getVariantPosterior(analysisResult, variantName, numSamples = 10000) {
  const variantResult = analysisResult.result.getVariantResult(variantName);
  if (!variantResult) {
    throw new Error(`Variant ${variantName} not found`);
  }

  return {
    samples: Array.from(variantResult.getPosteriorSamples(numSamples)),
    isCompound: variantResult.isCompoundModel(),
    decomposition: variantResult.getDecomposition(),
  };
}

/**
 * Get decomposition data for compound models
 */
export function getDecomposition(variantPosterior, numSamples = 10000) {
  if (!variantPosterior.isCompound || !variantPosterior.decomposition) {
    return null;
  }

  const { decomposition } = variantPosterior;

  return {
    frequency: {
      samples: Array.from(decomposition.frequency.sample(numSamples)),
      description: 'Conversion rate',
    },
    severity: {
      samples: Array.from(decomposition.severity.sample(numSamples)),
      description: 'Revenue per converter',
    },
  };
}

/**
 * Compute summary statistics for a set of samples
 */
export function computeSummaryStats(samples, ciLevel = 0.80) {
  const ciLower = (1 - ciLevel) / 2;
  const ciUpper = 1 - ciLower;

  const sorted = [...samples].sort((a, b) => a - b);

  return {
    n: samples.length,
    mean: d3.mean(samples),
    median: d3.median(samples),
    std: d3.deviation(samples),
    min: d3.min(samples),
    max: d3.max(samples),
    ci: [
      d3.quantile(sorted, ciLower),
      d3.quantile(sorted, ciUpper),
    ],
    percentiles: {
      p5: d3.quantile(sorted, 0.05),
      p10: d3.quantile(sorted, 0.10),
      p25: d3.quantile(sorted, 0.25),
      p50: d3.quantile(sorted, 0.50),
      p75: d3.quantile(sorted, 0.75),
      p90: d3.quantile(sorted, 0.90),
      p95: d3.quantile(sorted, 0.95),
    },
  };
}

/**
 * Check for potential issues in the analysis
 */
export function checkDiagnostics(analysisData, experimentData) {
  const warnings = [];
  const { comparison } = analysisData;

  // Check for overlapping confidence intervals
  const variants = Array.from(comparison.comparisons.entries());
  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const [name1, comp1] = variants[i];
      const [name2, comp2] = variants[j];

      const samples1 = Array.from(comp1.liftSamples);
      const samples2 = Array.from(comp2.liftSamples);

      const ci1 = [d3.quantile(samples1, 0.1), d3.quantile(samples1, 0.9)];
      const ci2 = [d3.quantile(samples2, 0.1), d3.quantile(samples2, 0.9)];

      // Check for overlap
      if (ci1[1] > ci2[0] && ci2[1] > ci1[0]) {
        warnings.push({
          type: 'overlap',
          message: `${name1} and ${name2} have overlapping credible intervals`,
          severity: 'medium',
        });
      }
    }
  }

  // Check sample sizes
  const metadata = experimentData.metadata;
  if (metadata.totalRows && metadata.totalRows < 500) {
    warnings.push({
      type: 'sample_size',
      message: `Small sample size (${metadata.totalRows} total sessions)`,
      severity: 'high',
    });
  }

  return warnings;
}
