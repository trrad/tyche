import React, { useState, useEffect } from 'react';
import { Posterior } from '../../inference/base/types';
import { PosteriorProxy, CompoundPosteriorProxy } from '../../workers/PosteriorProxy';
import type { CompoundPosterior } from '../../inference/base/types';
import { MixtureComponentViz } from './MixtureComponentViz';
import { getModelName } from '../constants/modelDescriptions';

interface AsyncPosteriorSummaryProps {
  posterior: Posterior | PosteriorProxy | CompoundPosteriorProxy | any;
  modelType?: string;
}

// Helper to check if posterior is compound
function isCompoundPosterior(posterior: any): posterior is CompoundPosterior {
  return (
    posterior &&
    typeof posterior.getDecomposition === 'function' &&
    typeof posterior.getSeverityComponents === 'function'
  );
}

// Helper to check if object is a proxy
function isPosteriorProxy(posterior: any): boolean {
  return (
    posterior &&
    (posterior.constructor.name === 'PosteriorProxy' ||
      posterior.constructor.name === 'CompoundPosteriorProxy' ||
      '__isCompoundProxy' in posterior)
  );
}

export const AsyncPosteriorSummary: React.FC<AsyncPosteriorSummaryProps> = ({
  posterior,
  modelType,
}) => {
  const [mixtureComponents, setMixtureComponents] = useState<Array<{
    mean: number;
    variance: number;
    weight: number;
  }> | null>(null);
  const [severityComponents, setSeverityComponents] = useState<Array<{
    mean: number;
    variance: number;
    weight: number;
  }> | null>(null);

  useEffect(() => {
    if (!posterior) return;

    const loadComponents = async () => {
      // For compound posteriors
      if (isCompoundPosterior(posterior)) {
        // Try sync first (for non-proxy)
        if (posterior.getSeverityComponents && !isPosteriorProxy(posterior)) {
          setSeverityComponents(posterior.getSeverityComponents());
        }
        // Try async for proxy
        else if ('getSeverityComponents' in posterior) {
          const comps = await (posterior as any).getSeverityComponents();
          setSeverityComponents(comps);
        }
        // Note: In new architecture, severity components are accessed via getSeverityComponents()
      }
      // For regular mixture posteriors
      else if ('getComponents' in posterior) {
        if (isPosteriorProxy(posterior)) {
          const comps = await (posterior as any).getComponents();
          setMixtureComponents(comps);
        } else {
          setMixtureComponents((posterior as any).getComponents());
        }
      }
    };

    loadComponents();
  }, [posterior]);

  if (!posterior) return null;

  // Format helper functions
  const formatValue = (value: number): string => {
    if (Math.abs(value) < 0.01) return value.toExponential(2);
    if (Math.abs(value) > 1000) return value.toExponential(2);
    return value.toFixed(4);
  };

  const formatInterval = (ci: [number, number]): string => {
    return `[${formatValue(ci[0])}, ${formatValue(ci[1])}]`;
  };

  // Check if this is a compound posterior
  if (isCompoundPosterior(posterior)) {
    const decomposition = posterior.getDecomposition();
    return (
      <div className="space-y-6">
        {/* Frequency (Conversion) Component */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Frequency Component (Conversion)</h4>
          <div className="bg-gray-50 p-4 rounded space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-600">Mean:</span>
                <span className="ml-2 font-mono">
                  {formatValue(
                    decomposition.frequency.mean ? decomposition.frequency.mean()[0] : 'Loading...'
                  )}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-600">95% CI:</span>
                <span className="ml-2 font-mono text-sm">
                  {decomposition.frequency.credibleInterval
                    ? formatInterval(decomposition.frequency.credibleInterval(0.95)[0])
                    : 'Loading...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Severity (Value) Component */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">
            Severity Component (Value | Converted)
          </h4>
          <div className="bg-gray-50 p-4 rounded space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-gray-600">Mean:</span>
                <span className="ml-2 font-mono">
                  $
                  {decomposition.severity.mean
                    ? decomposition.severity.mean()[0].toFixed(2)
                    : 'Loading...'}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-600">95% CI:</span>
                <span className="ml-2 font-mono text-sm">
                  {decomposition.severity.credibleInterval
                    ? formatInterval(decomposition.severity.credibleInterval(0.95)[0])
                    : 'Loading...'}
                </span>
              </div>
            </div>

            {/* Show mixture components if available - use state variable */}
            {severityComponents && severityComponents.length > 1 && (
              <div className="mt-4">
                <MixtureComponentViz
                  components={severityComponents}
                  title="Revenue Segments"
                  formatValue={(v) => `$${v.toFixed(2)}`}
                />
              </div>
            )}
          </div>
        </div>

        {/* Combined Metrics */}
        <div>
          <h4 className="font-semibold text-gray-700 mb-2">Combined Metrics</h4>
          <div className="bg-blue-50 p-4 rounded">
            <div>
              <span className="text-sm text-gray-600">Expected Revenue per User:</span>
              <span className="ml-2 font-mono font-semibold">
                ${(decomposition.frequency.mean()[0] * decomposition.severity.mean()[0]).toFixed(2)}
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

  return (
    <div className="space-y-4">
      {/* Show mixture components if available */}
      {mixtureComponents && mixtureComponents.length > 1 && (
        <MixtureComponentViz
          components={mixtureComponents}
          title="Mixture Components"
          formatValue={modelType?.includes('lognormal') ? (v) => `$${v.toFixed(2)}` : undefined}
        />
      )}

      {/* Main statistics */}
      <div className="grid grid-cols-2 gap-4">
        {means.map((mean: number, idx: number) => (
          <div key={`mean-${idx}`} className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">
              {mixtureComponents && mixtureComponents.length > 1
                ? 'Overall Mean'
                : means.length > 1
                  ? `Parameter ${idx + 1}`
                  : 'Mean'}
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
        <div className="text-xs text-gray-500 border-t pt-2">Model: {getModelName(modelType)}</div>
      )}
    </div>
  );
};
