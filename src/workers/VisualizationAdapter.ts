import { PosteriorProxy } from './PosteriorProxy';
import { useState, useEffect } from 'react';

/**
 * Adapter to help visualizations work with both sync posteriors and async proxies
 * Provides utilities for gradual migration
 */
export class VisualizationAdapter {
  /**
   * Check if a posterior is a proxy (needs async handling)
   */
  static isProxy(posterior: any): posterior is PosteriorProxy {
    return posterior instanceof PosteriorProxy;
  }
  
  /**
   * Generate samples with progress callback
   * Works with both sync and async posteriors
   */
  static async generateSamples(
    posterior: any, 
    n: number,
    onProgress?: (progress: number) => void
  ): Promise<number[]> {
    if (this.isProxy(posterior)) {
      // Async path with batching
      const samples: number[] = [];
      const batchSize = 10000;
      
      for (let i = 0; i < n; i += batchSize) {
        const currentBatch = Math.min(batchSize, n - i);
        const batch = await posterior.sample(currentBatch);
        samples.push(...batch);
        
        if (onProgress) {
          onProgress((i + currentBatch) / n * 100);
        }
      }
      
      return samples;
    } else {
      // Sync path - existing behavior
      const samples: number[] = [];
      const updateInterval = Math.max(1, Math.floor(n / 20)); // Update every 5%
      
      // For sync posteriors, generate all samples at once
      const allSamples = posterior.sample(n);
      for (let i = 0; i < allSamples.length; i++) {
        samples.push(allSamples[i]);
        
        if (onProgress && i % updateInterval === 0) {
          onProgress(i / n * 100);
        }
      }
      
      if (onProgress) onProgress(100);
      return samples;
    }
  }
  
  /**
   * Create a sync-compatible wrapper for legacy code
   * WARNING: This will block on first sample() call to pre-generate samples
   */
  static createSyncWrapper(proxy: PosteriorProxy, preSampleCount: number = 1000): any {
    let cachedSamples: number[] | null = null;
    let sampleIndex = 0;
    
    return {
      mean: () => proxy.mean(),
      variance: () => proxy.variance(),
      credibleInterval: (level: number) => proxy.credibleInterval(level),
      
      // This will block on first call!
      sample: () => {
        if (!cachedSamples) {
          console.warn('⚠️ Sync wrapper blocking to generate samples. Consider migrating to async.');
          // This is a hack - we can't truly make async sync
          // In practice, you'd want to pre-load this
          throw new Error('Sync wrapper requires pre-loading. Use VisualizationAdapter.preloadSyncWrapper()');
        }
        
        const sample = cachedSamples[sampleIndex % cachedSamples.length];
        sampleIndex++;
        return [sample];
      },
      
      // Helper to pre-load samples
      _preload: async () => {
        cachedSamples = await proxy.sample(preSampleCount);
      }
    };
  }
  
  /**
   * Pre-load a sync wrapper with samples
   */
  static async preloadSyncWrapper(proxy: PosteriorProxy, preSampleCount: number = 1000): Promise<any> {
    const wrapper = this.createSyncWrapper(proxy, preSampleCount);
    await wrapper._preload();
    return wrapper;
  }
}

/**
 * React hook for async posterior sampling with loading state
 */
export function usePosteriorSamples(
  posterior: any,
  n: number,
  deps: any[] = []
) {
  const [samples, setSamples] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    let cancelled = false;
    
    const generateSamples = async () => {
      setLoading(true);
      setProgress(0);
      
      try {
        const newSamples = await VisualizationAdapter.generateSamples(
          posterior,
          n,
          (p) => !cancelled && setProgress(p)
        );
        
        if (!cancelled) {
          setSamples(newSamples);
        }
      } catch (error) {
        console.error('Failed to generate samples:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    generateSamples();
    
    return () => {
      cancelled = true;
    };
  }, [posterior, n, ...deps]);
  
  return { samples, loading, progress };
} 