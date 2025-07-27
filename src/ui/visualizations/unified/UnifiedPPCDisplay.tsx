// src/ui/visualizations/unified/UnifiedPPCDisplay.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { UnifiedDistributionViz } from './UnifiedDistributionViz';
import { Distribution } from './types';
import { Posterior } from '../../../inference/base/types';
import { PosteriorProxy } from '../../../workers/PosteriorProxy';

interface UnifiedPPCDisplayProps {
  data: any;
  posterior: Posterior | PosteriorProxy;
  modelType: string;
  showDiagnostics?: boolean;
  title?: string;
  width?: number;
  height?: number;
}

export const UnifiedPPCDisplay: React.FC<UnifiedPPCDisplayProps> = ({
  data,
  posterior,
  modelType,
  showDiagnostics = true,
  title = "Posterior Predictive Check",
  width = 800,
  height = 400
}) => {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Extract the relevant data and posterior based on model type
  const { observedData, displayPosterior, xLabel, valueFormatter } = useMemo(() => {
    let observedData: number[];
    let displayPosterior = posterior;
    let xLabel = 'Value';
    let valueFormatter = (v: number) => v.toFixed(1);
    
    // Handle different data formats and model types
    if (modelType.includes('compound')) {
      // For compound models: extract revenue data and use severity posterior
      const userData = Array.isArray(data) ? data : (data.data || []);
      observedData = userData
        .filter((u: any) => u.converted && u.value > 0)
        .map((u: any) => u.value);
      
      // Use severity posterior for revenue visualization
      if ('severity' in posterior) {
        displayPosterior = (posterior as any).severity;
      }
      
      xLabel = 'Revenue (Converted Users)';
      valueFormatter = (v: number) => `$${v.toFixed(0)}`;
      
    } else if (modelType === 'beta-binomial') {
      // For beta-binomial: convert to success rate
      const trials = data.trials || 1000;
      const successes = data.successes || 0;
      const rate = successes / trials;
      
      // Generate samples of rates for visualization
      observedData = [rate]; // Single observed rate
      xLabel = 'Conversion Rate';
      valueFormatter = (v: number) => `${(v * 100).toFixed(1)}%`;
      
    } else {
      // All other models: just use the data as-is
      observedData = Array.isArray(data) ? data : data.data || [];
      
      // Customize based on model hints
      if (modelType.includes('revenue') || modelType.includes('lognormal')) {
        xLabel = 'Revenue';
        valueFormatter = (v: number) => `$${v.toFixed(0)}`;
      } else if (modelType.includes('exponential')) {
        xLabel = 'Time';
        valueFormatter = (v: number) => `${v.toFixed(1)}h`;
      }
    }
    
    return { observedData, displayPosterior, xLabel, valueFormatter };
  }, [data, posterior, modelType]);

  // Calculate diagnostics when data changes
  useEffect(() => {
    if (!showDiagnostics || !observedData.length) return;

    setLoading(true);
    
    const calculateDiagnostics = async () => {
      try {
        // Generate samples for diagnostics
        let samples: number[];
        if (displayPosterior instanceof PosteriorProxy) {
          samples = await displayPosterior.sample(5000);
        } else {
          samples = [];
          for (let i = 0; i < 5000; i++) {
            const sample = displayPosterior.sample()[0];
            if (!isNaN(sample) && isFinite(sample)) {
              samples.push(sample);
            }
          }
        }

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
        console.error('Failed to calculate diagnostics:', err);
      } finally {
        setLoading(false);
      }
    };

    calculateDiagnostics();
  }, [observedData, displayPosterior, showDiagnostics]);

  // Helper functions for diagnostics
  const computeKS = (observed: number[], predicted: number[]): number => {
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
  };

  const checkCalibration = (observed: number[], predicted: number[]): { ci80: number; ci95: number } => {
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
  };

  // Don't render if no observed data
  if (observedData.length === 0) {
    return (
      <div className="p-4 bg-yellow-50 text-yellow-800 rounded">
        <div className="font-semibold mb-2">No data to visualize</div>
        <div className="text-sm">
          This could be due to:
          <ul className="list-disc list-inside mt-1">
            <li>No converted users in the data</li>
            <li>All values are zero or negative</li>
            <li>Invalid data format</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main PPC Visualization */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        
        <UnifiedDistributionViz
          distributions={[
            {
              id: 'observed',
              label: 'Observed Data',
              samples: observedData,
              color: '#6b7280',
              metadata: { isObserved: true }
            } as Distribution,
            {
              id: 'predictive',
              label: 'Posterior Predictive',
              posterior: displayPosterior,
              color: '#3b82f6'
            }
          ]}
          display={{
            mode: 'density',
            showCI: true,
            ciLevels: [0.8],
            opacity: 0.7
          }}
          width={width}
          height={height}
          formatValue={valueFormatter}
          xLabel={xLabel}
        />
      </div>
      
      {/* Diagnostics Panel */}
      {showDiagnostics && diagnostics && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <h3 className="font-semibold text-gray-800">Model Fit Diagnostics</h3>
          
          {loading ? (
            <div className="text-gray-600">Computing diagnostics...</div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}; 