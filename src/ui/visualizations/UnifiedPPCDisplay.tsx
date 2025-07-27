// src/ui/visualizations/UnifiedPPCDisplay.tsx
import React, { useMemo } from 'react';
import { AsyncPPCVisualizer } from './AsyncPPCVisualizer';
import { PPCDiagnostics } from './PPCDiagnostics';
import { Posterior } from '../../inference/base/types';

interface UnifiedPPCDisplayProps {
  data: any;
  posterior: Posterior;
  modelType: string;
  showDiagnostics?: boolean;
}

export const UnifiedPPCDisplay: React.FC<UnifiedPPCDisplayProps> = ({
  data,
  posterior,
  modelType,
  showDiagnostics = true
}) => {
  
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
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Posterior Predictive Check</h3>
        
        <AsyncPPCVisualizer
          observedData={observedData}
          posterior={displayPosterior}
          nSamples={10000}
          showCI={true}
          ciLevels={[0.8, 0.95]}
          formatValue={valueFormatter}
          xLabel={xLabel}
          width={800}
          height={400}
          margin={{ top: 40, right: 40, bottom: 60, left: 60 }}
          colors={{
            observed: '#FF6B6B', // Zenith Data coral
            predicted: '#9B59B6', // Zenith Data lilac
            ci80: '#9B59B6',
            ci95: '#9B59B6'
          }}
        />
      </div>
      
      {showDiagnostics && (
        <PPCDiagnostics
          observedData={observedData}
          posterior={displayPosterior}
          nSamples={5000}
        />
      )}
    </div>
  );
}; 