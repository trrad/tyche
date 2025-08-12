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

export interface ModelCandidate {
  name: string;
  posterior: Posterior; // Now properly typed
  modelType: ModelType; // Properly typed: 'beta' | 'lognormal' | 'normal' | 'gamma'
  config?: ModelConfig; // Properly typed model configuration
}

export interface ModelComparisonResult {
  name: string;
  waic: number;
  deltaWAIC: number;
  weight: number;
  config?: any;
}

/**
 * Model Selection Criteria for comparing fitted models
 */
export class ModelSelectionCriteria {
  /**
   * Compare models using WAIC (Watanabe-Akaike Information Criterion)
   * Returns models ranked by WAIC (lower is better)
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
      throw new Error('No data points for WAIC computation');
    }

    let lppd = 0;
    let pWaic = 0;

    if (hasParameterSampling) {
      // Full WAIC with parameter sampling (for mixture models and other complex posteriors)
      const S = 200; // Number of parameter samples for computing variance
      const logLikelihoodSamples: number[][] = [];

      // For each data point, compute log likelihood under S parameter samples
      for (const dataPoint of dataArray) {
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
      for (const dataPoint of dataArray) {
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

    // Compute final WAIC
    const waic = -2 * (lppd - pWaic);

    if (!isFinite(waic)) {
      throw new Error('WAIC computation resulted in non-finite value');
    }

    return waic;
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

    throw new Error('Unable to extract data values for WAIC computation');
  }

  /**
   * Compute Akaike weights from delta WAIC values
   */
  private static computeAkaikeWeights(results: ModelComparisonResult[]): void {
    // Compute relative likelihoods
    const relLikelihoods = results.map((r) => Math.exp(-0.5 * r.deltaWAIC));

    // Normalize to get weights
    const sumRelLikelihoods = relLikelihoods.reduce((sum, rl) => sum + rl, 0);

    for (let i = 0; i < results.length; i++) {
      results[i].weight = relLikelihoods[i] / sumRelLikelihoods;
    }
  }

  /**
   * Future: BIC implementation
   */
  static async compareModelsBIC(
    candidates: ModelCandidate[],
    data: any
  ): Promise<ModelComparisonResult[]> {
    throw new Error('BIC implementation not yet available - use compareModels() for WAIC');
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
