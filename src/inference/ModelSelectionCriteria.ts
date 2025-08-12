/**
 * Model Selection Criteria Module
 *
 * Dedicated module for WAIC/BIC/DIC model comparison as specified in task #75.
 * Contains complexity of model comparison logic in a single location.
 *
 * Updated to leverage hybrid posterior capabilities (task #131) for efficient WAIC computation:
 * - Fast path using analytical logPdf for conjugate models (O(n))
 * - Fallback to sample-based KDE for complex posteriors (O(n * samples))
 */

import { Posterior, ModelConfig, ModelType } from './base/types';
import { logSumExp } from '../core/utils/math/special';
import { TycheError, ErrorCode } from '../core/errors';

export interface ModelCandidate {
  name: string;
  posterior: Posterior; // Now properly typed
  modelType: ModelType; // Properly typed: 'beta' | 'lognormal' | 'normal' | 'gamma'
  config?: ModelConfig; // Properly typed model configuration
  parameterCount?: number; // Number of parameters in the model
}

export interface ModelComparisonResult {
  name: string;
  waic: number;
  bic?: number;
  deltaWAIC: number;
  deltaBIC?: number;
  weight: number;
  weightBIC?: number;
  config?: any;
  parameterCount?: number;
}

/**
 * Model Selection Criteria for comparing fitted models
 */
export class ModelSelectionCriteria {
  /**
   * Get adaptive sample sizes based on dataset size
   * Reduces computation time for large datasets while maintaining accuracy
   */
  private static getAdaptiveSampleSizes(dataSize: number): {
    dataSample: number;
    paramSample: number;
  } {
    if (dataSize <= 100) {
      return { dataSample: dataSize, paramSample: 200 };
    }
    if (dataSize <= 500) {
      return { dataSample: dataSize, paramSample: 100 };
    }
    if (dataSize <= 1000) {
      return { dataSample: dataSize, paramSample: 50 };
    }
    // Large datasets: subsample to max 1000 points
    return { dataSample: 1000, paramSample: 50 };
  }

  /**
   * Random sample from array
   */
  private static randomSample<T>(array: T[], size: number): T[] {
    if (size >= array.length) return array;

    const sampled: T[] = [];
    const indices = new Set<number>();

    while (indices.size < size) {
      indices.add(Math.floor(Math.random() * array.length));
    }

    indices.forEach((i) => sampled.push(array[i]));
    return sampled;
  }

  /**
   * Stratified sampling for compound data to maintain conversion rate
   */
  private static stratifiedSample(data: any[], targetSize: number): any[] {
    if (targetSize >= data.length) return data;

    // Check if this is compound data with conversion status
    if (data.length > 0 && typeof data[0] === 'object' && 'converted' in data[0]) {
      const converted = data.filter((d) => d.converted && d.value > 0);
      const notConverted = data.filter((d) => !d.converted || d.value === 0);

      // Maintain the conversion rate in the sample
      const conversionRate = converted.length / data.length;
      const targetConverted = Math.round(targetSize * conversionRate);
      const targetNotConverted = targetSize - targetConverted;

      return [
        ...this.randomSample(converted, targetConverted),
        ...this.randomSample(notConverted, targetNotConverted),
      ];
    }

    // For simple data, just random sample
    return this.randomSample(data, targetSize);
  }

  /**
   * Compare models using WAIC (Watanabe-Akaike Information Criterion)
   * Returns models ranked by per-observation WAIC (lower is better)
   *
   * Following Vehtari et al. (2017), we report WAIC on the scale of
   * log predictive density per observation to ensure comparability
   * across different sample sizes.
   */
  static async compareModels(
    candidates: ModelCandidate[],
    data: any // Data used to fit the models
  ): Promise<ModelComparisonResult[]> {
    if (candidates.length === 0) {
      throw new Error('No model candidates provided for comparison');
    }

    // Compute WAIC for each candidate
    const results: ModelComparisonResult[] = [];

    for (const candidate of candidates) {
      try {
        const waic = await this.computeWAIC(candidate.posterior, data);
        results.push({
          name: candidate.name,
          waic,
          deltaWAIC: 0, // Will be computed after sorting
          weight: 0, // Will be computed after sorting
          config: candidate.config,
        });
      } catch (e) {
        console.warn(`Failed to compute WAIC for ${candidate.name}:`, e);
        // Skip models that fail WAIC computation
      }
    }

    if (results.length === 0) {
      throw new Error('All models failed WAIC computation');
    }

    // Sort by WAIC (lower is better)
    results.sort((a, b) => a.waic - b.waic);

    // Compute delta WAIC relative to best model
    const bestWAIC = results[0].waic;
    for (const result of results) {
      result.deltaWAIC = result.waic - bestWAIC;
    }

    // Compute Akaike weights
    this.computeAkaikeWeights(results);

    return results;
  }

