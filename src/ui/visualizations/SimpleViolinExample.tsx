import React, { useMemo } from 'react';
import { ViolinPlot, ViolinPlotSpec, posteriorToViolin } from './ViolinPlot';
import { InferenceResult } from '../../inference/base/types';

interface SimpleViolinPlotProps {
  data: any;
  posteriors: Map<string, any> | Record<string, any>;
  modelType: string;
  width?: number;
  height?: number;
}

/**
 * Simple violin plot for inference explorer
 * Transforms posteriors into violin plot format
 */
export const SimpleViolinPlot: React.FC<SimpleViolinPlotProps> = ({
  data,
  posteriors,
  modelType,
  width = 800,
  height = 400
}) => {
  const plotSpec = useMemo((): ViolinPlotSpec => {
    // Convert posteriors to violin data
    const violins = [];
    let index = 0;
    
    // Handle both Map and Record types
    const entries = posteriors instanceof Map 
      ? Array.from(posteriors.entries())
      : Object.entries(posteriors);
    
    for (const [variantId, posterior] of entries) {
      const variantName = variantId.charAt(0).toUpperCase() + variantId.slice(1);
      const violin = posteriorToViolin(variantId, variantName, posterior, 1000, index);
      violins.push(violin);
      index++;
    }
    
    // Determine parameter type and labels
    let yLabel = 'Value';
    let transform: 'linear' | 'log' | 'percentage' = 'linear';
    
    if (modelType.includes('beta') || modelType.includes('binomial')) {
      yLabel = 'Conversion Rate';
      transform = 'percentage';
    } else if (modelType.includes('revenue') || modelType.includes('compound')) {
      yLabel = 'Revenue per User';
    } else if (modelType.includes('gamma') || modelType.includes('lognormal')) {
      yLabel = 'Value';
    }
    
    return {
      title: `${yLabel} Distribution`,
      layout: 'grouped',
      violins,
      axes: {
        x: { label: 'Variant', type: 'categorical' },
        y: { 
          label: yLabel,
          transform
        }
      },
      visual: {
        violinWidth: 0.7,
        showBoxPlot: true,
        showDataPoints: false,
        showMean: true,
        bandwidthMethod: 'scott',
        kernelType: 'gaussian'
      }
    };
  }, [posteriors, modelType]);
  
  return (
    <ViolinPlot 
      spec={plotSpec} 
      width={width} 
      height={height}
      responsive={true}
    />
  );
}; 