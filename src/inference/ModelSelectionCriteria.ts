/**
 * Model Selection Criteria Module
 *
 * Dedicated module for WAIC/BIC/DIC model comparison as specified in task #75.
 * Contains complexity of model comparison logic in a single location.
 */

export interface ModelCandidate {
  name: string;
  posterior: any; // Sample-based posterior
  modelType: string;
  config?: any; // Model-specific configuration
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
   * Compute WAIC for a sample-based posterior
   */
  private static async computeWAIC(posterior: any, data: any): Promise<number> {
    // For now, implement a simplified WAIC approximation
    // TODO: Replace with full WAIC implementation once sample-based posteriors are standardized

    if (!posterior || typeof posterior.sample !== 'function') {
      throw new Error('Posterior must have sample() method for WAIC computation');
    }

    // Get samples from posterior
    const nSamples = 1000;
    const samples = await posterior.sample(nSamples);

    if (!Array.isArray(samples) || samples.length === 0) {
      throw new Error('Posterior returned invalid samples');
    }

    // Compute log pointwise predictive density (simplified)
    const dataArray = Array.isArray(data) ? data : this.extractDataValues(data);
    const logPPD = this.computeLogPointwisePredictiveDensity(samples, dataArray);

    // Compute WAIC components
    const lppd = logPPD.reduce((sum, lpd) => sum + lpd, 0); // Log pointwise predictive density
    const pWAIC = this.computeEffectiveParameters(logPPD); // Effective number of parameters

    const waic = -2 * (lppd - pWAIC);

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
   * Compute log pointwise predictive density (simplified approximation)
   */
  private static computeLogPointwisePredictiveDensity(
    samples: number[],
    dataValues: number[]
  ): number[] {
    // Simplified WAIC computation using kernel density estimation
    // This is a placeholder - full implementation would use proper likelihood computation

    return dataValues.map((y) => {
      // For each data point, compute average log density across posterior samples
      const logDensities = samples.map((sample) => {
        // Simplified: assume normal likelihood with sample as mean
        const sigma = this.estimateStandardDeviation(samples);
        return this.logNormalDensity(y, sample, sigma);
      });

      // Log of average density (for WAIC)
      const avgDensity =
        logDensities.reduce((sum, ld) => sum + Math.exp(ld), 0) / logDensities.length;
      return Math.log(avgDensity);
    });
  }

  /**
   * Compute effective number of parameters for WAIC
   */
  private static computeEffectiveParameters(logPPD: number[]): number {
    // Simplified: use variance of log pointwise densities as proxy
    const mean = logPPD.reduce((sum, lpd) => sum + lpd, 0) / logPPD.length;
    const variance = logPPD.reduce((sum, lpd) => sum + Math.pow(lpd - mean, 2), 0) / logPPD.length;
    return variance;
  }

  /**
   * Estimate standard deviation from samples
   */
  private static estimateStandardDeviation(samples: number[]): number {
    const mean = samples.reduce((sum, x) => sum + x, 0) / samples.length;
    const variance =
      samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (samples.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Log normal density function
   */
  private static logNormalDensity(x: number, mean: number, sigma: number): number {
    const variance = sigma * sigma;
    return -0.5 * Math.log(2 * Math.PI * variance) - Math.pow(x - mean, 2) / (2 * variance);
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