  /**
   * Compute WAIC for a posterior
   * WAIC = -2 * (lppd - p_waic)
   * where lppd = log pointwise predictive density
   * and p_waic = effective number of parameters (variance penalty)
   */
  private static async computeWAIC(posterior: any, data: any): Promise<number> {
    // Check what methods the posterior supports
    const hasParameterSampling =
      typeof posterior.sampleParameters === 'function' &&
      typeof posterior.logLikelihood === 'function';
    const hasLogPdf = typeof posterior.logPdf === 'function';

    if (!hasParameterSampling && !hasLogPdf) {
      throw new Error(
        'Posterior must implement either (sampleParameters + logLikelihood) or logPdf for WAIC'
      );
    }

    // Prepare data in appropriate format
    let dataArray: any[];
    if (typeof data === 'object' && 'successes' in data && 'trials' in data) {
      // Single binomial observation - keep in original format
      dataArray = [data];
    } else if (Array.isArray(data)) {
      // Array of observations
      dataArray = data;
    } else {
      // Try to extract data values for continuous data
      dataArray = this.extractDataValues(data);
    }

    if (dataArray.length === 0) {
      throw new TycheError(ErrorCode.INSUFFICIENT_DATA, 'No data points for WAIC computation');
    }

    // Apply adaptive subsampling for large datasets
    const originalSize = dataArray.length;
    const { dataSample, paramSample } = this.getAdaptiveSampleSizes(originalSize);

    // Subsample data if needed
    let sampledData = dataArray;
    if (dataSample < originalSize) {
      sampledData = this.stratifiedSample(dataArray, dataSample);
      console.log(
        `WAIC: Subsampling ${originalSize} data points to ${sampledData.length} for efficiency`
      );
    }

    let lppd = 0;
    let pWaic = 0;

    if (hasParameterSampling) {
      // Full WAIC with parameter sampling (for mixture models and other complex posteriors)
      const S = paramSample; // Use adaptive parameter sample size
      const logLikelihoodSamples: number[][] = [];

      // For each data point, compute log likelihood under S parameter samples
      for (const dataPoint of sampledData) {
        const pointLogLiks: number[] = [];

        for (let s = 0; s < S; s++) {
          // Sample parameters from posterior
          const params = posterior.sampleParameters();
          // Compute log likelihood at this data point with these parameters
          const logLik = posterior.logLikelihood(dataPoint, params);
          pointLogLiks.push(logLik);
        }

        // Compute lppd for this point using log-sum-exp
        const pointLppd = logSumExp(pointLogLiks) - Math.log(S);
        lppd += pointLppd;

        // Compute variance for p_waic
        const mean = pointLogLiks.reduce((sum, ll) => sum + ll, 0) / S;
        const variance = pointLogLiks.reduce((sum, ll) => sum + Math.pow(ll - mean, 2), 0) / S;
        pWaic += variance;

        logLikelihoodSamples.push(pointLogLiks);
      }
    } else {
      // Fallback: use logPdf (integrated over parameters) without variance correction
      // This gives a simplified WAIC but is still useful for model comparison
      for (const dataPoint of sampledData) {
        const logProb = posterior.logPdf(dataPoint);
        if (!isFinite(logProb)) {
          console.warn(`Non-finite log probability for data point ${dataPoint}`);
          continue;
        }
        lppd += logProb;
      }
      // Without parameter samples, we can't compute proper p_waic
      pWaic = 0;
    }

    // Scale up if we subsampled
    // IMPORTANT: Only scale lppd, not pWaic
    // pWaic measures parameter uncertainty, which doesn't grow linearly with n
    if (sampledData.length < originalSize) {
      const scaleFactor = originalSize / sampledData.length;
      lppd *= scaleFactor;
      // Don't scale pWaic - it's about parameter complexity, not data quantity
    }

    // Compute final WAIC
    const waic = -2 * (lppd - pWaic);

    if (!isFinite(waic)) {
      throw new TycheError(
        ErrorCode.INTERNAL_ERROR,
        'WAIC computation resulted in non-finite value'
      );
    }

    // Return per-observation WAIC for stable comparisons across different sample sizes
    // This follows Vehtari et al. (2017) recommendation
    return waic / originalSize;
  }

