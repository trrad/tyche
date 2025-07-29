import { PosteriorProxy } from '../workers/PosteriorProxy';
import { CompoundPosteriorProxy } from '../workers/PosteriorProxy';
import { Posterior } from './base/types';

export interface WAICResult {
  waic: number;
  elpd: number;
  pWaic: number;
  logLikelihood: number;
}

/**
 * Simplified WAIC implementation that works with both raw posteriors and proxies
 */
export class ModelSelectionCriteria {
  static readonly WAIC_SAMPLES = 1000;

  /**
   * Compute WAIC for a model using posterior (raw or proxy)
   */
  static async computeWAIC(
    posterior: Posterior | PosteriorProxy | CompoundPosteriorProxy,
    data: any[] | { data: any[] },
    modelType?: string
  ): Promise<WAICResult> {
    // Extract data array
    const dataArray = Array.isArray(data) ? data : data.data;
    const n = dataArray.length;

    // Generate posterior samples
    const samples: any[] = [];

    if (posterior instanceof CompoundPosteriorProxy) {
      // For compound models, we need samples from both components
      for (let s = 0; s < this.WAIC_SAMPLES; s++) {
        const freqSample = await posterior.frequency.sample(1);
        const sevSample = await posterior.severity.sample(1);
        samples.push({ frequency: freqSample[0], severity: sevSample[0] });
      }
    } else {
      // Regular posterior - batch sample for efficiency
      const allSamples = await this.sampleFromPosterior(posterior, this.WAIC_SAMPLES);
      samples.push(...allSamples.map(s => [s]));
    }

    // Compute log likelihood matrix
    const logLikMatrix: number[][] = [];

    for (let i = 0; i < n; i++) {
      const logLiksForDataPoint: number[] = [];

      if (posterior instanceof CompoundPosteriorProxy) {
        // Compound model - need special handling
        for (const sample of samples) {
          const logLik = await this.computeCompoundLogLik(
            posterior,
            dataArray[i],
            sample
          );
          logLiksForDataPoint.push(logLik);
        }
      } else {
        // Regular model - can batch compute
        const logProbs = await this.computeLogPdfBatch(posterior, dataArray[i], samples.length);
        logLiksForDataPoint.push(...logProbs);
      }

      logLikMatrix.push(logLiksForDataPoint);
    }

    // Compute WAIC from log likelihood matrix
    return this.computeWAICFromMatrix(logLikMatrix);
  }

  /**
   * Sample from posterior (handles both raw and proxy)
   */
  private static async sampleFromPosterior(
    posterior: Posterior | PosteriorProxy,
    n: number
  ): Promise<number[]> {
    if ('sample' in posterior && typeof posterior.sample === 'function') {
      return posterior.sample(n);
    } else {
      throw new Error('Posterior must have a sample method');
    }
  }

  /**
   * Compute logPdf batch (handles both raw and proxy)
   */
  private static async computeLogPdfBatch(
    posterior: Posterior | PosteriorProxy,
    data: any,
    count: number
  ): Promise<number[]> {
    if (posterior instanceof PosteriorProxy) {
      // Use proxy's batch method
      return await posterior.logPdfBatch(Array(count).fill(data));
    } else if ('logPdf' in posterior && typeof posterior.logPdf === 'function') {
      // Use raw posterior's logPdf method
      return Array(count).fill(data).map(d => posterior.logPdf(d));
    } else {
      throw new Error('Posterior must implement logPdf method');
    }
  }

  /**
   * Special handling for compound models
   */
  private static async computeCompoundLogLik(
    compound: CompoundPosteriorProxy,
    userData: any,
    sample: { frequency: number; severity: number }
  ): Promise<number> {
    const p = sample.frequency;

    if (userData.converted) {
      // P(converted) * P(value | converted)
      const logPConv = Math.log(p);
      const logPValue = await compound.severity.logPdf(userData.value);
      return logPConv + logPValue;
    } else {
      // P(not converted)
      return Math.log(1 - p);
    }
  }

  /**
   * Standard WAIC computation from log likelihood matrix
   */
  private static computeWAICFromMatrix(logLikMatrix: number[][]): WAICResult {
    const n = logLikMatrix.length;
    const S = logLikMatrix[0].length;

    let lppd = 0;
    const pWaicTerms: number[] = [];

    for (let i = 0; i < n; i++) {
      const logLiks = logLikMatrix[i];

      // Log of average likelihood (log-sum-exp trick)
      const maxLogLik = Math.max(...logLiks);
      const sumExp = logLiks.reduce((sum, ll) => sum + Math.exp(ll - maxLogLik), 0);
      const lppdI = maxLogLik + Math.log(sumExp / S);
      lppd += lppdI;

      // Effective number of parameters
      const meanLogLik = logLiks.reduce((sum, ll) => sum + ll, 0) / S;
      const varLogLik = logLiks.reduce((sum, ll) => 
        sum + Math.pow(ll - meanLogLik, 2), 0) / (S - 1);
      pWaicTerms.push(varLogLik);
    }

    const pWaic = pWaicTerms.reduce((sum, v) => sum + v, 0);
    const waic = -2 * (lppd - pWaic);

    return {
      waic,
      elpd: lppd - pWaic,
      pWaic,
      logLikelihood: lppd
    };
  }

  /**
   * Compare models using WAIC with complexity penalty
   */
  static async compareModels(
    models: Array<{
      name: string;
      posterior: Posterior | PosteriorProxy | CompoundPosteriorProxy;
      modelType?: string;
    }>,
    data: any[]
  ): Promise<Array<{
    name: string;
    waic: number;
    deltaWAIC: number;
    weight: number;
  }>> {
    // Compute WAIC for each model
    const results = await Promise.all(
      models.map(async m => ({
        name: m.name,
        waic: await this.computeWAIC(m.posterior, data, m.modelType)
      }))
    );

    // Apply complexity penalty to WAIC scores
    const penalizedResults = results.map(({ name, waic }) => {
      const componentCount = this.getComponentCount(name);
      const complexityPenalty = (componentCount - 1) * 5; // +5 WAIC per additional component
      const penalizedWaic = waic.waic + complexityPenalty;
      
      return {
        name,
        originalWaic: waic.waic,
        penalizedWaic,
        componentCount,
        penalty: complexityPenalty
      };
    });

    // Find best penalized WAIC
    const bestPenalizedWaic = Math.min(...penalizedResults.map(r => r.penalizedWaic));

    // Compute deltas and weights using penalized WAIC
    const comparisons = penalizedResults.map(({ name, originalWaic, penalizedWaic, componentCount, penalty }) => {
      const deltaWAIC = penalizedWaic - bestPenalizedWaic;
      return { 
        name, 
        waic: originalWaic, // Keep original WAIC for display
        penalizedWaic,
        deltaWAIC, 
        weight: 0,
        componentCount,
        penalty
      };
    });

    // Akaike weights based on penalized WAIC
    const relLiks = comparisons.map(c => Math.exp(-0.5 * c.deltaWAIC));
    const sumRelLiks = relLiks.reduce((sum, rl) => sum + rl, 0);
    comparisons.forEach((c, i) => c.weight = relLiks[i] / sumRelLiks);

    return comparisons.sort((a, b) => a.penalizedWaic - b.penalizedWaic);
  }

  /**
   * Extract component count from model name
   */
  private static getComponentCount(name: string): number {
    const match = name.match(/\((\d+)\)/);
    return match ? parseInt(match[1]) : 1; // Default to 1 for simple models
  }
} 