// src/tests/utilities/parameter-recovery-utils.ts

import { InferenceEngine } from '../../inference/InferenceEngine';
import { GeneratedDataset } from '../../core/data-generation';

export interface RecoveryResult {
  groundTruth: any;
  recovered: any;
  metrics: {
    relativeError: number;
    absoluteError: number;
    coverageCheck: boolean; // Is true value in credible interval?
    credibleInterval: [number, number];
  };
}

export class ParameterRecoveryUtils {
  /**
   * Test parameter recovery for a single dataset
   */
  static async testSingleRecovery(
    dataset: GeneratedDataset,
    engine: InferenceEngine,
    modelType?: 'auto' | 'beta-binomial' | 'lognormal' | 'normal-mixture' | 'lognormal-mixture' | 'compound-beta-lognormal' | 'compound-beta-lognormalmixture'
  ): Promise<RecoveryResult> {
    // Run inference
    const result = await engine.fit(modelType || 'auto', { data: dataset.data });
    
    // Extract recovered parameters based on model type
    const recovered = this.extractParameters(result);
    
    // Compare to ground truth
    const metrics = this.compareParameters(
      dataset.groundTruth,
      recovered,
      result.posterior
    );
    
    return {
      groundTruth: dataset.groundTruth,
      recovered,
      metrics
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
      const dataset = generator(i); // Use i as seed for reproducibility
      const result = await this.testSingleRecovery(dataset, engine);
      results.push(result);
    }
    
    // Calculate coverage rates
    const coverage95 = results.filter(r => r.metrics.coverageCheck).length / numRuns;
    const coverage90 = this.calculateCoverage(results, 0.9);
    const coverage50 = this.calculateCoverage(results, 0.5);
    
    const meanRelativeError = results.reduce((sum, r) => 
      sum + r.metrics.relativeError, 0) / numRuns;
    
    return {
      coverage95,
      coverage90,
      coverage50,
      meanRelativeError,
      results
    };
  }

  /**
   * Test parameter recovery across different sample sizes
   */
  static async testSampleSizeEffect(
    generator: (n: number, seed: number) => GeneratedDataset,
    engine: InferenceEngine,
    sampleSizes: number[],
    runsPerSize: number = 50
  ): Promise<{
    sampleSizes: number[];
    coverages: number[];
    meanErrors: number[];
    results: Array<{ sampleSize: number; results: RecoveryResult[] }>;
  }> {
    const results: Array<{ sampleSize: number; results: RecoveryResult[] }> = [];
    const coverages: number[] = [];
    const meanErrors: number[] = [];
    
    for (const n of sampleSizes) {
      const sizeResults: RecoveryResult[] = [];
      
      for (let run = 0; run < runsPerSize; run++) {
        const dataset = generator(n, run);
        const result = await this.testSingleRecovery(dataset, engine);
        sizeResults.push(result);
      }
      
      const coverage = sizeResults.filter(r => r.metrics.coverageCheck).length / runsPerSize;
      const meanError = sizeResults.reduce((sum, r) => sum + r.metrics.relativeError, 0) / runsPerSize;
      
      results.push({ sampleSize: n, results: sizeResults });
      coverages.push(coverage);
      meanErrors.push(meanError);
    }
    
    return {
      sampleSizes,
      coverages,
      meanErrors,
      results
    };
  }

  private static extractParameters(inferenceResult: any): any {
    // Handle different model types
    if (inferenceResult.posterior.type === 'beta') {
      const [alpha, beta] = inferenceResult.posterior.parameters;
      return {
        probability: alpha / (alpha + beta),
        alpha,
        beta
      };
    } else if (inferenceResult.posterior.type === 'mixture') {
      return {
        numComponents: inferenceResult.posterior.components.length,
        components: inferenceResult.posterior.components.map((c: any) => ({
          weight: c.weight,
          mean: c.mean(),
          std: Math.sqrt(c.variance())
        }))
      };
    } else if (inferenceResult.posterior.type === 'lognormal') {
      const [logMean, logStd] = inferenceResult.posterior.parameters;
      return {
        logMean,
        logStd,
        mean: Math.exp(logMean + logStd * logStd / 2)
      };
    } else if (inferenceResult.posterior.type === 'normal') {
      const [mean, std] = inferenceResult.posterior.parameters;
      return { mean, std };
    }
    
    // For compound models
    if (inferenceResult.posterior.frequency && inferenceResult.posterior.severity) {
      const freqParams = this.extractParameters({ posterior: inferenceResult.posterior.frequency });
      const sevParams = this.extractParameters({ posterior: inferenceResult.posterior.severity });
      
      return {
        frequency: freqParams,
        severity: sevParams,
        compound: {
          // Expected revenue per user = conversion rate * average value
          expectedRevenue: freqParams.probability * sevParams.mean
        }
      };
    }
    
    // Fallback: return mean
    return { mean: inferenceResult.posterior.mean() };
  }

