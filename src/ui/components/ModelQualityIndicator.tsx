import React from 'react';
import { getModelDisplayName } from '../../inference/InferenceEngine';

interface ModelQualityProps {
  waicInfo?: {
    waic: number;
    components?: Array<{
      name?: string;
      k?: number;
      waic: number;
      deltaWAIC: number;
      weight: number;
    }>;
  };
  routeInfo?: {
    reasoning: string[];
    recommendedModel?: string;
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

      
      {/* Relative Model Performance */}
      {waicInfo && waicInfo.components && waicInfo.components.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Model Selection Results
          </h4>
          
          {/* Winner Summary */}
          {(() => {
            const sorted = [...waicInfo.components].sort((a, b) => a.deltaWAIC - b.deltaWAIC);
            const winner = sorted[0];
            const runnerUp = sorted[1];
            
            return (
              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-green-900">
                      🏆 {winner.name || `Model (${winner.k || '?'})`}
                    </div>
                    <div className="text-sm text-green-700">
                      {(winner.weight * 100).toFixed(1)}% probability of being best among candidate models
                    </div>
                    {runnerUp && runnerUp.deltaWAIC > 0 && (
                      <div className="text-xs text-green-600 mt-1">
                        Runner-up: {runnerUp.name || `Model (${runnerUp.k || '?'})`} (ΔWAIC: +{runnerUp.deltaWAIC.toFixed(1)})
                      </div>
                    )}
                  </div>
                  <ModelQualityBadge 
                    waic={waicInfo.waic} 
                    components={waicInfo.components}
                  />
                </div>
              </div>
            );
          })()}
          

        </div>
      )}
      
      {/* Fallback for when no comparison data */}
      {waicInfo && (!waicInfo.components || waicInfo.components.length === 0) && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Model Performance
          </h4>
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium text-blue-900">
                  {routeInfo?.recommendedModel ? 
                    getModelDisplayName(routeInfo.recommendedModel as any) : 
                    'Selected Model'
                  }
                </div>
                <div className="text-sm text-blue-700">
                  WAIC: {waicInfo.waic.toFixed(1)}
                </div>
              </div>
              <div className="text-sm text-gray-600">
                No comparison data
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            WAIC values are relative - compare with other models for interpretation
          </p>
        </div>
      )}
      

    </div>
  );
};

/**
 * Quality indicator based on WAIC relative to alternatives
 */
const ModelQualityBadge: React.FC<{ 
  waic: number; 
  components?: Array<{ 
    name?: string;
    k?: number;
    waic: number; 
    deltaWAIC: number; 
    weight: number 
  }> 
}> = ({ waic, components }) => {
  if (!components || components.length === 0) {
    return (
      <div className="flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-sm font-medium text-gray-600">No comparison</span>
      </div>
    );
  }
  
  // Find the best model (lowest WAIC)
  const bestWaic = Math.min(...components.map(c => c.waic));
  const bestModel = components.find(c => c.waic === bestWaic);
  const currentModel = components.find(c => Math.abs(c.waic - waic) < 0.1); // Allow small floating point differences
  
  if (!currentModel) {
    return (
      <div className="flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-sm font-medium text-gray-600">Unknown</span>
      </div>
    );
  }
  
  // Quality based on relative performance
  const getQuality = (deltaWAIC: number, weight: number) => {
    if (deltaWAIC === 0) {
      // Best model
      if (weight > 0.8) return { label: 'Excellent', color: 'bg-green-500' };
      if (weight > 0.5) return { label: 'Good', color: 'bg-blue-500' };
      return { label: 'Fair', color: 'bg-yellow-500' };
    } else if (deltaWAIC < 4) {
      // Practically equivalent
      return { label: 'Good', color: 'bg-blue-500' };
    } else if (deltaWAIC < 10) {
      // Some evidence against
      return { label: 'Fair', color: 'bg-yellow-500' };
    } else {
      // Strong evidence against
      return { label: 'Poor', color: 'bg-red-500' };
    }
  };
  
  const quality = getQuality(currentModel.deltaWAIC, currentModel.weight);
  
  return (
    <div className="flex items-center space-x-2">
      <span className={`w-2 h-2 rounded-full ${quality.color}`} />
      <span className="text-sm font-medium">{quality.label}</span>
    </div>
  );
}; 