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

// Helper to create a stable key from posteriors for change detection
const getPosteriorKey = (posteriors: any): string => {
  if (!posteriors) return 'null';
  
  if (posteriors instanceof Map) {
    const keys = Array.from(posteriors.keys()).sort();
    return `map:${keys.join(',')}:${posteriors.size}`;
  }
  
  const keys = Object.keys(posteriors).sort();
  return `obj:${keys.join(',')}:${keys.length}`;
};

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
  
  // Track posterior changes more reliably
  const previousPosteriorKeyRef = useRef<string>('');
  const debounceTimerRef = useRef<number | null>(null);
  
  const generatePlotData = useCallback(async (currentGenerationId: number) => {
    console.log('🟢 [Plot Generation] Starting', { generationId: currentGenerationId });
    
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
      
      console.log(`🟢 [Plot Generation] Processing ${entries.length} variants`);
      
      for (const [variantId, posterior] of entries) {
        // Check if this generation was cancelled
        if (currentGenerationId !== generationIdRef.current) {
          console.log('Generation cancelled', currentGenerationId);
          return;
        }
        
        const variantName = variantId.charAt(0).toUpperCase() + variantId.slice(1);
        
        // Generate samples with proper PosteriorProxy handling
        let samples: number[];
        
        try {
          if (posterior instanceof PosteriorProxy) {
            // PosteriorProxy path - sample() returns Promise<number[]>
            console.log(`🔵 [Sampling] Using PosteriorProxy for ${variantId}`);
            samples = await posterior.sample(1000);
            
          } else if (posterior && typeof posterior.sample === 'function') {
            // Check if it's async by testing the return value
            const testResult = posterior.sample(1);
            
            if (testResult instanceof Promise) {
              // Async posterior (but not PosteriorProxy)
              console.log(`🔵 [Sampling] Using async posterior for ${variantId}`);
              samples = await testResult; // Use the test result
              if (samples.length < 1000) {
                // Need more samples
                const moreSamples = await posterior.sample(999);
                samples = [...samples, ...moreSamples];
              }
            } else if (Array.isArray(testResult)) {
              // Sync posterior that returns array
              console.log(`🔵 [Sampling] Using sync array posterior for ${variantId}`);
              samples = posterior.sample(1000);
            } else {
              // Legacy sync posterior returning single values
              console.warn(`⚠️ [Sampling] Legacy single-value posterior for ${variantId}`);
              samples = [];
              for (let i = 0; i < 1000; i++) {
                const value = posterior.sample();
                samples.push(Array.isArray(value) ? value[0] : value);
              }
            }
          } else {
            throw new Error(`Invalid posterior type for ${variantId}`);
          }
          
          // Validate and clean samples
          if (!Array.isArray(samples)) {
            throw new Error(`Expected array of samples, got ${typeof samples}`);
          }
          
          samples = samples.filter(s => typeof s === 'number' && !isNaN(s) && isFinite(s));
          
          if (samples.length === 0) {
            throw new Error('No valid samples generated');
          }
          
          console.log(`✅ [Sampling] Generated ${samples.length} samples for ${variantId}`);
          
        } catch (samplingError: any) {
          console.error(`❌ [Sampling] Error for ${variantId}:`, samplingError);
          throw new Error(`Failed to sample from ${variantId}: ${samplingError.message}`);
        }
        
        // Update progress
        if (currentGenerationId === generationIdRef.current) {
          const variantProgress = ((index + 1) / entries.length) * 100;
          setProgress(variantProgress);
        }
        
        // Calculate statistics
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
        
        console.log('✅ [Plot Generation] Complete, setting spec');
        setPlotSpec(spec);
        setState('ready');
      }
    } catch (err) {
      if (currentGenerationId === generationIdRef.current) {
        console.error('❌ [Plot Generation] Failed:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setState('error');
      }
    }
  }, [modelType]); // Only depend on modelType, not posteriors
  
  // Main effect with proper change detection and debouncing
  useEffect(() => {
    const currentKey = getPosteriorKey(posteriors);
    
    console.log('📍 [Effect] Posteriors check', { 
      currentKey,
      previousKey: previousPosteriorKeyRef.current,
      changed: currentKey !== previousPosteriorKeyRef.current
    });
    
    // Check if posteriors actually changed
    if (currentKey === previousPosteriorKeyRef.current) {
      return;
    }
    
    previousPosteriorKeyRef.current = currentKey;
    
    if (!posteriors) {
      setState('idle');
      return;
    }
    
    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Debounce plot generation by 100ms to batch rapid updates
    debounceTimerRef.current = setTimeout(() => {
      const newGenerationId = ++generationIdRef.current;
      console.log('📍 [Effect] Triggering generation after debounce', { generationId: newGenerationId });
      generatePlotData(newGenerationId);
    }, 100);
    
    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [posteriors, modelType, generatePlotData]);
  
  // Render based on state
  console.log('🎨 [Render]', { state, hasPlotSpec: !!plotSpec });
  
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