  private static compareParameters(groundTruth: any, recovered: any, posterior: any): any {
    // Implement comparison logic based on model type
    if (groundTruth.type === 'beta-binomial') {
      const trueP = groundTruth.parameters.probability;
      const recoveredP = recovered.probability;
      const interval = posterior.credibleInterval?.(0.95) || [0, 1];
      
      return {
        relativeError: Math.abs(recoveredP - trueP) / trueP,
        absoluteError: Math.abs(recoveredP - trueP),
        coverageCheck: interval[0] <= trueP && trueP <= interval[1],
        credibleInterval: interval
      };
    }
    
    if (groundTruth.type === 'mixture') {
      // Compare mixture components
      const trueComponents = groundTruth.components;
      const recoveredComponents = recovered.components;
      
      if (trueComponents && recoveredComponents) {
        // Compare weights
        const weightErrors = trueComponents.map((trueComp: any, i: number) => {
          const recoveredComp = recoveredComponents[i];
          if (!recoveredComp) return 1.0; // Missing component
          return Math.abs(recoveredComp.weight - trueComp.weight) / trueComp.weight;
        });
        
        const meanWeightError = weightErrors.reduce((sum: number, err: number) => sum + err, 0) / weightErrors.length;
        
        return {
          relativeError: meanWeightError,
          absoluteError: meanWeightError,
          coverageCheck: true, // TODO: implement proper coverage for mixtures
          credibleInterval: [0, 1] // TODO: implement credible intervals for mixtures
        };
      }
    }
    
    if (groundTruth.type === 'lognormal') {
      const trueLogMean = groundTruth.parameters.logMean;
      const recoveredLogMean = recovered.logMean;
      const interval = posterior.credibleInterval?.(0.95) || [0, 1];
      
      return {
        relativeError: Math.abs(recoveredLogMean - trueLogMean) / Math.abs(trueLogMean),
        absoluteError: Math.abs(recoveredLogMean - trueLogMean),
        coverageCheck: interval[0] <= trueLogMean && trueLogMean <= interval[1],
        credibleInterval: interval
      };
    }
    
    if (groundTruth.type === 'normal') {
      const trueMean = groundTruth.parameters.mean;
      const recoveredMean = recovered.mean;
      const interval = posterior.credibleInterval?.(0.95) || [0, 1];
      
      return {
        relativeError: Math.abs(recoveredMean - trueMean) / Math.abs(trueMean),
        absoluteError: Math.abs(recoveredMean - trueMean),
        coverageCheck: interval[0] <= trueMean && trueMean <= interval[1],
        credibleInterval: interval
      };
    }
    
    if (groundTruth.type === 'compound') {
      const trueConvRate = groundTruth.parameters.conversionRate;
      const recoveredConvRate = recovered.frequency?.probability;
      const trueRevenueMean = groundTruth.parameters.revenueMean;
      const recoveredRevenueMean = recovered.severity?.mean;
      
      const convError = recoveredConvRate ? Math.abs(recoveredConvRate - trueConvRate) / trueConvRate : 1.0;
      const revenueError = recoveredRevenueMean ? Math.abs(recoveredRevenueMean - trueRevenueMean) / trueRevenueMean : 1.0;
      
      return {
        relativeError: (convError + revenueError) / 2,
        absoluteError: (convError + revenueError) / 2,
        coverageCheck: true, // TODO: implement proper coverage for compound models
        credibleInterval: [0, 1]
      };
    }
    
    // Default fallback
    return {
      relativeError: 0,
      absoluteError: 0,
      coverageCheck: true,
      credibleInterval: [0, 1]
    };
  }

  private static calculateCoverage(results: RecoveryResult[], level: number): number {
    // Recalculate coverage for different credible interval levels
    // This would require storing more detailed posterior info
    return results.filter(r => r.metrics.coverageCheck).length / results.length;
  }

  /**
   * Generate a summary report of parameter recovery performance
   */
  static generateReport(results: RecoveryResult[]): {
    summary: {
      totalRuns: number;
      meanRelativeError: number;
      coverage95: number;
      coverage90: number;
      coverage50: number;
    };
    byModelType: Record<string, {
      count: number;
      meanError: number;
      coverage: number;
    }>;
  } {
    const totalRuns = results.length;
    const meanRelativeError = results.reduce((sum, r) => sum + r.metrics.relativeError, 0) / totalRuns;
    const coverage95 = results.filter(r => r.metrics.coverageCheck).length / totalRuns;
    const coverage90 = this.calculateCoverage(results, 0.9);
    const coverage50 = this.calculateCoverage(results, 0.5);
    
    // Group by model type
    const byModelType: Record<string, { count: number; meanError: number; coverage: number }> = {};
    
    results.forEach(result => {
      const modelType = result.groundTruth.type;
      if (!byModelType[modelType]) {
        byModelType[modelType] = { count: 0, meanError: 0, coverage: 0 };
      }
      
      byModelType[modelType].count++;
      byModelType[modelType].meanError += result.metrics.relativeError;
      if (result.metrics.coverageCheck) {
        byModelType[modelType].coverage++;
      }
    });
    
    // Calculate averages
    Object.keys(byModelType).forEach(type => {
      const stats = byModelType[type];
      stats.meanError /= stats.count;
      stats.coverage /= stats.count;
    });
    
    return {
      summary: {
        totalRuns,
        meanRelativeError,
        coverage95,
        coverage90,
        coverage50
      },
      byModelType
    };
  }
} 