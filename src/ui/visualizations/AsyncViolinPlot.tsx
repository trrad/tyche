import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ViolinPlot, ViolinPlotSpec, ViolinData } from './ViolinPlot';
import { getVariantColor } from './base/colors';
import { calculateKDE, calculateViolinStats } from './utils/statistics';
import { PosteriorProxy } from '../../workers/PosteriorProxy';

interface AsyncViolinPlotProps {
  data: any;
  posteriors: Map<string, any> | Record<string, any> | null;
  modelType: string;
  width?: number;
  height?: number;
}

type PlotState = 'idle' | 'loading' | 'ready' | 'error';

export const AsyncViolinPlot: React.FC<AsyncViolinPlotProps> = ({
  data,
  posteriors,
  modelType,
  width = 800,
  height = 400
}) => {
  const [state, setState] = useState<PlotState>('idle');
  const [plotSpec, setPlotSpec] = useState<ViolinPlotSpec | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Use a generation ID to handle rapid updates
  const generationIdRef = useRef(0);
  
  // Store previous posteriors to detect changes
  const previousPosteriorsRef = useRef<any>(null);
  
  const generatePlotData = useCallback(async (currentGenerationId: number) => {
    console.log('🟢 [I] Starting plot generation', { generationId: currentGenerationId });
    
    if (!posteriors || Object.keys(posteriors).length === 0) {
      console.log('No posteriors to plot');
      setState('idle');
      return;
    }
    
    setState('loading');
    setProgress(0);
    setError(null);
    
    try {
      const violins: ViolinData[] = [];
      let index = 0;
      
      // Handle both Map and Record types
      const entries = posteriors instanceof Map 
        ? Array.from(posteriors.entries())
        : Object.entries(posteriors);
      
      for (const [variantId, posterior] of entries) {
        // Check if this generation was cancelled
        if (currentGenerationId !== generationIdRef.current) {
          console.log('Generation cancelled', currentGenerationId);
          return;
        }
        
        const variantName = variantId.charAt(0).toUpperCase() + variantId.slice(1);
        
        // Direct sampling from PosteriorProxy
        let samples: number[];
        
        if (posterior instanceof PosteriorProxy || posterior.sample) {
          // For async posteriors, use the sample method
          const sampleResult = await posterior.sample(1000);
          // Handle both array return and single value return
          samples = Array.isArray(sampleResult) ? sampleResult : Array(1000).fill(0).map(() => sampleResult);
        } else {
          // Fallback for any legacy sync posteriors
          samples = [];
          for (let i = 0; i < 1000; i++) {
            samples.push(posterior.sample()[0]);
          }
        }
        
        // Update progress
        if (currentGenerationId === generationIdRef.current) {
          const variantProgress = ((index + 1) / entries.length) * 100;
          setProgress(variantProgress);
        }
        
        console.log('🟢 [II] Generated samples for', variantId);
        
        const densityPoints = calculateKDE(samples, 50);
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
      
      // Only update if this is still the current generation
      if (currentGenerationId === generationIdRef.current) {
        let yLabel = 'Value';
        let transform: 'linear' | 'log' | 'percentage' = 'linear';
        
        if (modelType.includes('beta') || modelType.includes('binomial')) {
          yLabel = 'Conversion Rate';
          transform = 'percentage';
        } else if (modelType.includes('revenue') || modelType.includes('compound')) {
          yLabel = 'Revenue per User';
        }
        
        const spec: ViolinPlotSpec = {
          title: `${yLabel} Distribution`,
          layout: 'grouped',
          violins,
          axes: {
            x: { label: 'Variant', type: 'categorical' },
            y: { label: yLabel, transform }
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
        
        console.log('🟢 [III] Setting plot spec');
        setPlotSpec(spec);
        setState('ready');
      }
    } catch (err) {
      if (currentGenerationId === generationIdRef.current) {
        console.error('Plot generation failed:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setState('error');
      }
    }
  }, [posteriors, modelType]);
  
  // Main effect - trigger generation when posteriors change
  useEffect(() => {
    console.log('📍 Posteriors effect running', { 
      hasPosteriors: !!posteriors,
      posteriorsChanged: posteriors !== previousPosteriorsRef.current 
    });
    
    // Check if posteriors actually changed
    if (posteriors === previousPosteriorsRef.current) {
      return;
    }
    
    previousPosteriorsRef.current = posteriors;
    
    if (!posteriors) {
      setState('idle');
      return;
    }
    
    // Increment generation ID to cancel any in-progress generations
    const newGenerationId = ++generationIdRef.current;
    
    // Start generation immediately
    // Using Promise.resolve() to ensure it runs after the current execution
    Promise.resolve().then(() => {
      generatePlotData(newGenerationId);
    });
  }, [posteriors, modelType, generatePlotData]);
  
  // Render based on state
  console.log('AsyncViolinPlot render:', { state, hasPlotSpec: !!plotSpec });
  
  switch (state) {
    case 'idle':
      return (
        <div className="flex items-center justify-center h-64 text-gray-500">
          Waiting for data...
        </div>
      );
      
    case 'loading':
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-gray-600 mb-2">Generating violin plot...</div>
          <div className="w-64 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {Math.round(progress)}% complete
          </div>
        </div>
      );
      
    case 'error':
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <div className="text-red-600 mb-2">Failed to generate plot</div>
          <div className="text-sm text-gray-600">{error}</div>
          <button
            onClick={() => {
              const newGenerationId = ++generationIdRef.current;
              generatePlotData(newGenerationId);
            }}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      );
      
    case 'ready':
      return plotSpec ? (
        <ViolinPlot 
          spec={plotSpec} 
          width={width} 
          height={height}
          responsive={true}
        />
      ) : (
        <div className="text-red-600">Invalid state: ready but no spec</div>
      );
  }
}; 