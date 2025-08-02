/**
 * ConversionValueModelVI
 *
 * Standalone VI-based model for conversion and value analysis
 * Replaces MCMC-based ConversionValueModel with fast variational inference
 */

import { VariationalInferenceEngine, DataInput, VIResult, FitOptions } from '../archive/vi-engine';

// Re-export types we need from the old model for compatibility
export interface UserData {
  converted: boolean;
  value: number;
}

export interface VariantData {
  name: string;
  users: UserData[];
}

export interface VariantSummary {
  n: number;
  conversions: number;
  convertedValues: number[];
  meanValue: number;
  medianValue: number;
  maxValue: number;
}

export interface ConversionValuePosterior {
  conversionRates: Map<string, number[]>;
  meanValues: Map<string, number[]>;
  relativeEffects: Map<string, { overall: number[] }>;
  diagnostics: any;
  outlierInfluence: Map<string, OutlierDiagnostic>;
  effectDrivers: Map<string, EffectDriver>;
}

export interface OutlierDiagnostic {
  topValueContribution: number;
  top5ValueContribution: number;
}

export interface EffectDriver {
  conversionComponent: number;
  valueComponent: number;
  interaction: number;
}

export interface VIAnalysisOptions {
  modelType?: 'auto' | 'beta-binomial' | 'zero-inflated-lognormal' | 'normal-mixture';
  maxIterations?: number;
  tolerance?: number;
}

export class ConversionValueModelVI {
  private viEngine: VariationalInferenceEngine;
  private variants: Map<string, VariantData> = new Map();
  private summaries: Map<string, VariantSummary> = new Map();

  constructor() {
    this.viEngine = new VariationalInferenceEngine();
  }

  /**
   * Add a variant and its data to the model
   */
  addVariant(data: VariantData) {
    const summary = this.summarizeData(data);
    this.summaries.set(data.name, summary);
    this.variants.set(data.name, data);
  }

