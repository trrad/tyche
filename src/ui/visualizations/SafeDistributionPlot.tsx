import React from 'react';
import { DistributionPlot, DistributionPlotProps } from './DistributionPlot';

interface SafeDistributionPlotProps extends DistributionPlotProps {
  fallbackMessage?: string;
}

/**
 * Safe wrapper for DistributionPlot that handles invalid data gracefully
 */
export const SafeDistributionPlot: React.FC<SafeDistributionPlotProps> = ({
  samples,
  fallbackMessage = 'No valid data to display',
  ...props
}) => {
  // Validate samples
  const validSamples = samples.filter(s => 
    typeof s === 'number' && 
    !isNaN(s) && 
    isFinite(s)
  );
  
  if (validSamples.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-50 rounded">
        <p className="text-gray-500 text-sm">{fallbackMessage}</p>
      </div>
    );
  }
  
  // If we have too few samples, show a warning
  if (validSamples.length < 10) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-yellow-50 rounded">
        <p className="text-yellow-700 text-sm">
          Insufficient data ({validSamples.length} samples)
        </p>
      </div>
    );
  }
  
  return <DistributionPlot samples={validSamples} {...props} />;
};