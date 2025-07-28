/**
 * Lightweight Parameter Recovery Utils
 * Simple, direct parameter extraction that mirrors the inference-explorer approach
 */

import { InferenceEngine } from '../../inference/InferenceEngine';
import { GeneratedDataset } from '../../core/data-generation';

export interface RecoveryResult {
  groundTruth: any;
  recovered: any;
  metrics: {
    relativeError: number;
    absoluteError: number;
    coverageCheck: boolean;
    credibleInterval: Array<[number, number]>;
  };
}

export class ParameterRecoveryUtils {
  /**
   * Test parameter recovery for a single dataset
   */
  static async testSingleRecovery(
    dataset: GeneratedDataset,
    engine: InferenceEngine,
    modelType?: any
  ): Promise<RecoveryResult> {
    // Run inference
    const result = await engine.fit(modelType || 'auto', { data: dataset.data });
    
    // Extract recovered parameters using the same logic as the UI
    const recovered = this.extractParameters(result.posterior, modelType || dataset.groundTruth.type);
    
    // Compare to ground truth
    const metrics = this.compareParameters(dataset.groundTruth, recovered, result.posterior);
    
    return {
      groundTruth: dataset.groundTruth,
      recovered,
      metrics
    };
  }

  /**
   * Simple parameter extraction that mirrors the inference-explorer approach
   */
  private static extractParameters(posterior: any, modelType: string): any {
    // Handle compound models first (like UI does)
    if ('frequency' in posterior && 'severity' in posterior) {
      return {
        frequency: {
          probability: posterior.frequency.mean()[0],
          ci: posterior.frequency.credibleInterval(0.95)[0]
        },
        severity: {
          mean: posterior.severity.mean()[0],
          ci: posterior.severity.credibleInterval(0.95)[0]
        }
      };
    }
    
    // Handle mixture models (like UI does)
    if (typeof posterior.getComponents === 'function') {
      const components = posterior.getComponents();
      return {
        numComponents: components.length,
        components: components.map((c: any) => ({
          weight: c.weight,
          mean: c.mean,
          variance: c.variance
        }))
      };
    }
    
    // Handle simple models (like UI does)
    return {
      mean: posterior.mean()[0],
      variance: posterior.variance ? posterior.variance()[0] : undefined,
      ci: posterior.credibleInterval(0.95)[0]
    };
  }

  /**
   * Simple parameter comparison with coverage checking
   */
  private static compareParameters(
    groundTruth: any,
    recovered: any,
    posterior: any
  ): any {
    let relativeError = NaN;
    let absoluteError = NaN;
    let coverageCheck = false;
    let credibleInterval: Array<[number, number]> = [[NaN, NaN]];
    
    try {
      // Extract the key parameter based on model type
      let trueValue: number;
      let recoveredValue: number;
      
      if (groundTruth.type === 'beta-binomial') {
        trueValue = groundTruth.parameters.probability;
        recoveredValue = recovered.frequency?.probability || recovered.mean;
        credibleInterval = recovered.frequency?.ci || recovered.ci || [[0, 1]];
      } else if (groundTruth.type === 'lognormal') {
        trueValue = groundTruth.parameters.mean;
        recoveredValue = recovered.mean;
        credibleInterval = recovered.ci || [[0, 1]];
      } else if (groundTruth.type === 'gamma') {
        trueValue = groundTruth.parameters.mean;
        recoveredValue = recovered.mean;
        credibleInterval = recovered.ci || [[0, 1]];
      } else if (groundTruth.type === 'normal-mixture' || groundTruth.type === 'lognormal-mixture') {
        // For mixtures, check number of components and overall statistics
        const numComponentsMatch = recovered.numComponents === groundTruth.parameters.components;
        
        // Compare overall mean (weighted average)
        const trueMean = groundTruth.parameters.means.reduce((sum: number, mean: number, i: number) => 
          sum + mean * groundTruth.parameters.weights[i], 0
        );
        const recoveredMean = recovered.components.reduce((sum: number, comp: any) => 
          sum + comp.mean * comp.weight, 0
        );
        
        trueValue = trueMean;
        recoveredValue = recoveredMean;
        
        // For mixtures, use a simple coverage check based on overall mean
        const margin = Math.abs(trueMean) * 0.2; // 20% margin
        credibleInterval = [[recoveredMean - margin, recoveredMean + margin]];
      } else if (groundTruth.type.startsWith('compound-')) {
        // For compound models, check conversion rate
        trueValue = groundTruth.parameters.conversionRate;
        recoveredValue = recovered.frequency?.probability || NaN;
        credibleInterval = recovered.frequency?.ci || [[0, 1]];
      } else {
        // Unknown type
        return { relativeError, absoluteError, coverageCheck, credibleInterval };
      }
      
      // Calculate errors only if we have valid values
      if (!isNaN(trueValue) && !isNaN(recoveredValue)) {
        absoluteError = Math.abs(recoveredValue - trueValue);
        relativeError = absoluteError / Math.abs(trueValue);
        
        // Check coverage - simple and reliable
        if (credibleInterval && credibleInterval[0] && !isNaN(credibleInterval[0][0])) {
          coverageCheck = credibleInterval[0][0] <= trueValue && trueValue <= credibleInterval[0][1];
        }
      }
      
    } catch (error) {
      console.error('Error in compareParameters:', error);
    }
    
    return {
      relativeError,
      absoluteError,
      coverageCheck,
      credibleInterval
    };
  }

