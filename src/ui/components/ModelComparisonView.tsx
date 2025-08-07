import React from 'react';
import { getModelName } from '../constants/modelDescriptions';

interface ModelComparisonProps {
  waicComparison?: Array<{
    name: string;
    waic: number;
    deltaWAIC: number;
    weight: number;
  }>;
}

export const ModelComparisonView: React.FC<ModelComparisonProps> = ({ waicComparison }) => {
  if (!waicComparison || waicComparison.length === 0) {
    return null;
  }

  return (
    <div className="model-comparison">
      <h3 className="text-lg font-semibold mb-4">Alternative Models</h3>

      <div className="space-y-3">
        {waicComparison.map((model, i) => (
          <div
            key={i}
            className={`p-3 rounded border ${
              model.deltaWAIC === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-medium">{model.name}</h4>
                <p className="text-sm text-gray-600">
                  WAIC: {model.waic.toFixed(1)}
                  {model.deltaWAIC > 0 && (
                    <span className="ml-2 text-red-600">(+{model.deltaWAIC.toFixed(1)})</span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-700">
                  {(model.weight * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">weight</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-gray-50 rounded text-sm text-gray-600">
        <p className="font-semibold mb-1">How to interpret:</p>
        <ul className="space-y-1">
          <li>
            • <strong>Weight</strong>: Probability this is the best model
          </li>
          <li>
            • <strong>ΔWAIC &lt; 4</strong>: Models are practically equivalent
          </li>
          <li>
            • <strong>ΔWAIC &gt; 10</strong>: Strong evidence against the model
          </li>
        </ul>
      </div>
    </div>
  );
};
