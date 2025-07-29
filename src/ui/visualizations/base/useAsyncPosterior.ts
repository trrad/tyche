import { useState, useEffect, useRef } from 'react';
import { Posterior } from '../../../inference/base/types';
import { PosteriorProxy } from '../../../workers/PosteriorProxy';

export interface AsyncPosteriorState {
  samples: number[] | null;
  loading: boolean;
  error: string | null;
  progress: number;
}

export interface UseAsyncPosteriorOptions {
  nSamples?: number;
  batchSize?: number;
  onProgress?: (progress: number) => void;
  debounceMs?: number;
}

/**
 * Hook for efficiently sampling from async posteriors
 * Handles PosteriorProxy, async posteriors, and legacy sync posteriors
 */
export function useAsyncPosterior(
  posterior: Posterior | PosteriorProxy | any,
  options: UseAsyncPosteriorOptions = {}
): AsyncPosteriorState {
  const {
    nSamples = 1000,
    batchSize = 1000,
    onProgress,
    debounceMs = 100
  } = options;

  const [state, setState] = useState<AsyncPosteriorState>({
    samples: null,
    loading: false,
    error: null,
    progress: 0
  });

  const previousPosteriorRef = useRef<any>(null);
  const generationIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Check if posterior actually changed
    if (posterior === previousPosteriorRef.current) {
      return;
    }

    previousPosteriorRef.current = posterior;

    if (!posterior) {
      setState({
        samples: null,
        loading: false,
        error: null,
        progress: 0
      });
      return;
    }

    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the sampling
    debounceTimerRef.current = setTimeout(() => {
      const currentGenerationId = ++generationIdRef.current;
      
      generateSamples(posterior, currentGenerationId);
    }, debounceMs);

    // Cleanup
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [posterior, nSamples, batchSize, debounceMs]);

  const generateSamples = async (
    posterior: any, 
    generationId: number
  ) => {
    setState(prev => ({
      ...prev,
      loading: true,
      error: null,
      progress: 0
    }));

    try {
      let samples: number[];

      if (posterior instanceof PosteriorProxy) {
        // PosteriorProxy - use efficient batch sampling
        samples = await posterior.sample(nSamples);
        
      } else if (posterior.sample && typeof posterior.sample === 'function') {
        // Check if it's async
        const testResult = posterior.sample(1);
        
        if (testResult instanceof Promise) {
          // Async posterior - batch if needed
          samples = [];
          const batches = Math.ceil(nSamples / batchSize);
          
          for (let i = 0; i < batches; i++) {
            if (generationId !== generationIdRef.current) return;
            
            const currentBatchSize = Math.min(batchSize, nSamples - i * batchSize);
            const batch = await posterior.sample(currentBatchSize);
            samples.push(...(Array.isArray(batch) ? batch : [batch]));
            
            const progress = ((i + 1) / batches) * 100;
            setState(prev => ({ ...prev, progress }));
            onProgress?.(progress);
          }
          
        } else if (Array.isArray(testResult)) {
          // Sync posterior returning array
          samples = posterior.sample(nSamples);
          
        } else {
          // Legacy sync posterior - minimize calls
          console.warn('⚠️ Using legacy posterior pattern');
          samples = [];
          const updateInterval = Math.max(1, Math.floor(nSamples / 20));
          
          for (let i = 0; i < nSamples; i++) {
            const value = posterior.sample(1)[0];
            samples.push(Array.isArray(value) ? value[0] : value);
            
            if (i % updateInterval === 0) {
              const progress = (i / nSamples) * 100;
              setState(prev => ({ ...prev, progress }));
              onProgress?.(progress);
            }
          }
        }
      } else {
        throw new Error('Invalid posterior object - no sample method');
      }

      // Only update if this is still the current generation
      if (generationId === generationIdRef.current) {
        setState({
          samples,
          loading: false,
          error: null,
          progress: 100
        });
        onProgress?.(100);
      }
      
    } catch (err) {
      if (generationId === generationIdRef.current) {
        console.error('Failed to generate samples:', err);
        setState({
          samples: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          progress: 0
        });
      }
    }
  };

  return state;
}

/**
 * Hook for getting cached statistics from posteriors
 * Works with both PosteriorProxy (sync) and regular posteriors
 */
export function usePosteriorStats(posterior: any) {
  const [stats, setStats] = useState<{
    mean: number[] | null;
    variance: number[] | null;
    ci95: Array<[number, number]> | null;
    ci90: Array<[number, number]> | null;
    ci80: Array<[number, number]> | null;
  }>({
    mean: null,
    variance: null,
    ci95: null,
    ci90: null,
    ci80: null
  });

  useEffect(() => {
    if (!posterior) {
      setStats({
        mean: null,
        variance: null,
        ci95: null,
        ci90: null,
        ci80: null
      });
      return;
    }

    try {
      // All these methods are sync on PosteriorProxy!
      setStats({
        mean: posterior.mean ? posterior.mean() : null,
        variance: posterior.variance ? posterior.variance() : null,
        ci95: posterior.credibleInterval ? posterior.credibleInterval(0.95) : null,
        ci90: posterior.credibleInterval ? posterior.credibleInterval(0.90) : null,
        ci80: posterior.credibleInterval ? posterior.credibleInterval(0.80) : null
      });
    } catch (err) {
      console.error('Failed to get posterior stats:', err);
    }
  }, [posterior]);

  return stats;
} 