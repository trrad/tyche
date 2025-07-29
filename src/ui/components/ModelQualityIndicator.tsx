import React from 'react';

interface ModelQualityProps {
  waicInfo?: {
    waic: number;
    components?: Array<{
      k: number;
      waic: number;
      deltaWAIC: number;
      weight: number;
    }>;
  };
  routeInfo?: {
    reasoning: string[];
    modelParams?: {
      numComponents?: number;
      waicComparison?: any[];
    };
  };
}

/**
 * Shows model quality metrics and selection reasoning
 */
export const ModelQualityIndicator: React.FC<ModelQualityProps> = ({ 
  waicInfo, 
  routeInfo 
}) => {
  if (!waicInfo && !routeInfo) return null;
  
  return (
    <div className="model-quality-indicator p-4 bg-gray-50 rounded-lg">
      {/* Selection Reasoning */}
      {routeInfo?.reasoning && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Model Selection Reasoning
          </h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {routeInfo.reasoning.map((reason, i) => (
              <li key={i} className="flex items-start">
                <span className="text-blue-500 mr-2">•</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* WAIC Comparison Table */}
      {waicInfo?.components && waicInfo.components.length > 1 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Component Selection (WAIC)
          </h4>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1 pr-4">Components</th>
                  <th className="text-right py-1 px-2">WAIC</th>
                  <th className="text-right py-1 px-2">ΔWAIC</th>
                  <th className="text-right py-1 pl-2">Weight</th>
                </tr>
              </thead>
              <tbody>
                {waicInfo.components
                  .sort((a, b) => a.deltaWAIC - b.deltaWAIC)
                  .map((comp) => (
                    <tr 
                      key={comp.k} 
                      className={comp.deltaWAIC === 0 ? 'bg-blue-50 font-semibold' : ''}
                    >
                      <td className="py-1 pr-4">{comp.k}</td>
                      <td className="text-right py-1 px-2">
                        {comp.waic.toFixed(1)}
                      </td>
                      <td className="text-right py-1 px-2">
                        {comp.deltaWAIC === 0 ? 
                          <span className="text-green-600">best</span> : 
                          `+${comp.deltaWAIC.toFixed(1)}`
                        }
                      </td>
                      <td className="text-right py-1 pl-2">
                        {(comp.weight * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Lower WAIC indicates better predictive performance
          </p>
        </div>
      )}
      
      {/* Simple Quality Score */}
      {waicInfo && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Model Quality</span>
          <ModelQualityBadge waic={waicInfo.waic} />
        </div>
      )}
    </div>
  );
};

/**
 * Simple badge showing model quality
 */
const ModelQualityBadge: React.FC<{ waic: number }> = ({ waic }) => {
  // This is a simplified quality indicator
  // In practice, you'd want to calibrate these thresholds
  const getQuality = (waic: number) => {
    if (waic < 100) return { label: 'Excellent', color: 'bg-green-500' };
    if (waic < 500) return { label: 'Good', color: 'bg-blue-500' };
    if (waic < 1000) return { label: 'Fair', color: 'bg-yellow-500' };
    return { label: 'Poor', color: 'bg-red-500' };
  };
  
  const quality = getQuality(waic);
  
  return (
    <div className="flex items-center space-x-2">
      <span className={`w-2 h-2 rounded-full ${quality.color}`} />
      <span className="text-sm font-medium">{quality.label}</span>
    </div>
  );
}; 