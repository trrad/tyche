// src/ui/visualizations/PPCDiagnostics.tsx
import React, { useMemo } from 'react';
import { Posterior } from '../../inference/base/types';

interface PPCDiagnosticsProps {
  observedData: number[];
  posterior: Posterior;
  nSamples?: number;
}

export const PPCDiagnostics: React.FC<PPCDiagnosticsProps> = ({
  observedData,
  posterior,
  nSamples = 5000
}) => {
  const diagnostics = useMemo(() => {
    // Generate posterior samples
    const samples: number[] = [];
    for (let i = 0; i < nSamples; i++) {
      const sample = posterior.sample()[0];
      if (!isNaN(sample) && isFinite(sample)) {
        samples.push(sample);
      }
    }
    
    // Compute statistics
    const obsMean = observedData.reduce((a, b) => a + b, 0) / observedData.length;
    const predMean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    const obsVar = observedData.reduce((sum, x) => sum + Math.pow(x - obsMean, 2), 0) / observedData.length;
    const predVar = samples.reduce((sum, x) => sum + Math.pow(x - predMean, 2), 0) / samples.length;
    
    // Compute KS statistic
    const ks = computeKS(observedData, samples);
    
    // Check calibration - what % of observed data falls within posterior predictive intervals
    const calibration = checkCalibration(observedData, samples);
    
    return {
      observedMean: obsMean,
      predictedMean: predMean,
      bias: predMean - obsMean,
      relativeBias: (predMean - obsMean) / obsMean,
      observedStd: Math.sqrt(obsVar),
      predictedStd: Math.sqrt(predVar),
      ksStatistic: ks,
      calibration
    };
  }, [observedData, posterior, nSamples]);
  
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
          <span className="ml-2 font-mono">{diagnostics.bias.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-600">Relative Bias:</span>
          <span className="ml-2 font-mono">{(diagnostics.relativeBias * 100).toFixed(1)}%</span>
        </div>
        
        <div>
          <span className="text-gray-600">KS Statistic:</span>
          <span className="ml-2 font-mono">{diagnostics.ksStatistic.toFixed(3)}</span>
        </div>
        <div>
          <span className="text-gray-600">Calibration:</span>
          <span className="ml-2 font-mono">
            {diagnostics.calibration['80']}% in 80% CI
          </span>
        </div>
      </div>
      
      {Math.abs(diagnostics.relativeBias) > 0.1 && (
        <div className="mt-3 p-2 bg-yellow-100 rounded text-sm">
          ⚠️ Model shows {diagnostics.relativeBias > 0 ? 'over' : 'under'}estimation 
          of {Math.abs(diagnostics.relativeBias * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
};

function computeKS(data1: number[], data2: number[]): number {
  const all = [...data1, ...data2].sort((a, b) => a - b);
  let maxDiff = 0;
  
  for (const x of all) {
    const cdf1 = data1.filter(d => d <= x).length / data1.length;
    const cdf2 = data2.filter(d => d <= x).length / data2.length;
    maxDiff = Math.max(maxDiff, Math.abs(cdf1 - cdf2));
  }
  
  return maxDiff;
}

function checkCalibration(observed: number[], samples: number[]): Record<string, number> {
  const levels = [80, 90, 95];
  const result: Record<string, number> = {};
  
  levels.forEach(level => {
    const alpha = (100 - level) / 200;
    const sorted = [...samples].sort((a, b) => a - b);
    const lower = sorted[Math.floor(alpha * samples.length)];
    const upper = sorted[Math.floor((1 - alpha) * samples.length)];
    
    const inInterval = observed.filter(x => x >= lower && x <= upper).length;
    result[level.toString()] = Math.round(inInterval / observed.length * 100);
  });
  
  return result;
} 