import React, { useState } from 'react';
import { ModelType, MODEL_DESCRIPTIONS, isModelMixture } from '../../inference/InferenceEngine';
import { ComponentSelector, useComponentSelection } from './ComponentSelector';

interface ModelSelectorProps {
  value: ModelType;
  onChange: (model: ModelType, numComponents?: number) => void;
  disabled?: boolean;
  className?: string;
  dataSize?: number; // NEW: for data-driven component recommendations
}

/**
 * Simplified model selector with technical names
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  dataSize
}) => {
  const { numComponents, setNumComponents, showComponentSelector } = useComponentSelection(value);
  
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = e.target.value as ModelType;
    onChange(newModel, isModelMixture(newModel) ? numComponents : undefined);
  };
  
  const handleComponentChange = (newComponents: number) => {
    setNumComponents(newComponents);
    onChange(value, newComponents);
  };
  
  return (
    <div className={`model-selector ${className}`}>
      <h3 className="text-lg font-semibold mb-4">2. Select Model</h3>
      
      <select
        value={value}
        onChange={handleModelChange}
        disabled={disabled}
        className="w-full p-2 border rounded mb-4"
      >
        <option value="auto">Auto-detect</option>
        <option value="beta-binomial">Beta-Binomial</option>
        <option value="lognormal">LogNormal</option>
        <option value="normal-mixture">Normal Mixture</option>
        <option value="lognormal-mixture">LogNormal Mixture</option>
        <option value="compound-beta-lognormal">Compound (Beta × LogNormal)</option>
        <option value="compound-beta-lognormalmixture">Compound (Beta × LogNormal Mixture)</option>
      </select>
      
      {/* Component Selector for Mixture Models */}
      {showComponentSelector && (
        <div className="p-3 bg-gray-50 rounded">
          <ComponentSelector
            value={numComponents}
            onChange={handleComponentChange}
            disabled={disabled}
            className="compact"
            dataSize={dataSize}
          />
        </div>
      )}
    </div>
  );
}; 