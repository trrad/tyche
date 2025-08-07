import React, { useState } from 'react';
import { ModelConfig } from '../../inference/base/types';
import { ComponentSelector } from './ComponentSelector';
import { ModelQualityIndicator } from './ModelQualityIndicator';

// Define model options with their configs
interface ModelOption {
  label: string;
  value: string; // Key for selection
  config: ModelConfig | null; // null for 'auto'
  supportsMixture?: boolean;
}

const MODEL_OPTIONS: ModelOption[] = [
  { label: 'Automatic', value: 'auto', config: null },
  {
    label: 'Beta (Conversion)',
    value: 'beta',
    config: { structure: 'simple', type: 'beta', components: 1 },
  },
  {
    label: 'Normal',
    value: 'normal',
    config: { structure: 'simple', type: 'normal', components: 1 },
  },
  {
    label: 'Normal Mixture',
    value: 'normal-mixture',
    config: { structure: 'simple', type: 'normal', components: 2 },
    supportsMixture: true,
  },
  {
    label: 'Log-Normal',
    value: 'lognormal',
    config: { structure: 'simple', type: 'lognormal', components: 1 },
  },
  {
    label: 'Log-Normal Mixture',
    value: 'lognormal-mixture',
    config: { structure: 'simple', type: 'lognormal', components: 2 },
    supportsMixture: true,
  },
  { label: 'Gamma', value: 'gamma', config: { structure: 'simple', type: 'gamma', components: 1 } },
  {
    label: 'Compound Beta-Normal',
    value: 'compound-beta-normal',
    config: {
      structure: 'compound',
      frequencyType: 'beta',
      valueType: 'normal',
      valueComponents: 1,
    },
  },
  {
    label: 'Compound Beta-LogNormal',
    value: 'compound-beta-lognormal',
    config: {
      structure: 'compound',
      frequencyType: 'beta',
      valueType: 'lognormal',
      valueComponents: 1,
    },
  },
  {
    label: 'Compound Beta-LogNormal Mixture',
    value: 'compound-beta-lognormalmixture',
    config: {
      structure: 'compound',
      frequencyType: 'beta',
      valueType: 'lognormal',
      valueComponents: 2,
    },
    supportsMixture: true,
  },
];

interface ModelSelectorProps {
  value: string; // Selected model key ('auto', 'beta', etc.)
  onChange: (modelKey: string, config: ModelConfig | null) => void;
  disabled?: boolean;
  className?: string;
  dataSize?: number; // For data-driven component recommendations
  showQualityFeedback?: boolean; // Show quality indicators
  inferenceResult?: any; // Result containing WAIC info
}

/**
 * Model selector with integrated component selection
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  dataSize,
  showQualityFeedback = true,
  inferenceResult,
}) => {
  // Find current model option
  const currentOption = MODEL_OPTIONS.find((opt) => opt.value === value) || MODEL_OPTIONS[0];

  // Local state for component count
  const [numComponents, setNumComponents] = useState(
    currentOption.config?.components || currentOption.config?.valueComponents || 2
  );

  // Determine if we should show component selector
  const showComponentSelector = currentOption.supportsMixture || false;

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    const newOption = MODEL_OPTIONS.find((opt) => opt.value === newValue);

    if (newOption) {
      // Build config with current component count if mixture
      let config = newOption.config;
      if (config && newOption.supportsMixture) {
        config = {
          ...config,
          ...(config.structure === 'simple'
            ? { components: numComponents }
            : { valueComponents: numComponents }),
        };
      }
      onChange(newValue, config);
    }
  };

  const handleComponentChange = (newComponents: number) => {
    setNumComponents(newComponents);

    // Update config with new component count
    if (currentOption.config && currentOption.supportsMixture) {
      const updatedConfig = {
        ...currentOption.config,
        ...(currentOption.config.structure === 'simple'
          ? { components: newComponents }
          : { valueComponents: newComponents }),
      };
      onChange(value, updatedConfig);
    }
  };

  return (
    <div className={`model-selector ${className}`}>
      <select
        value={value}
        onChange={handleModelChange}
        disabled={disabled}
        className="w-full p-2 border rounded mb-4"
      >
        <optgroup label="Automatic">
          <option value="auto">Auto-detect (Recommended)</option>
        </optgroup>
        <optgroup label="Simple Models">
          {MODEL_OPTIONS.filter(
            (opt) => opt.config?.structure === 'simple' && !opt.supportsMixture
          ).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Mixture Models">
          {MODEL_OPTIONS.filter(
            (opt) => opt.config?.structure === 'simple' && opt.supportsMixture
          ).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Compound Models">
          {MODEL_OPTIONS.filter((opt) => opt.config?.structure === 'compound').map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </optgroup>
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
