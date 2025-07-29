import { useState, useEffect, useCallback, useRef } from 'react';
import type { ModelType } from '../inference/InferenceEngine';
import type { DataInput, CompoundDataInput, FitOptions, InferenceResult, FitProgress } from '../inference/base/types';
import { PosteriorProxy, CompoundPosteriorProxy, PosteriorSummary } from '../workers/PosteriorProxy';

// Import worker using Vite's worker syntax
// @ts-ignore - Vite worker import
import InferenceWorker from '../workers/inference.worker.ts?worker';

export function useInferenceWorker() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<FitProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const posteriorProxies = useRef<Set<PosteriorProxy>>(new Set());

  // Initialize worker
  useEffect(() => {
    try {
      // Use Vite's worker import for better development compatibility
      workerRef.current = new InferenceWorker();
      console.log('✅ Worker initialized successfully');
    } catch (err) {
      console.warn('❌ Worker initialization failed, will use main thread fallback:', err);
    }

    return () => {
      // Clean up all posteriors
      const cleanup = async () => {
        const disposePromises = Array.from(posteriorProxies.current).map(proxy => 
          proxy.dispose().catch(err => console.warn('Error disposing proxy:', err))
        );
        await Promise.all(disposePromises);
        posteriorProxies.current.clear();
        
        // Clear all in worker and terminate
        if (workerRef.current) {
          workerRef.current.postMessage({ id: 'cleanup', type: 'clearAll' });
          // Give worker time to clean up
          setTimeout(() => {
            workerRef.current?.terminate();
          }, 100);
        }
      };
      
      cleanup();
    };
  }, []);

  const runInference = useCallback(async (
    modelType: ModelType,
    data: DataInput | CompoundDataInput,
    options?: FitOptions & {
      useWAIC?: boolean;
      returnRouteInfo?: boolean;
      businessContext?: 'revenue' | 'conversion' | 'engagement' | 'other';
      maxComponents?: number;
      preferSimple?: boolean;
    }
  ): Promise<(InferenceResult & { waicInfo?: any; routeInfo?: any }) | null> => {
    console.log('🔵 [1] runInference started');
    setIsRunning(true);
    setProgress(null);
    setError(null);
    
    const requestId = `${Date.now()}-${Math.random()}`;
    requestIdRef.current = requestId;

    try {
      if (workerRef.current) {
        console.log('🔵 [2] About to post message to worker');
        const result = await new Promise<InferenceResult & { waicInfo?: any; routeInfo?: any }>((resolve, reject) => {
          let timeoutId: number;
          
          const handleMessage = (event: MessageEvent) => {
            if (event.data.id !== requestId) return;
            console.log('🔵 [4] handleMessage called with:', event.data.type);
            switch (event.data.type) {
              case 'progress':
                setProgress(event.data.payload);
                options?.onProgress?.(event.data.payload);
                break;
              
              case 'result': {
                clearTimeout(timeoutId);
                workerRef.current?.removeEventListener('message', handleMessage);
                
                const { posteriorIds, diagnostics, summary, waicInfo, routeInfo } = event.data.payload;
                
                // Create appropriate proxy based on posterior type
                let posterior: PosteriorProxy | CompoundPosteriorProxy;
                console.log('🔵 [5] Creating posterior proxies');
                if (posteriorIds.type === 'compound') {
                  const freqProxy = new PosteriorProxy(
                    workerRef.current!,
                    posteriorIds.frequency,
                    summary.frequency
                  );
                  const sevProxy = new PosteriorProxy(
                    workerRef.current!,
                    posteriorIds.severity,
                    summary.severity
                  );
                  
                  posteriorProxies.current.add(freqProxy);
                  posteriorProxies.current.add(sevProxy);
                  
                  posterior = new CompoundPosteriorProxy(freqProxy, sevProxy, summary);
                } else {
                  const proxy = new PosteriorProxy(
                    workerRef.current!,
                    posteriorIds.id,
                    summary
                  );
                  posteriorProxies.current.add(proxy);
                  posterior = proxy;
                }
                console.log('🔵 [6] About to resolve promise');
                resolve({ 
                  posterior: posterior as any, 
                  diagnostics,
                  waicInfo,
                  routeInfo
                });
                break;
              }
              
              case 'error':
                clearTimeout(timeoutId);
                console.error('❌ Worker error:', event.data.payload);
                workerRef.current?.removeEventListener('message', handleMessage);
                reject(new Error(event.data.payload.message));
                break;
            }
          };

          workerRef.current!.addEventListener('message', handleMessage);
          workerRef.current!.postMessage({ 
            id: requestId, 
            type: 'fit',
            payload: { modelType, data, options }
          });
          console.log('🔵 [3] Message posted to worker');
          // Timeout
          timeoutId = window.setTimeout(() => {
            workerRef.current?.removeEventListener('message', handleMessage);
            reject(new Error('Inference timeout'));
          }, 5 * 60 * 1000);
        });
        
        return result;
        
      } else {
        // Fallback to main thread
        console.log('🔄 Using main thread fallback');
        const { InferenceEngine } = await import('../inference/InferenceEngine');
        const engine = new InferenceEngine();
        return await engine.fit(modelType, data, {
          ...options,
          onProgress: (p) => {
            setProgress(p);
            options?.onProgress?.(p);
          }
        });
      }
    } catch (err: any) {
      setError(err.message);
      setIsRunning(false);
      return null;
    } finally {
      setIsRunning(false);
      requestIdRef.current = null;
    }
  }, []);

  const cancelInference = useCallback(() => {
    // TODO: Implement proper cancellation by sending cancel message to worker
    requestIdRef.current = null;
    setIsRunning(false);
    setProgress(null);
  }, []);

  return {
    runInference,
    cancelInference,
    isRunning,
    progress,
    error
  };
} 