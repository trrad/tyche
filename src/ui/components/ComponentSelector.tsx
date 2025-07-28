import React from 'react';

interface ComponentSelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
  dataSize?: number; // NEW: for data-driven recommendations
}

/**
 * UI component for selecting the number of mixture components
 */
export const ComponentSelector: React.FC<ComponentSelectorProps> = ({
  value,
  onChange,
  min = 1,
  max = 4,
  disabled = false,
  className = '',
  dataSize
}) => {
  const isCompact = className.includes('compact');
  
  // Data-driven recommendations
  const getDataRecommendation = (size?: number) => {
    if (!size) return null;
    if (size < 30) return { max: 1, message: "Too few data points for mixture", color: "text-red-600" };
    if (size < 60) return { max: 2, message: "Limited to 2 components", color: "text-amber-600" };
    if (size < 100) return { max: 3, message: "Limited to 3 components", color: "text-blue-600" };
    return { max: 4, message: "Up to 4 components supported", color: "text-green-600" };
  };
  
  const recommendation = getDataRecommendation(dataSize);
  const effectiveMax = recommendation ? Math.min(max, recommendation.max) : max;
  
  return (
    <div className={`component-selector ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Number of Components
        {dataSize && (
          <span className="ml-2 text-xs text-gray-500">
            ({dataSize} data points)
          </span>
        )}
      </label>
      <div className="flex items-center space-x-4">
        <div className="flex space-x-2">
          {Array.from({ length: effectiveMax - min + 1 }, (_, i) => i + min).map(num => (
            <button
              key={num}
              onClick={() => onChange(num)}
              disabled={disabled}
              className={`
                px-3 py-1 rounded-md text-sm font-medium transition-colors
                ${value === num 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {num}
            </button>
          ))}
        </div>
        {!isCompact && (
          <div className="text-sm text-gray-500">
            {value === 1 && 'Single distribution'}
            {value === 2 && 'Two groups (e.g., low/high spenders)'}
            {value === 3 && 'Three groups'}
            {value === 4 && 'Four groups (max complexity)'}
          </div>
        )}
      </div>
      {!isCompact && (
        <>
          {recommendation && (
            <p className={`mt-2 text-xs ${recommendation.color}`}>
              💡 {recommendation.message}
            </p>
          )}
          {value > 2 && !recommendation && (
            <p className="mt-2 text-xs text-amber-600">
              ⚠️ More components require more data for reliable estimates
            </p>
          )}
        </>
      )}
    </div>
  );
};

// Helper hook for managing component selection with model type
export function useComponentSelection(modelType: string, externalValue?: number) {
  const [internalNumComponents, setInternalNumComponents] = React.useState(2);
  
  // Use external value if provided, otherwise use internal state
  const numComponents = externalValue !== undefined ? externalValue : internalNumComponents;
  const setNumComponents = (value: number) => {
    setInternalNumComponents(value);
  };
  
  // Only show selector for mixture models
  const showComponentSelector = modelType.includes('mixture');
  
  // Reset to 2 when switching to a mixture model (only if using internal state)
  React.useEffect(() => {
    if (showComponentSelector && numComponents === 1 && externalValue === undefined) {
      setInternalNumComponents(2);
    }
  }, [showComponentSelector, numComponents, externalValue]);
  
  return {
    numComponents,
    setNumComponents,
    showComponentSelector
  };
} 