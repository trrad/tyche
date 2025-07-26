// src/visualization/DiagnosticsPanel.tsx
import React from 'react';

interface DiagnosticsPanelProps {
  diagnostics: {
    converged: boolean;
    iterations: number;
    runtime?: number;
    modelType?: string;
    finalELBO?: number;
    finalLogLikelihood?: number;
    elboHistory?: number[];
    [key: string]: any;
  };
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({ diagnostics }) => {
  const formatValue = (value: any): string => {
    if (typeof value === 'boolean') return value ? '✓' : '✗';
    if (typeof value === 'number') {
      if (value < 0.001) return value.toExponential(2);
      if (value > 1000) return value.toExponential(2);
      return value.toFixed(3);
    }
    return String(value);
  };

  // Determine convergence status color
  const getStatusColor = (converged: boolean) => {
    return converged ? 'text-green-600' : 'text-amber-600';
  };

  // Key diagnostics to always show
  const primaryDiagnostics = [
    { key: 'converged', label: 'Converged', important: true },
    { key: 'iterations', label: 'Iterations' },
    { key: 'runtime', label: 'Runtime (ms)' },
    { key: 'modelType', label: 'Model Type' }
  ];

  // Optional diagnostics
  const optionalDiagnostics = [
    { key: 'finalELBO', label: 'Final ELBO' },
    { key: 'finalLogLikelihood', label: 'Final Log-Likelihood' }
  ];

  return (
    <div className="space-y-4">
      {/* Primary diagnostics */}
      <div className="grid grid-cols-2 gap-4">
        {primaryDiagnostics.map(({ key, label, important }) => {
          if (!(key in diagnostics)) return null;
          
          return (
            <div key={key} className="flex justify-between">
              <span className="text-gray-600">{label}:</span>
              <span className={`font-mono ${important ? getStatusColor(diagnostics[key]) : ''}`}>
                {formatValue(diagnostics[key])}
              </span>
            </div>
          );
        })}
      </div>

      {/* Optional diagnostics */}
      <div className="border-t pt-4">
        <div className="grid grid-cols-2 gap-4">
          {optionalDiagnostics.map(({ key, label }) => {
            if (!(key in diagnostics)) return null;
            
            return (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600 text-sm">{label}:</span>
                <span className="font-mono text-sm">
                  {formatValue(diagnostics[key])}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Convergence history if available */}
      {diagnostics.elboHistory && diagnostics.elboHistory.length > 1 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Convergence History</h4>
          <div className="h-20 bg-gray-50 rounded p-2">
            <svg 
              viewBox={`0 0 ${diagnostics.elboHistory.length} 100`} 
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <polyline
                points={diagnostics.elboHistory
                  .map((v, i) => {
                    const normalized = (v - Math.min(...diagnostics.elboHistory)) / 
                      (Math.max(...diagnostics.elboHistory) - Math.min(...diagnostics.elboHistory));
                    return `${i},${100 - normalized * 100}`;
                  })
                  .join(' ')}
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Additional metadata */}
      {Object.keys(diagnostics).length > 6 && (
        <details className="border-t pt-4">
          <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
            Show all diagnostics
          </summary>
          <div className="mt-2 space-y-1 text-sm">
            {Object.entries(diagnostics)
              .filter(([key]) => !['elboHistory'].includes(key))
              .map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-600">{key}:</span>
                  <span className="font-mono">{formatValue(value)}</span>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
};