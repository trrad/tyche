import React from 'react';
import { Posterior } from '../../inference/base/types';
import { PosteriorProxy, CompoundPosteriorProxy } from '../../workers/PosteriorProxy';

interface AsyncPosteriorSummaryProps {
  posterior: Posterior | PosteriorProxy | CompoundPosteriorProxy | any;
  modelType?: string;
}

export const AsyncPosteriorSummary: React.FC<AsyncPosteriorSummaryProps> = ({ 
  posterior, 
  modelType 
}) => {
  // Note: PosteriorProxy already has cached statistics, no need to sample!
  
  const formatValue = (value: number): string => {
    if (Math.abs(value) < 0.001) return value.toExponential(2);
    if (Math.abs(value) > 1000) return value.toExponential(2);
    if (value > 0.01 && value < 1) return (value * 100).toFixed(1) + '%';
    return value.toFixed(3);
  };

  const formatInterval = (interval: [number, number]): string => {
    return `[${formatValue(interval[0])}, ${formatValue(interval[1])}]`;
  };

  // Check if this is a compound posterior
  const isCompoundPosterior = 'frequency' in posterior && 'severity' in posterior;

  if (isCompoundPosterior) {
    // Compound posterior display - all sync methods!
    return (
      <div className="space-y-6">
        {/* Frequency (Conversion) Component */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Frequency Component (Conversion)</h4>
          <div className="bg-gray-50 p-4 rounded space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-600">Mean:</span>
                <span className="ml-2 font-mono">{formatValue(posterior.frequency.mean()[0])}</span>
              </div>
              <div>
                <span className="text-sm text-gray-600">95% CI:</span>
                <span className="ml-2 font-mono text-sm">
                  {formatInterval(posterior.frequency.credibleInterval(0.95)[0])}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Severity (Value) Component */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Severity Component (Value | Converted)</h4>
          <div className="bg-gray-50 p-4 rounded space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-600">Mean:</span>
                <span className="ml-2 font-mono">${posterior.severity.mean()[0].toFixed(2)}</span>
              </div>
              <div>
                <span className="text-sm text-gray-600">95% CI:</span>
                <span className="ml-2 font-mono text-sm">
                  {formatInterval(posterior.severity.credibleInterval(0.95)[0])}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Combined Metrics */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Combined Metrics</h4>
          <div className="bg-blue-50 p-4 rounded">
            <div>
              <span className="text-sm text-gray-600">Expected Revenue per User:</span>
              <span className="ml-2 font-mono font-semibold">
                ${posterior.expectedValuePerUser ? posterior.expectedValuePerUser().toFixed(2) : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Regular posterior display - all sync with PosteriorProxy!
  const means = posterior.mean();
  const variances = posterior.variance ? posterior.variance() : [];
  const credibleIntervals = posterior.credibleInterval(0.95);

  // Check if this is a mixture posterior
  const hasMixtureComponents = 'getComponents' in posterior;

  return (
    <div className="space-y-4">
      {/* Main statistics */}
      <div className="grid grid-cols-2 gap-4">
        {means.map((mean: number, idx: number) => (
          <div key={`mean-${idx}`} className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">
              {means.length > 1 ? `Parameter ${idx + 1}` : 'Mean'}
            </div>
            <div className="font-mono text-lg">{formatValue(mean)}</div>
            {variances[idx] !== undefined && (
              <div className="text-xs text-gray-500">
                σ = {formatValue(Math.sqrt(variances[idx]))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Credible intervals */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">95% Credible Intervals</h4>
        <div className="space-y-1">
          {credibleIntervals.map((ci: [number, number], idx: number) => (
            <div key={`ci-${idx}`} className="flex justify-between text-sm">
              <span className="text-gray-600">
                {credibleIntervals.length > 1 ? `Parameter ${idx + 1}` : 'CI'}
              </span>
              <span className="font-mono">{formatInterval(ci)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Model type info */}
      {modelType && (
        <div className="text-xs text-gray-500 border-t pt-2">
          Model: {modelType}
        </div>
      )}
    </div>
  );
}; 