  /**
   * Extract data values from various data formats
   */
  private static extractDataValues(data: any): number[] {
    if (Array.isArray(data)) {
      if (data.length > 0 && typeof data[0] === 'object' && 'value' in data[0]) {
        // UserLevelData format
        return data.map((item: any) => item.value);
      } else if (data.length > 0 && typeof data[0] === 'number') {
        // Simple number array
        return data;
      }
    }

    if (typeof data === 'object' && data !== null) {
      if ('data' in data && Array.isArray(data.data)) {
        return this.extractDataValues(data.data);
      }

      if ('successes' in data && 'trials' in data) {
        // Binomial data - convert to individual outcomes
        const outcomes: number[] = [];
        for (let i = 0; i < data.successes; i++) {
          outcomes.push(1);
        }
        for (let i = 0; i < data.trials - data.successes; i++) {
          outcomes.push(0);
        }
        return outcomes;
      }
    }

    throw new TycheError(
      ErrorCode.INVALID_DATA,
      'Unable to extract data values for WAIC computation'
    );
  }

  /**
   * Compute Akaike weights from delta WAIC values
   * Since we're using per-observation WAIC, the weights are more stable
   * across different sample sizes.
   */
  private static computeAkaikeWeights(results: ModelComparisonResult[]): void {
    // Compute relative likelihoods from per-observation deltaWAIC
    const relLikelihoods = results.map((r) => Math.exp(-0.5 * r.deltaWAIC));

    // Normalize to get weights
    const sumRelLikelihoods = relLikelihoods.reduce((sum, rl) => sum + rl, 0);

    for (let i = 0; i < results.length; i++) {
      results[i].weight = relLikelihoods[i] / sumRelLikelihoods;
    }
  }

  /**
   * Compute BIC (Bayesian Information Criterion)
   * BIC = -2 * log(L) + k * log(n)
   *
   * More conservative than WAIC, better for model structure selection.
   * Particularly effective for mixture component selection.
   */
  static async computeBIC(posterior: any, data: any, parameterCount: number): Promise<number> {
    // Prepare data
    const dataArray = this.extractDataValues(data);
    const n = dataArray.length;

    if (n === 0) {
      throw new TycheError(ErrorCode.INSUFFICIENT_DATA, 'No data points for BIC computation');
    }

    // For large datasets, subsample for efficiency
    const evalData = n > 1000 ? this.stratifiedSample(dataArray, 1000) : dataArray;

    // Compute average log-likelihood using posterior predictive
    let logLikelihood = 0;
    let validPoints = 0;

    for (const point of evalData) {
      const logProb = posterior.logPdf(point);
      if (isFinite(logProb)) {
        logLikelihood += logProb;
        validPoints++;
      }
    }

    if (validPoints === 0) {
      throw new TycheError(ErrorCode.INTERNAL_ERROR, 'No valid log probabilities computed for BIC');
    }

    // Scale if subsampled
    if (n > 1000) {
      logLikelihood *= n / evalData.length;
    }

    // BIC formula
    const bic = -2 * logLikelihood + parameterCount * Math.log(n);

    // Return per-observation BIC for stable comparison
    return bic / n;
  }

  /**
   * Compute both WAIC and BIC efficiently with shared likelihood calculations
   * This is the most efficient approach when you need both metrics
   */
  static async computeWAICandBIC(
    posterior: any,
    data: any,
    parameterCount: number
  ): Promise<{ waic: number; bic: number }> {
    // Extract and prepare data once
    const dataArray = this.extractDataValues(data);
    const originalSize = dataArray.length;

    if (originalSize === 0) {
      throw new TycheError(ErrorCode.INSUFFICIENT_DATA, 'No data points for model comparison');
    }

    const { dataSample, paramSample } = this.getAdaptiveSampleSizes(originalSize);

    // Subsample data once for both metrics
    const sampledData =
      dataSample < originalSize ? this.stratifiedSample(dataArray, dataSample) : dataArray;

    // Check what the posterior supports
    const hasParameterSampling =
      typeof posterior.sampleParameters === 'function' &&
      typeof posterior.logLikelihood === 'function';
    const hasLogPdf = typeof posterior.logPdf === 'function';

    if (!hasParameterSampling && !hasLogPdf) {
      throw new TycheError(
        ErrorCode.NOT_IMPLEMENTED,
        'Posterior must implement either (sampleParameters + logLikelihood) or logPdf'
      );
    }

    let lppd = 0;
    let pWaic = 0;
    let bicLogLikelihood = 0;

    if (hasParameterSampling) {
      // Full WAIC with parameter sampling
      const S = paramSample;
      const logLikelihoodSamples: number[][] = [];

      for (const dataPoint of sampledData) {
        const pointLogLiks: number[] = [];

        for (let s = 0; s < S; s++) {
          const params = posterior.sampleParameters();
          const logLik = posterior.logLikelihood(dataPoint, params);
          pointLogLiks.push(logLik);
        }

        // WAIC computations
        const pointLppd = logSumExp(pointLogLiks) - Math.log(S);
        lppd += pointLppd;

        const mean = pointLogLiks.reduce((sum, ll) => sum + ll, 0) / S;
        const variance = pointLogLiks.reduce((sum, ll) => sum + Math.pow(ll - mean, 2), 0) / S;
        pWaic += variance;

        // For BIC, use the posterior predictive (integrating over parameters)
        bicLogLikelihood += pointLppd;

        logLikelihoodSamples.push(pointLogLiks);
      }
    } else {
      // Fallback: Use posterior predictive directly
      for (const dataPoint of sampledData) {
        const logProb = posterior.logPdf(dataPoint);
        if (isFinite(logProb)) {
          lppd += logProb;
          bicLogLikelihood += logProb;
        }
      }
      // No variance correction available without parameter samples
      pWaic = 0;
    }

    // Scale for subsampling
    if (sampledData.length < originalSize) {
      const scaleFactor = originalSize / sampledData.length;
      lppd *= scaleFactor;
      bicLogLikelihood *= scaleFactor;
      // Don't scale pWaic - it's about parameter uncertainty
    }

    // Compute final metrics
    const waic = -2 * (lppd - pWaic);
    const bic = -2 * bicLogLikelihood + parameterCount * Math.log(originalSize);

    // Return per-observation metrics for stable comparison
    return {
      waic: waic / originalSize,
      bic: bic / originalSize,
    };
  }

