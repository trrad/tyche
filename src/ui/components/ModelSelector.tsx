import React, { useState } from 'react';
import { ModelType, MODEL_DESCRIPTIONS, isModelMixture } from '../../inference/InferenceEngine';
import { ComponentSelector, useComponentSelection } from './ComponentSelector';
import { ModelQualityIndicator } from './ModelQualityIndicator';

interface ModelSelectorProps {
  value: ModelType;
  onChange: (model: ModelType, numComponents?: number) => void;
  disabled?: boolean;
  className?: string;
  dataSize?: number; // NEW: for data-driven component recommendations
  numComponents?: number; // NEW: external component count
  showQualityFeedback?: boolean; // NEW: show quality indicators
  inferenceResult?: any; // NEW: result containing WAIC info
}

/**
 * Simplified model selector with technical names
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  dataSize,
  numComponents: externalNumComponents,
  showQualityFeedback = true,
  inferenceResult
}) => {
  const { numComponents, setNumComponents, showComponentSelector } = useComponentSelection(value, externalNumComponents);
  
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
      
      {/* Model Quality Feedback */}
      {showQualityFeedback && inferenceResult && (
        <ModelQualityIndicator
          waicInfo={inferenceResult.waicInfo}
          routeInfo={inferenceResult.routeInfo}
        />
      )}
    </div>
  );
}; 