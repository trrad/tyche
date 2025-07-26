// src/visualization/PosteriorSummary.tsx
import React, { useState, useEffect } from 'react';
import { Posterior } from '../../inference/base/types';

interface PosteriorSummaryProps {
  posterior: Posterior | any; // Allow compound posteriors
  modelType?: string; // Optional model type for context
}

export const PosteriorSummary: React.FC<PosteriorSummaryProps> = ({ posterior, modelType }) => {
  const [samples, setSamples] = useState<number[][]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Generate samples for visualization
    const generateSamples = async () => {
      const newSamples = [];
      const numSamples = 100;
      
      for (let i = 0; i < numSamples; i++) {
        newSamples.push(posterior.sample());
      }
      
      setSamples(newSamples);
      setLoading(false);
    };
    
    generateSamples();
  }, [posterior]);

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

  if (loading) {
    return <div className="text-gray-600">Computing posterior statistics...</div>;
  }

  if (isCompoundPosterior) {
    // Compound posterior display
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

  // Regular posterior display
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
                {credibleIntervals.length > 1 ? `Parameter ${idx + 1}:` : 'CI:'}
              </span>
              <span className="font-mono">{formatInterval(ci)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Mixture components if available */}
      {hasMixtureComponents && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Mixture Components
            {modelType && modelType.includes('lognormal') && ' (LogNormal scale)'}
          </h4>
          <div className="space-y-2">
            {(posterior as any).getComponents().map((comp: any, idx: number) => (
              <div key={`comp-${idx}`} className="bg-gray-50 p-2 rounded text-sm">
                <div className="flex justify-between">
                  <span>Component {idx + 1}:</span>
                  <span className="font-mono">
                    μ={formatValue(comp.mean)}, σ={formatValue(Math.sqrt(comp.variance))}, 
                    w={formatValue(comp.weight)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample visualization */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Sample Distribution</h4>
        <div className="h-16 bg-gray-50 rounded p-2 relative">
          {samples.slice(0, 50).map((sample, idx) => {
            const value = sample[0];
            const min = Math.min(...samples.map(s => s[0]));
            const max = Math.max(...samples.map(s => s[0]));
            const position = ((value - min) / (max - min)) * 100;
            
            return (
              <div
                key={idx}
                className="absolute w-1 h-1 bg-blue-500 rounded-full opacity-50"
                style={{
                  left: `${position}%`,
                  top: `${Math.random() * 80 + 10}%`
                }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatValue(Math.min(...samples.map(s => s[0])))}</span>
          <span>{formatValue(Math.max(...samples.map(s => s[0])))}</span>
        </div>
      </div>
    </div>
  );
};