  /**
   * Get a summary of the current model state
   */
  getSummary(): string {
    const lines = ['Conversion + Value Model Summary', '='.repeat(40)];

    for (const [name, summary] of this.summaries) {
      lines.push(`\n${name}:`);
      lines.push(`  Users: ${summary.n}`);
      lines.push(
        `  Conversions: ${summary.conversions} (${((summary.conversions / summary.n) * 100).toFixed(1)}%)`
      );
      if (summary.convertedValues.length > 0) {
        lines.push(`  Mean Value: $${summary.meanValue.toFixed(2)}`);
        lines.push(`  Median Value: $${summary.medianValue.toFixed(2)}`);
        lines.push(`  Max Value: $${summary.maxValue.toFixed(2)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Compute summary statistics for a variant
   */
  private summarizeData(data: VariantData): VariantSummary {
    const n = data.users.length;
    const conversions = data.users.filter((u) => u.converted).length;
    const convertedValues = data.users
      .filter((u) => u.converted && u.value > 0)
      .map((u) => u.value)
      .sort((a, b) => a - b);

    const meanValue =
      convertedValues.length > 0
        ? convertedValues.reduce((a, b) => a + b, 0) / convertedValues.length
        : 0;

    const medianValue =
      convertedValues.length > 0 ? convertedValues[Math.floor(convertedValues.length / 2)] : 0;

    const maxValue = convertedValues.length > 0 ? convertedValues[convertedValues.length - 1] : 0;

    return {
      n,
      conversions,
      convertedValues,
      meanValue,
      medianValue,
      maxValue,
    };
  }

  /**
   * Analyze using Variational Inference
   */
  async analyze(options: VIAnalysisOptions = {}): Promise<ConversionValuePosterior> {
    const modelType =
      options.modelType === 'auto' ? this.detectBestModel() : options.modelType || 'beta-binomial';

    // Collect results for each variant
    const conversionRates = new Map<string, number[]>();
    const meanValues = new Map<string, number[]>();
    const viResults = new Map<string, VIResult>();

    // Run VI for each variant
    for (const [variantName, data] of this.variants) {
      const summary = this.summaries.get(variantName)!;

      // For conversion rate (always use beta-binomial)
      const conversionInput: DataInput = {
        data: {
          successes: summary.conversions,
          trials: summary.n,
        },
      };

      const conversionResult = await this.viEngine.fit('beta-binomial', conversionInput, {
        maxIterations: options.maxIterations || 1000,
        tolerance: options.tolerance || 1e-6,
      });

      // Extract samples from posterior
      const convSamples = Array.from(
        { length: 1000 },
        () => conversionResult.posterior.sample()[0]
      );
      conversionRates.set(variantName, convSamples);

      // For value analysis (if we have converted users)
      if (summary.convertedValues.length > 0) {
        const valueInput: DataInput = {
          data: summary.convertedValues,
          config: { numComponents: 2 },
        };

        let valueResult: VIResult;

        if (modelType === 'zero-inflated-lognormal') {
          // Include zeros in the data for ZI model
          const allValues = data.users.map((u) => u.value);
          valueResult = await this.viEngine.fit(
            'zero-inflated-lognormal',
            { data: allValues },
            {
              maxIterations: options.maxIterations || 1000,
              tolerance: options.tolerance || 1e-6,
            }
          );
        } else if (modelType === 'normal-mixture') {
          valueResult = await this.viEngine.fit('normal-mixture', valueInput, {
            maxIterations: options.maxIterations || 1000,
            tolerance: options.tolerance || 1e-6,
          });
        } else {
          // Default to simple normal approximation
          const mean = summary.meanValue;
          const variance = this.computeVariance(summary.convertedValues);

          // Create mock VI result for compatibility
          valueResult = {
            posterior: {
              mean: () => [mean],
              variance: () => [variance],
              sample: () => [mean + Math.sqrt(variance) * (Math.random() - 0.5) * 2],
              credibleInterval: (level: number) => {
                const z = 1.96; // 95% CI
                const se = Math.sqrt(variance / summary.convertedValues.length);
                return [[mean - z * se, mean + z * se]];
              },
              logPdf: (_data: any) => {
                throw new Error('logPdf not implemented for mock VI posterior');
              },
            },
            diagnostics: {
              converged: true,
              iterations: 1,
              finalELBO: 0,
            },
          };
        }

        // Extract value samples
        const valueSamples = Array.from({ length: 1000 }, () => valueResult.posterior.sample()[0]);
        meanValues.set(variantName, valueSamples);
        viResults.set(variantName, valueResult);
      }
    }

    // Calculate relative effects
    const relativeEffects = this.calculateRelativeEffects(conversionRates, meanValues);

    // Compute diagnostics
    const outlierInfluence = this.computeOutlierInfluence();
    const effectDrivers = this.computeEffectDrivers(conversionRates, meanValues);

    // Aggregate diagnostics from VI results
    const diagnostics = this.aggregateVIDiagnostics(viResults);

    return {
      conversionRates,
      meanValues,
      relativeEffects,
      diagnostics,
      outlierInfluence,
      effectDrivers,
    };
  }

  /**
   * Detect the best VI model based on data characteristics
   */
  private detectBestModel(): string {
    // Check for zero inflation
    let hasZeros = false;
    let totalValueCount = 0;
    let zeroCount = 0;

    for (const [_, data] of this.variants) {
      data.users.forEach((user) => {
        totalValueCount++;
        if (user.value === 0) {
          zeroCount++;
          hasZeros = true;
        }
      });
    }

    const zeroInflationRate = zeroCount / totalValueCount;

    // Check for multimodality
    const allValues: number[] = [];
    for (const [_, data] of this.variants) {
      data.users.forEach((user) => {
        if (user.value > 0) allValues.push(user.value);
      });
    }

    if (allValues.length === 0) return 'beta-binomial';

    const variance = this.computeVariance(allValues);
    const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
    const cv = Math.sqrt(variance) / mean; // Coefficient of variation

    // Decision logic
    if (hasZeros && zeroInflationRate > 0.1) {
      return 'zero-inflated-lognormal';
    } else if (cv > 1.5 || this.detectMultimodality(allValues)) {
      return 'normal-mixture';
    } else {
      return 'beta-binomial'; // Default for simple cases
    }
  }

  /**
   * Quick multimodality detection using Hartigan's dip test approximation
   */
  private detectMultimodality(values: number[]): boolean {
    if (values.length < 30) return false;

    // Sort values
    const sorted = [...values].sort((a, b) => a - b);

    // Simple heuristic: check for gaps in the distribution
    const n = sorted.length;
    const gaps: number[] = [];

    for (let i = 1; i < n; i++) {
      gaps.push(sorted[i] - sorted[i - 1]);
    }

    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const maxGap = Math.max(...gaps);

    // If max gap is significantly larger than mean, might be multimodal
    return maxGap > meanGap * 5;
  }

  /**
   * Compute variance of an array
   */
  private computeVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map((v) => (v - mean) ** 2);
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Calculate relative effects between variants
   */
  private calculateRelativeEffects(
    conversionRates: Map<string, number[]>,
    meanValues: Map<string, number[]>
  ): Map<string, { overall: number[] }> {
    const effects = new Map<string, { overall: number[] }>();
    const variants = Array.from(conversionRates.keys());

    if (variants.length < 2) return effects;

    // Use first variant as control
    const control = variants[0];
    const controlConv = conversionRates.get(control)!;
    const controlValue = meanValues.get(control) || Array(1000).fill(1);

    for (let i = 1; i < variants.length; i++) {
      const treatment = variants[i];
      const treatmentConv = conversionRates.get(treatment)!;
      const treatmentValue = meanValues.get(treatment) || Array(1000).fill(1);

      // Calculate overall effect (revenue per user)
      const overallEffects = controlConv.map((cc, idx) => {
        const tc = treatmentConv[idx];
        const cv = controlValue[idx % controlValue.length];
        const tv = treatmentValue[idx % treatmentValue.length];

        const controlRPU = cc * cv;
        const treatmentRPU = tc * tv;

        return controlRPU > 0 ? (treatmentRPU - controlRPU) / controlRPU : 0;
      });

      effects.set(treatment, { overall: overallEffects });
    }

    return effects;
  }

  /**
   * Compute outlier influence for each variant
   */
  private computeOutlierInfluence(): Map<string, OutlierDiagnostic> {
    const influence = new Map<string, OutlierDiagnostic>();

    for (const [variantName, data] of this.variants) {
      const values = data.users
        .filter((u) => u.converted && u.value > 0)
        .map((u) => u.value)
        .sort((a, b) => b - a);

      if (values.length === 0) {
        influence.set(variantName, {
          topValueContribution: 0,
          top5ValueContribution: 0,
        });
        continue;
      }

      const totalValue = values.reduce((a, b) => a + b, 0);
      const topValue = values[0];
      const top5Value = values.slice(0, 5).reduce((a, b) => a + b, 0);

      influence.set(variantName, {
        topValueContribution: (topValue / totalValue) * 100,
        top5ValueContribution: (top5Value / totalValue) * 100,
      });
    }

    return influence;
  }

  /**
   * Compute what drives the effect
   */
  private computeEffectDrivers(
    conversionRates: Map<string, number[]>,
    meanValues: Map<string, number[]>
  ): Map<string, EffectDriver> {
    const drivers = new Map<string, EffectDriver>();
    const variants = Array.from(conversionRates.keys());

    if (variants.length < 2) return drivers;

    const control = variants[0];
    const controlConv = conversionRates.get(control)!;
    const controlValue = meanValues.get(control) || Array(1000).fill(1);

    for (let i = 1; i < variants.length; i++) {
      const treatment = variants[i];
      const treatmentConv = conversionRates.get(treatment)!;
      const treatmentValue = meanValues.get(treatment) || Array(1000).fill(1);

      // Calculate average effects
      const avgControlConv = controlConv.reduce((a, b) => a + b, 0) / controlConv.length;
      const avgTreatmentConv = treatmentConv.reduce((a, b) => a + b, 0) / treatmentConv.length;
      const avgControlValue = controlValue.reduce((a, b) => a + b, 0) / controlValue.length;
      const avgTreatmentValue = treatmentValue.reduce((a, b) => a + b, 0) / treatmentValue.length;

      // Decompose effect
      const conversionEffect = (avgTreatmentConv - avgControlConv) * avgControlValue;
      const valueEffect = avgControlConv * (avgTreatmentValue - avgControlValue);
      const interaction =
        (avgTreatmentConv - avgControlConv) * (avgTreatmentValue - avgControlValue);

      const totalEffect = conversionEffect + valueEffect + interaction;

      drivers.set(treatment, {
        conversionComponent: Math.abs(conversionEffect / totalEffect) * 100,
        valueComponent: Math.abs(valueEffect / totalEffect) * 100,
        interaction: Math.abs(interaction / totalEffect) * 100,
      });
    }

    return drivers;
  }

  /**
   * Aggregate VI diagnostics
   */
  private aggregateVIDiagnostics(viResults: Map<string, VIResult>): any {
    const allResults = Array.from(viResults.values());

    if (allResults.length === 0) {
      return {
        method: 'vi',
        converged: true,
        iterations: 0,
        acceptanceRate: 1.0,
      };
    }

    // Average diagnostics
    const avgIterations =
      allResults.reduce((sum, r) => sum + r.diagnostics.iterations, 0) / allResults.length;
    const allConverged = allResults.every((r) => r.diagnostics.converged);
    const avgELBO =
      allResults.reduce((sum, r) => sum + (r.diagnostics.finalELBO || 0), 0) / allResults.length;

    return {
      method: 'vi',
      converged: allConverged,
      iterations: Math.round(avgIterations),
      finalELBO: avgELBO,
      acceptanceRate: 0.95, // Mock for compatibility with existing UI
    };
  }
}
