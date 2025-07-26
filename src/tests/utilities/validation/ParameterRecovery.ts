// src/tests/validation/ParameterRecovery.ts
import { InferenceEngine, ModelType } from '../../../inference/InferenceEngine';
import { Posterior } from '../../../inference/base/types';

export interface RecoveryResult {
  recovered: number[];
  true: number[];
  relativeError: number[];
  withinTolerance: boolean;
  coverage: boolean;
  credibleInterval: Array<[number, number]>;
}

export class ParameterRecovery {
  /**
   * Test if inference recovers known parameters
   */
  static async testRecovery(
    trueParams: Record<string, number>,
    dataGenerator: () => any,
    inferenceEngine: InferenceEngine,
    modelType: ModelType,
    tolerance: number = 0.1
  ): Promise<RecoveryResult> {
    // Generate data
    const data = dataGenerator();
    
    // Run inference
    const result = await inferenceEngine.fit(modelType, data);
    const posterior = result.posterior;
    
    // Extract recovered parameters
    const recovered = posterior.mean();
    const trueValues = Object.values(trueParams);
    
    // Calculate relative errors
    const relativeError = recovered.map((est, i) => 
      Math.abs(est - trueValues[i]) / Math.abs(trueValues[i])
    );
    
    // Check if within tolerance
    const withinTolerance = relativeError.every(err => err < tolerance);
    
    // Check coverage
    const credibleIntervals = posterior.credibleInterval(0.95);
    const coverage = credibleIntervals.every((ci, i) => 
      ci[0] <= trueValues[i] && trueValues[i] <= ci[1]
    );
    
    return {
      recovered,
      true: trueValues,
      relativeError,
      withinTolerance,
      coverage,
      credibleInterval: credibleIntervals
    };
  }

  /**
   * Run multiple recovery tests to check calibration
   */
  static async testCalibration(
    paramGenerator: () => Record<string, number>,
    dataGenerator: (params: Record<string, number>) => any,
    inferenceEngine: InferenceEngine,
    modelType: ModelType,
    nReplications: number = 100
  ): Promise<{
    coverageRate: number;
    averageBias: number[];
    rmse: number[];
  }> {
    let covered = 0;
    const biases: number[][] = [];
    const squaredErrors: number[][] = [];

    for (let i = 0; i < nReplications; i++) {
      const trueParams = paramGenerator();
      const data = dataGenerator(trueParams);
      const result = await inferenceEngine.fit(modelType, data);
      
      const recovered = result.posterior.mean();
      const trueValues = Object.values(trueParams);
      const ci = result.posterior.credibleInterval(0.95);
      
      // Check coverage
      const inCI = ci.every((interval, j) => 
        interval[0] <= trueValues[j] && trueValues[j] <= interval[1]
      );
      if (inCI) covered++;
      
      // Track bias and squared error
      const bias = recovered.map((est, j) => est - trueValues[j]);
      const se = recovered.map((est, j) => Math.pow(est - trueValues[j], 2));
      
      biases.push(bias);
      squaredErrors.push(se);
    }

    // Compute summaries
    const nParams = biases[0].length;
    const averageBias = Array(nParams).fill(0).map((_, j) => 
      biases.reduce((sum, b) => sum + b[j], 0) / nReplications
    );
    
    const rmse = Array(nParams).fill(0).map((_, j) => 
      Math.sqrt(squaredErrors.reduce((sum, se) => sum + se[j], 0) / nReplications)
    );

    return {
      coverageRate: covered / nReplications,
      averageBias,
      rmse
    };
  }
}