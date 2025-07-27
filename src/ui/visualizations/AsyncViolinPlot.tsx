import React, { useEffect, useState, useTransition } from 'react';
import { ViolinPlot, ViolinPlotSpec, ViolinData } from './ViolinPlot';
import { getVariantColor } from './base/colors';
import { calculateKDE, calculateViolinStats } from './utils/statistics';
import { PosteriorProxy } from '../../workers/PosteriorProxy';

interface AsyncViolinPlotProps {
  data: any;
  posteriors: Map<string, any> | Record<string, any>;
  modelType: string;
  width?: number;
  height?: number;
}

/**
 * Async-compatible violin plot that works with PosteriorProxy
 */
export const AsyncViolinPlot: React.FC<AsyncViolinPlotProps> = ({
  data,
  posteriors,
  modelType,
  width = 800,
  height = 400
}) => {
  const [plotSpec, setPlotSpec] = useState<ViolinPlotSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();
  
  useEffect(() => {
    let cancelled = false;
    
    const generatePlotData = async () => {
      setLoading(true);
      setProgress(0);
      
      try {
        const violins: ViolinData[] = [];
        let index = 0;
        
        // Handle both Map and Record types, plus single posterior case
        let entries: [string, any][];
        
        if (posteriors instanceof Map) {
          entries = Array.from(posteriors.entries());
        } else if (typeof posteriors === 'object' && posteriors !== null) {
          // Check if this is a single posterior case (has 'result' key)
          if ('result' in posteriors) {
            entries = [['Posterior', posteriors.result]];
          } else {
            entries = Object.entries(posteriors);
          }
        } else {
          entries = [];
        }
        
        // Process each posterior
        for (const [variantId, posterior] of entries) {
          if (cancelled) break;
          
          const variantName = variantId.charAt(0).toUpperCase() + variantId.slice(1);
          
          // Generate samples directly from posterior
          let samples: number[];
          if (posterior instanceof PosteriorProxy) {
            // Async proxy - use batching
            samples = await posterior.sample(1000);
          } else {
            // Sync posterior - generate all at once
            samples = posterior.sample(1000);
          }
          
          // Update progress
          if (!cancelled) {
            const variantProgress = (index + 1) / entries.length;
            setProgress(variantProgress * 100);
          }
          
          // Calculate density
          const densityPoints = calculateKDE(samples, 50);
          
          // Calculate statistics
          const statistics = calculateViolinStats(samples);
          
          violins.push({
            variantId,
            variantName,
            densityPoints,
            statistics,
            visual: {
              color: getVariantColor(variantId, index),
              isBaseline: variantId === 'control' || variantId === 'baseline'
            }
          });
          
          index++;
        }
        
        if (!cancelled) {
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
          
          const finalSpec: ViolinPlotSpec = {
            title: `${yLabel} Distribution`,
            layout: 'grouped' as const,
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
          
          console.log('AsyncViolinPlot: Setting plot spec:', finalSpec);
          startTransition(() => {
            setPlotSpec(finalSpec);
            setLoading(false);
          });
        }
      } catch (error) {
        console.error('Failed to generate violin plot:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    generatePlotData();
    
    return () => {
      cancelled = true;
    };
  }, [posteriors, modelType]);
  
  console.log('AsyncViolinPlot render: loading=', loading, 'plotSpec=', plotSpec, 'isPending=', isPending);
  
  if (loading || isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-gray-600 mb-2">Generating violin plot...</div>
        <div className="w-64 bg-gray-200 rounded-full h-2">
          <div 
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }
  
  if (!plotSpec) {
    return <div className="text-red-600">Failed to generate plot</div>;
  }
  
  return (
    <ViolinPlot 
      spec={plotSpec} 
      width={width} 
      height={height}
      responsive={true}
    />
  );
}; 