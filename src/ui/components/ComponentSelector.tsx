import React from 'react';

interface ComponentSelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  className?: string;
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
  className = ''
}) => {
  const isCompact = className.includes('compact');
  
  return (
    <div className={`component-selector ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Number of Components
      </label>
      <div className="flex items-center space-x-4">
        <div className="flex space-x-2">
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map(num => (
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
      {!isCompact && value > 2 && (
        <p className="mt-2 text-xs text-amber-600">
          ⚠️ More components require more data for reliable estimates
        </p>
      )}
    </div>
  );
};

// Helper hook for managing component selection with model type
export function useComponentSelection(modelType: string) {
  const [numComponents, setNumComponents] = React.useState(2);
  
  // Only show selector for mixture models
  const showComponentSelector = modelType.includes('mixture');
  
  // Reset to 2 when switching to a mixture model
  React.useEffect(() => {
    if (showComponentSelector && numComponents === 1) {
      setNumComponents(2);
    }
  }, [showComponentSelector, numComponents]);
  
  return {
    numComponents,
    setNumComponents,
    showComponentSelector
  };
} 