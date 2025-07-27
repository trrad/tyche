// src/ui/visualizations/unified/AsyncPPCVisualizer.tsx
import React from 'react';
import { UnifiedDistributionViz } from './UnifiedDistributionViz';
import { Distribution } from './types';
import { Posterior } from '../../../inference/base/types';
import { PosteriorProxy } from '../../../workers/PosteriorProxy';

interface AsyncPPCVisualizerProps {
  observedData: number[];
  posterior: Posterior | PosteriorProxy;
  nSamples?: number;
  nCISamples?: number;
  showCI?: boolean;
  ciLevels?: number[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  formatValue?: (v: number) => string;
  xLabel?: string;
  colors?: {
    observed: string;
    predicted: string;
    ci80: string;
    ci95: string;
  };
}

export const AsyncPPCVisualizer: React.FC<AsyncPPCVisualizerProps> = ({
  observedData,
  posterior,
  nSamples = 5000,
  showCI = true,
  ciLevels = [0.8, 0.95],
  width = 800,
  height = 400,
  margin = { top: 40, right: 40, bottom: 60, left: 60 },
  formatValue = (v: number) => v.toFixed(1),
  xLabel = 'Value',
  colors = {
    observed: '#FF6B6B',
    predicted: '#9B59B6',
    ci80: '#9B59B6',
    ci95: '#9B59B6'
  }
}) => {
  return (
    <UnifiedDistributionViz
      distributions={[
        {
          id: 'observed',
          label: 'Observed Data',
          samples: observedData,
          color: colors.observed,
          metadata: { isObserved: true }
        } as Distribution,
        {
          id: 'predictive',
          label: 'Posterior Predictive',
          posterior: posterior,
          color: colors.predicted
        }
      ]}
      display={{
        mode: 'density',
        showCI: showCI,
        ciLevels: ciLevels,
        opacity: 0.7
      }}
      width={width}
      height={height}
      margin={margin}
      formatValue={formatValue}
      xLabel={xLabel}
      title="Posterior Predictive Check"
      subtitle="Model fit assessment"
    />
  );
}; 