  /**
   * Compare models using both WAIC and BIC
   */
  static async compareModelsBIC(
    candidates: ModelCandidate[],
    data: any
  ): Promise<ModelComparisonResult[]> {
    if (candidates.length === 0) {
      throw new TycheError(ErrorCode.INVALID_INPUT, 'No model candidates provided for comparison');
    }

    const results: ModelComparisonResult[] = [];

    for (const candidate of candidates) {
      try {
        // Get parameter count from candidate or estimate
        let paramCount = candidate.parameterCount;

        if (!paramCount) {
          // Estimate based on model config if not provided
          const k = candidate.config?.components || candidate.config?.valueComponents || 1;
          if (k > 1) {
            // Mixture model: k*2 + (k-1) for normal/lognormal
            paramCount = k * 2 + (k - 1);
          } else {
            // Simple model: default to 2 parameters
            paramCount = 2;
          }
          console.warn(
            `Parameter count not provided for ${candidate.name}, estimated as ${paramCount}`
          );
        }

        // Compute both metrics efficiently
        const { waic, bic } = await this.computeWAICandBIC(candidate.posterior, data, paramCount);

        results.push({
          name: candidate.name,
          waic,
          bic,
          deltaWAIC: 0,
          deltaBIC: 0,
          weight: 0,
          parameterCount: paramCount,
          config: candidate.config,
        });
      } catch (e) {
        console.warn(`Failed to compute metrics for ${candidate.name}:`, e);
      }
    }

    if (results.length === 0) {
      throw new TycheError(ErrorCode.INTERNAL_ERROR, 'All models failed metric computation');
    }

    // Sort by BIC (primary criterion for model selection)
    results.sort((a, b) => (a.bic || 0) - (b.bic || 0));

    // Compute deltas for both metrics
    const bestBIC = results[0].bic || 0;
    const bestWAIC = Math.min(...results.map((r) => r.waic));

    for (const result of results) {
      result.deltaBIC = (result.bic || 0) - bestBIC;
      result.deltaWAIC = result.waic - bestWAIC;
    }

    // Compute weights for both metrics
    this.computeBICWeights(results);
    this.computeAkaikeWeights(results);

    return results;
  }

  /**
   * Compute BIC weights (similar to Akaike weights)
   */
  private static computeBICWeights(results: ModelComparisonResult[]): void {
    // Use per-observation deltaBIC
    const relLikelihoods = results.map((r) => Math.exp(-0.5 * (r.deltaBIC || 0)));
    const sumRelLikelihoods = relLikelihoods.reduce((sum, rl) => sum + rl, 0);

    for (let i = 0; i < results.length; i++) {
      results[i].weightBIC = relLikelihoods[i] / sumRelLikelihoods;
    }
  }

  /**
   * Future: DIC implementation
   */
  static async compareModelsDIC(
    candidates: ModelCandidate[],
    data: any
  ): Promise<ModelComparisonResult[]> {
    throw new Error('DIC implementation not yet available - use compareModels() for WAIC');
  }
}
