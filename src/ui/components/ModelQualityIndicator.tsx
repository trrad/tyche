import React from 'react';
import { ComponentComparisonResult } from '../../inference/ModelComparison';

interface ModelQualityProps {
  waicInfo?: ComponentComparisonResult | null;
  routeInfo?: {
    reasoning: string[];
    selectedModel?: any;
    confidence?: number;
  };
}

/**
 * Shows model quality metrics and selection reasoning
 */
export const ModelQualityIndicator: React.FC<ModelQualityProps> = ({ waicInfo, routeInfo }) => {
  if (!waicInfo && !routeInfo) return null;

  return (
    <div className="model-quality-indicator p-4 bg-gray-50 rounded-lg">
      {/* Component Comparison Results */}
      {waicInfo && waicInfo.models && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Component Selection (
            {waicInfo.criterion === 'BIC+WAIC' ? 'BIC & WAIC' : waicInfo.criterion || 'WAIC'})
          </h4>

          {/* Summary */}
          <div
            className={`p-3 rounded-lg border ${
              waicInfo.selectedK === waicInfo.optimalK
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div
              className="font-medium mb-1 ${
              waicInfo.selectedK === waicInfo.optimalK 
                ? 'text-green-900' 
                : 'text-amber-900'
            }"
            >
              {waicInfo.selectedK === waicInfo.optimalK
                ? `✓ Component selection confirmed (k=${waicInfo.selectedK})`
                : `ℹ️ Consider k=${waicInfo.optimalK} instead of k=${waicInfo.selectedK}`}
            </div>

            {/* Show confidence */}
            <div className="text-sm text-gray-700">
              Confidence: {(waicInfo.confidence * 100).toFixed(1)}%
            </div>

            {/* Show disagreement between BIC and WAIC if present */}
            {waicInfo.optimalKWAIC && waicInfo.optimalK !== waicInfo.optimalKWAIC && (
              <div className="text-sm text-amber-700 mt-1">
                BIC prefers k={waicInfo.optimalK}, WAIC prefers k={waicInfo.optimalKWAIC}
              </div>
            )}
          </div>

          {/* Detailed comparison table */}
          <div className="mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="pb-1">k</th>
                  <th className="pb-1">Params</th>
                  <th className="pb-1" title="Per-observation BIC">
                    BIC/n
                  </th>
                  <th className="pb-1" title="Per-observation WAIC">
                    WAIC/n
                  </th>
                  <th className="pb-1">Weight</th>
                </tr>
              </thead>
              <tbody>
                {waicInfo.models.map((model) => (
                  <tr
                    key={model.k}
                    className={`${model.k === waicInfo.selectedK ? 'font-semibold' : ''} ${
                      model.k === waicInfo.optimalK ? 'text-green-700' : ''
                    }`}
                  >
                    <td className="py-1">
                      {model.k}
                      {model.k === waicInfo.selectedK && ' ✓'}
                    </td>
                    <td className="py-1">{model.parameters || '?'}</td>
                    <td
                      className="py-1 ${
                      model.k === waicInfo.optimalK ? 'font-semibold' : ''
                    }"
                    >
                      {model.bic ? model.bic.toFixed(3) : '-'}
                      {model.deltaBIC === 0 && ' *'}
                    </td>
                    <td
                      className="py-1 ${
                      model.k === waicInfo.optimalKWAIC ? 'font-semibold' : ''
                    }"
                    >
                      {model.waic.toFixed(3)}
                      {model.deltaWAIC === 0 && ' *'}
                    </td>
                    <td className="py-1">{(model.weightBIC * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Computation time and explanation */}
          <div className="text-xs text-gray-500 mt-2">
            <div>Computed in {waicInfo.computeTimeMs}ms</div>
            <div className="mt-1">
              * = best | BIC for structure selection, WAIC for prediction | Per-observation values
              shown
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!waicInfo && routeInfo && (
        <div className="text-sm text-gray-600">
          <div className="animate-pulse">Comparing component options...</div>
        </div>
      )}

      {/* Routing reasoning */}
      {routeInfo?.reasoning && routeInfo.reasoning.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Model Selection Reasoning</h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {routeInfo.reasoning.map((reason, idx) => (
              <li key={idx} className="flex items-start">
                <span className="text-gray-400 mr-2">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
