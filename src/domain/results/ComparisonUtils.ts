/**
 * Utilities for sample-wise variant comparisons
 * Implements the core comparison logic for Issue #108
 * All operations preserve correlations and work with posterior samples
 */

import {
  ComparisonResult,
  ComparisonOptions,
  ComparisonMetadata,
  EffectDecomposition,
} from './types';
import { VariantResult } from './VariantResult';

/**
 * Core utility class for performing sample-wise variant comparisons
 */
export class ComparisonUtils {
  /**
   * Compute full comparison between two variants using posterior samples
   *
   * @param baseline VariantResult for baseline variant
   * @param treatment VariantResult for treatment variant
   * @param options Comparison configuration options
   * @returns ComparisonResult with full posterior distributions
   */
  static async computeComparison(
    baseline: VariantResult,
    treatment: VariantResult,
    options: ComparisonOptions = {}
  ): Promise<ComparisonResult> {
    const nSamples = options.nSamples || 10000;
    const meaningfulThreshold = options.meaningfulThreshold || 0.05;

    // Generate posterior samples for both variants
    const baselineSamples = baseline.getPosterior().sample(nSamples);
    const treatmentSamples = treatment.getPosterior().sample(nSamples);

    // Verify sample lengths match
    if (baselineSamples.length !== treatmentSamples.length) {
      throw new Error(
        `Sample length mismatch: baseline=${baselineSamples.length}, treatment=${treatmentSamples.length}`
      );
    }

    // Compute lift samples (relative effect)
    const liftSamples = this.computeLiftSamples(baselineSamples, treatmentSamples);

    // Compute effect samples (absolute difference)
    const effectSamples = this.computeEffectSamples(baselineSamples, treatmentSamples);

    // Calculate probabilities from samples
    const probabilityPositive = this.computeProbabilityPositive(liftSamples);
    const probabilityMeaningful = this.computeProbabilityMeaningful(
      liftSamples,
      meaningfulThreshold
    );

    // Compute decomposition if both variants are compound models
    const decomposition = await this.computeDecomposition(baseline, treatment, nSamples);

    // Create metadata
    const metadata: ComparisonMetadata = {
      variants: {
        baseline: 'baseline', // Will be set by caller
        treatment: 'treatment', // Will be set by caller
      },
      sampleSizes: {
        baseline: baseline.getMetadata().sampleSize || 0,
        treatment: treatment.getMetadata().sampleSize || 0,
        posteriorSamples: nSamples,
      },
      options,
      hasDecomposition: decomposition !== undefined,
      timestamp: new Date(),
    };

    return {
      liftSamples,
      effectSamples,
      probabilityPositive,
      probabilityMeaningful,
      decomposition,
      metadata,
    };
  }

  /**
   * Compute lift samples (relative effect) from baseline and treatment samples
   * Handles edge cases where baseline is zero
   */
  private static computeLiftSamples(baseline: number[], treatment: number[]): number[] {
    return baseline.map((b, i) => {
      // Handle zero baseline case as specified in task description
      if (Math.abs(b) < 1e-10) {
        return 0;
      }
      return (treatment[i] - b) / b;
    });
  }

  /**
   * Compute effect samples (absolute difference) from baseline and treatment samples
   */
  private static computeEffectSamples(baseline: number[], treatment: number[]): number[] {
    return baseline.map((b, i) => treatment[i] - b);
  }

  /**
   * Calculate probability that lift is positive (P(lift > 0))
   */
  private static computeProbabilityPositive(liftSamples: number[]): number {
    const positiveCount = liftSamples.filter((lift) => lift > 0).length;
    return positiveCount / liftSamples.length;
  }

  /**
   * Calculate probability that lift is meaningful (P(lift > threshold))
   */
  private static computeProbabilityMeaningful(liftSamples: number[], threshold: number): number {
    const meaningfulCount = liftSamples.filter((lift) => Math.abs(lift) > threshold).length;
    return meaningfulCount / liftSamples.length;
  }

  /**
   * Compute effect decomposition for compound models
   * For compound models: total_effect = frequency_effect + value_effect
   * Returns null if either variant is not a compound model
   */
  private static async computeDecomposition(
    baseline: VariantResult,
    treatment: VariantResult,
    nSamples: number
  ): Promise<EffectDecomposition | undefined> {
    // Check if both variants have decomposition capability
    const baselineDecomp = baseline.getDecomposition();
    const treatmentDecomp = treatment.getDecomposition();

    if (!baselineDecomp || !treatmentDecomp) {
      return undefined; // Not compound models
    }

    // Sample from frequency and severity components
    const baselineFreqSamples = baselineDecomp.frequency.sample(nSamples);
    const treatmentFreqSamples = treatmentDecomp.frequency.sample(nSamples);
    const baselineSevSamples = baselineDecomp.severity.sample(nSamples);
    const treatmentSevSamples = treatmentDecomp.severity.sample(nSamples);

    // Compute component effects sample-wise
    // Frequency effect: change in frequency × baseline severity
    const frequencyEffect = baselineFreqSamples.map(
      (bf, i) => (treatmentFreqSamples[i] - bf) * baselineSevSamples[i]
    );

    // Value effect: baseline frequency × change in severity
    const valueEffect = baselineFreqSamples.map(
      (bf, i) => bf * (treatmentSevSamples[i] - baselineSevSamples[i])
    );

    // Compute contribution percentages sample-wise
    const frequencyContribution: number[] = [];
    const valueContribution: number[] = [];

    for (let i = 0; i < nSamples; i++) {
      const totalAbsEffect = Math.abs(frequencyEffect[i]) + Math.abs(valueEffect[i]);

      if (totalAbsEffect > 1e-10) {
        frequencyContribution.push(Math.abs(frequencyEffect[i]) / totalAbsEffect);
        valueContribution.push(Math.abs(valueEffect[i]) / totalAbsEffect);
      } else {
        // No meaningful effect - split evenly
        frequencyContribution.push(0.5);
        valueContribution.push(0.5);
      }
    }

    return {
      combined: {
        frequencyContribution,
        valueContribution,
      },
      components: {
        frequencyEffect,
        valueEffect,
      },
    };
  }

  /**
   * Determine the winning variant from a set of comparisons
   * Winner is the variant with highest probability of positive effect
   */
  static determineWinner(comparisons: Map<string, ComparisonResult>): string | null {
    let winner: string | null = null;
    let maxProbability = 0;

    for (const [variantName, result] of comparisons) {
      if (result.probabilityPositive > maxProbability) {
        maxProbability = result.probabilityPositive;
        winner = variantName;
      }
    }

    // Only declare a winner if probability is meaningfully above 50%
    return maxProbability > 0.6 ? winner : null;
  }

  /**
   * Find the primary comparison for summary purposes
   * Returns the comparison with the highest absolute probability of being meaningful
   */
  static findPrimaryComparison(
    comparisons: Map<string, ComparisonResult>
  ): { treatmentName: string; result: ComparisonResult } | null {
    let primary: { treatmentName: string; result: ComparisonResult } | null = null;
    let maxMeaningfulness = 0;

    for (const [variantName, result] of comparisons) {
      // Use the higher of positive or negative meaningfulness
      const meaningfulness = Math.max(result.probabilityMeaningful, result.probabilityPositive);

      if (meaningfulness > maxMeaningfulness) {
        maxMeaningfulness = meaningfulness;
        primary = { treatmentName: variantName, result };
      }
    }

    return primary;
  }
}
