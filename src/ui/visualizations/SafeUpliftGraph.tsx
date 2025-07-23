import React from 'react';
import { UpliftGraph, UpliftGraphProps } from './UpliftGraph';

interface SafeUpliftGraphProps extends UpliftGraphProps {
  fallbackMessage?: string;
}

/**
 * Safe wrapper for UpliftGraph that handles invalid data gracefully
 */
export const SafeUpliftGraph: React.FC<SafeUpliftGraphProps> = ({
  controlSamples,
  treatmentSamples,
  fallbackMessage = 'No valid data to display',
  ...props
}) => {
  // Validate control samples
  const validControlSamples = controlSamples.filter(s => 
    typeof s === 'number' && 
    !isNaN(s) && 
    isFinite(s)
  );
  
  // Validate treatment samples
  const validTreatmentSamples = treatmentSamples.filter(s => 
    typeof s === 'number' && 
    !isNaN(s) && 
    isFinite(s)
  );
  
  if (validControlSamples.length === 0 || validTreatmentSamples.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-50 rounded">
        <p className="text-gray-500 text-sm">{fallbackMessage}</p>
      </div>
    );
  }
  
  // If we have too few samples, show a warning
  if (validControlSamples.length < 10 || validTreatmentSamples.length < 10) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-yellow-50 rounded">
        <p className="text-yellow-700 text-sm">
          Insufficient data (Control: {validControlSamples.length}, Treatment: {validTreatmentSamples.length} samples)
        </p>
      </div>
    );
  }
  
  // Ensure arrays are the same length (take minimum)
  const minLength = Math.min(validControlSamples.length, validTreatmentSamples.length);
  const alignedControlSamples = validControlSamples.slice(0, minLength);
  const alignedTreatmentSamples = validTreatmentSamples.slice(0, minLength);
  
  return (
    <UpliftGraph 
      controlSamples={alignedControlSamples} 
      treatmentSamples={alignedTreatmentSamples} 
      {...props} 
    />
  );
};