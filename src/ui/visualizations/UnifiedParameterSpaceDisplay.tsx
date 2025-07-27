// src/ui/visualizations/UnifiedParameterSpaceDisplay.tsx
import React, { useMemo } from 'react';
import { ParameterSpaceVisualizer } from './ParameterSpaceVisualizer';
import { Posterior, DataInput, CompoundDataInput } from '../../inference/base/types';

interface UnifiedParameterSpaceDisplayProps {
  /** Raw data */
  data: DataInput | CompoundDataInput;
  
  /** Posterior distribution */
  posterior: Posterior | any;
  
  /** Model type for context */
  modelType?: string;
  
  /** Show diagnostics panel */
  showComparison?: boolean;
  
  /** Parameter to visualize */
  parameter?: 'conversion' | 'revenue' | 'value' | 'auto';
}

/**
 * Unified display that automatically configures parameter space visualization
 * based on model type and data characteristics
 */
export const UnifiedParameterSpaceDisplay: React.FC<UnifiedParameterSpaceDisplayProps> = ({
  data,
  posterior,
  modelType = 'unknown',
  showComparison = true,
  parameter = 'auto'
}) => {
  // Determine visualization configuration based on model type
  const vizConfig = useMemo(() => {
    let yParam: 'conversion' | 'revenue' | 'value' = 'value';
    let xLabel = 'Index';
    let yLabel = 'Value';
    let title = 'Parameter Space Analysis';
    
    // Auto-detect parameter based on model type
    if (parameter === 'auto') {
      if (modelType.includes('beta-binomial')) {
        yParam = 'conversion';
        yLabel = 'Conversion Rate';
        title = 'Conversion Rate Analysis';
      } else if (modelType.includes('compound')) {
        yParam = 'revenue';
        yLabel = 'Revenue per User';
        title = 'Revenue Distribution Analysis';
      } else if (modelType.includes('gamma') || modelType.includes('lognormal')) {
        yParam = 'value';
        yLabel = modelType.includes('revenue') ? 'Revenue' : 'Value';
        title = 'Value Distribution Analysis';
      }
    } else {
      yParam = parameter;
      yLabel = parameter.charAt(0).toUpperCase() + parameter.slice(1);
      if (parameter === 'conversion') {
        title = 'Conversion Rate Analysis';
      } else if (parameter === 'revenue') {
        title = 'Revenue Distribution Analysis';
      }
    }
    
    return { yParam, xLabel, yLabel, title };
  }, [modelType, parameter]);
  
  // Check if we have compound data
  const isCompound = 'frequency' in posterior && 'severity' in posterior;
  
  return (
    <div className="space-y-6">
      {/* Main visualization */}
      <div className="bg-white p-6 rounded-lg shadow">
        <ParameterSpaceVisualizer
          data={data}
          posterior={posterior}
          yParameter={vizConfig.yParam}
          xLabel={vizConfig.xLabel}
          yLabel={vizConfig.yLabel}
          title={vizConfig.title}
          showPosteriorDraws={false}
          colors={{
            data: '#FF6B6B',      // Zenith Data coral
            posteriorMean: '#9B59B6', // Zenith Data lilac
            ci80: '#9B59B6',
            ci95: '#9B59B6',
            posteriorDraws: '#9B59B6'
          }}
        />
      </div>
      
      {/* Comparison views for compound models */}
      {showComparison && isCompound && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversion component */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Conversion Component</h3>
            <ParameterSpaceVisualizer
              data={data}
              posterior={posterior}
              yParameter="conversion"
              yLabel="Conversion Rate"
              title=""
              height={300}
              showPosteriorDraws={true}
              numPosteriorDraws={20}
            />
          </div>
          
          {/* Value component */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Value Component (Converted Users)</h3>
            <ParameterSpaceVisualizer
              data={data}
              posterior={posterior}
              yParameter="value"
              yLabel="Value"
              title=""
              height={300}
              showPosteriorDraws={true}
              numPosteriorDraws={20}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Example usage in inference-explorer.tsx
export const ParameterSpaceExample: React.FC<{
  data: any;
  posterior: any;
  modelType: string;
}> = ({ data, posterior, modelType }) => {
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Parameter Space Visualization</h2>
        <div className="text-sm text-gray-600">
          Showing raw data with posterior predictions and uncertainty
        </div>
      </div>
      
      <UnifiedParameterSpaceDisplay
        data={data}
        posterior={posterior}
        modelType={modelType}
        showComparison={true}
      />
      
      {/* Additional context */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Interpretation:</strong> The scatter plot shows your raw data points. 
          The purple line represents the posterior mean estimate, with shaded regions showing 
          80% (darker) and 95% (lighter) credible intervals. This visualization helps identify 
          how well the model captures the data distribution and uncertainty.
        </p>
      </div>
    </div>
  );
}; 