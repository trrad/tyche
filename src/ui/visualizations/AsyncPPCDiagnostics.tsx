import React, { useMemo, useState, useEffect } from 'react';
import { Posterior } from '../../inference/base/types';
import { PosteriorProxy } from '../../workers/PosteriorProxy';

interface AsyncPPCDiagnosticsProps {
  observedData: number[];
  posterior: Posterior | PosteriorProxy;
  nSamples?: number;
}

export const AsyncPPCDiagnostics: React.FC<AsyncPPCDiagnosticsProps> = ({
  observedData,
  posterior,
  nSamples = 5000
}) => {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const generateDiagnostics = async () => {
      setLoading(true);
      setError(null);

      try {
        // Generate posterior samples efficiently
        let samples: number[];
        
        if (posterior instanceof PosteriorProxy) {
          // Use PosteriorProxy's batch sampling
          samples = await posterior.sample(nSamples);
        } else if (posterior.sample && typeof posterior.sample === 'function') {
          // Check if it's async by testing if the sample method accepts arguments
          const sampleFn = posterior.sample as any;
          const testResult = sampleFn(1);
          
          if (testResult instanceof Promise) {
            // Async posterior
            const asyncSamples = await sampleFn(nSamples);
            samples = Array.isArray(asyncSamples) ? asyncSamples : [asyncSamples];
          } else {
            // Sync posterior - use the same pattern as original PPCDiagnostics
            samples = [];
            for (let i = 0; i < nSamples; i++) {
              const sample = posterior.sample()[0];
              if (!isNaN(sample) && isFinite(sample)) {
                samples.push(sample);
              }
            }
          }
        } else {
          throw new Error('Invalid posterior object');
        }

        if (cancelled) return;

        // Compute statistics
        const obsMean = observedData.reduce((a, b) => a + b, 0) / observedData.length;
        const predMean = samples.reduce((a, b) => a + b, 0) / samples.length;
        
        const obsVar = observedData.reduce((sum, x) => sum + Math.pow(x - obsMean, 2), 0) / observedData.length;
        const predVar = samples.reduce((sum, x) => sum + Math.pow(x - predMean, 2), 0) / samples.length;
        
        // Compute KS statistic
        const ks = computeKS(observedData, samples);
        
        // Check calibration
        const calibration = checkCalibration(observedData, samples);
        
        setDiagnostics({
          observedMean: obsMean,
          predictedMean: predMean,
          bias: predMean - obsMean,
          relativeBias: (predMean - obsMean) / obsMean,
          observedStd: Math.sqrt(obsVar),
          predictedStd: Math.sqrt(predVar),
          ksStatistic: ks,
          calibration
        });
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to generate diagnostics:', err);
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    generateDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [observedData, posterior, nSamples]);

  if (loading) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="text-gray-600">Computing diagnostics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-lg">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!diagnostics) return null;

  return (
    <div className="bg-gray-50 p-4 rounded-lg space-y-3">
      <h3 className="font-semibold text-gray-800">Posterior Predictive Diagnostics</h3>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-600">Observed Mean:</span>
          <span className="ml-2 font-mono">{diagnostics.observedMean.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-600">Predicted Mean:</span>
          <span className="ml-2 font-mono">{diagnostics.predictedMean.toFixed(2)}</span>
        </div>
        
        <div>
          <span className="text-gray-600">Observed Std Dev:</span>
          <span className="ml-2 font-mono">{diagnostics.observedStd.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-600">Predicted Std Dev:</span>
          <span className="ml-2 font-mono">{diagnostics.predictedStd.toFixed(2)}</span>
        </div>
        
        <div>
          <span className="text-gray-600">Bias:</span>
          <span className="ml-2 font-mono">{diagnostics.bias.toFixed(3)}</span>
        </div>
        <div>
          <span className="text-gray-600">Relative Bias:</span>
          <span className="ml-2 font-mono">{(diagnostics.relativeBias * 100).toFixed(1)}%</span>
        </div>
      </div>
      
      <div className="border-t pt-3 mt-3">
        <div className="text-sm">
          <span className="text-gray-600">KS Statistic:</span>
          <span className="ml-2 font-mono">{diagnostics.ksStatistic.toFixed(3)}</span>
          <span className="ml-2 text-gray-500">
            ({diagnostics.ksStatistic < 0.05 ? 'Good fit' : 
              diagnostics.ksStatistic < 0.1 ? 'Moderate fit' : 'Poor fit'})
          </span>
        </div>
        
        <div className="text-sm mt-2">
          <span className="text-gray-600">Calibration:</span>
          <div className="ml-4 mt-1 space-y-1">
            <div>80% CI contains {diagnostics.calibration.ci80.toFixed(1)}% of data</div>
            <div>95% CI contains {diagnostics.calibration.ci95.toFixed(1)}% of data</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper functions (same as original)
function computeKS(observed: number[], predicted: number[]): number {
  const sortedObs = [...observed].sort((a, b) => a - b);
  const sortedPred = [...predicted].sort((a, b) => a - b);
  
  let maxDiff = 0;
  const allValues = [...new Set([...sortedObs, ...sortedPred])].sort((a, b) => a - b);
  
  for (const value of allValues) {
    const obsECDF = sortedObs.filter(x => x <= value).length / sortedObs.length;
    const predECDF = sortedPred.filter(x => x <= value).length / sortedPred.length;
    maxDiff = Math.max(maxDiff, Math.abs(obsECDF - predECDF));
  }
  
  return maxDiff;
}

function checkCalibration(observed: number[], predicted: number[]): { ci80: number; ci95: number } {
  const sorted = [...predicted].sort((a, b) => a - b);
  
  const ci80Lower = sorted[Math.floor(sorted.length * 0.1)];
  const ci80Upper = sorted[Math.floor(sorted.length * 0.9)];
  const ci95Lower = sorted[Math.floor(sorted.length * 0.025)];
  const ci95Upper = sorted[Math.floor(sorted.length * 0.975)];
  
  const inCI80 = observed.filter(x => x >= ci80Lower && x <= ci80Upper).length;
  const inCI95 = observed.filter(x => x >= ci95Lower && x <= ci95Upper).length;
  
  return {
    ci80: (inCI80 / observed.length) * 100,
    ci95: (inCI95 / observed.length) * 100
  };
} 