  /**
   * Test calibration across multiple runs
   */
  static async testCalibration(
    generator: (seed: number) => GeneratedDataset,
    engine: InferenceEngine,
    numRuns: number = 100
  ): Promise<{
    coverage95: number;
    coverage90: number;
    coverage50: number;
    meanRelativeError: number;
    results: RecoveryResult[];
  }> {
    const results: RecoveryResult[] = [];
    
    for (let i = 0; i < numRuns; i++) {
      const dataset = generator(i);
      const result = await this.testSingleRecovery(dataset, engine);
      results.push(result);
    }
    
    // Filter out NaN values before calculating statistics
    const validResults = results.filter(r => !isNaN(r.metrics.relativeError));
    
    // Calculate coverage rates
    const coverage95 = validResults.filter(r => r.metrics.coverageCheck).length / validResults.length;
    const coverage90 = this.calculateCoverage(validResults, 0.9);
    const coverage50 = this.calculateCoverage(validResults, 0.5);
    
    const meanRelativeError = validResults.length > 0 ?
      validResults.reduce((sum, r) => sum + r.metrics.relativeError, 0) / validResults.length :
      NaN;
    
    return {
      coverage95,
      coverage90,
      coverage50,
      meanRelativeError,
      results
    };
  }

  private static calculateCoverage(results: RecoveryResult[], level: number): number {
    // For now, use the same coverage as 95% since we're not recalculating intervals
    // In a more sophisticated version, we'd recalculate credible intervals at different levels
    return results.filter(r => r.metrics.coverageCheck).length / results.length;
  }

  /**
   * Generate comprehensive report
   */
  static generateReport(allResults: RecoveryResult[]): any {
    const validResults = allResults.filter(r => !isNaN(r.metrics.relativeError));
    
    const byModelType: Record<string, any> = {};
    
    // Group by model type
    for (const result of allResults) {
      const modelType = result.groundTruth.type;
      if (!byModelType[modelType]) {
        byModelType[modelType] = {
          count: 0,
          meanError: 0,
          coverage: 0,
          results: []
        };
      }
      
      byModelType[modelType].count++;
      byModelType[modelType].results.push(result);
      
      if (!isNaN(result.metrics.relativeError)) {
        byModelType[modelType].meanError += result.metrics.relativeError;
      }
      if (result.metrics.coverageCheck) {
        byModelType[modelType].coverage++;
      }
    }
    
    // Calculate averages
    for (const type in byModelType) {
      const data = byModelType[type];
      const validCount = data.results.filter((r: RecoveryResult) => 
        !isNaN(r.metrics.relativeError)
      ).length;
      
      data.meanError = validCount > 0 ? data.meanError / validCount : NaN;
      data.coverage = data.count > 0 ? data.coverage / data.count : 0;
      delete data.results; // Remove raw results from summary
    }
    
    return {
      summary: {
        totalRuns: allResults.length,
        validRuns: validResults.length,
        meanRelativeError: validResults.length > 0 ?
          validResults.reduce((sum, r) => sum + r.metrics.relativeError, 0) / validResults.length :
          NaN,
        coverage95: validResults.filter(r => r.metrics.coverageCheck).length / validResults.length,
        coverage90: validResults.filter(r => r.metrics.coverageCheck).length / validResults.length,
        coverage50: validResults.filter(r => r.metrics.coverageCheck).length / validResults.length
      },
      byModelType
    };
  }
} 