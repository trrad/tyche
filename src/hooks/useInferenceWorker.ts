import { useState, useEffect, useCallback, useRef } from 'react';
import type { ModelType } from '../inference/InferenceEngine';
import type { DataInput, CompoundDataInput, FitOptions, InferenceResult, FitProgress } from '../inference/base/types';

/**
 * Reconstruct posterior objects with their methods after worker serialization
 */
async function reconstructPosteriorFromWorker(result: any): Promise<any> {
  // Reconstruct the posterior based on the data structure
  if (result.posterior) {
    const posteriorData = result.posterior;
    
    // Check if it's a Beta posterior (has alpha, beta params)
    if (posteriorData.params && typeof posteriorData.params.alpha === 'number' && typeof posteriorData.params.beta === 'number') {
      const { BetaPosterior } = await import('../inference/exact/BetaBinomial');
      return {
        ...result,
        posterior: new BetaPosterior(posteriorData.params.alpha, posteriorData.params.beta)
      };
    }
    
    // Check if it's a Gamma posterior
    if (posteriorData.params && typeof posteriorData.params.alpha === 'number' && typeof posteriorData.params.beta === 'number') {
      const { GammaPosterior } = await import('../inference/exact/GammaExponential');
      return {
        ...result,
        posterior: new GammaPosterior(posteriorData.params.alpha, posteriorData.params.beta)
      };
    }
    
    // Check if it's a LogNormal posterior
    if (posteriorData.params && typeof posteriorData.params.mu === 'number' && typeof posteriorData.params.sigma === 'number') {
      const { LogNormalPosterior } = await import('../inference/exact/LogNormalInference');
      return {
        ...result,
        posterior: new LogNormalPosterior(posteriorData.params.mu, posteriorData.params.sigma)
      };
    }
    
    // For compound posteriors, reconstruct both frequency and severity
    if (posteriorData.frequency && posteriorData.severity) {
      return {
        ...result,
        posterior: {
          frequency: (await reconstructPosteriorFromWorker({ posterior: posteriorData.frequency })).posterior,
          severity: (await reconstructPosteriorFromWorker({ posterior: posteriorData.severity })).posterior
        }
      };
    }
  }
  
  // If we can't reconstruct, return as-is (will fall back to main thread)
  console.warn('Could not reconstruct posterior, returning as-is');
  return result;
}

export function useInferenceWorker() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<FitProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef<string | null>(null);

  // Initialize worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../workers/inference.worker.ts', import.meta.url),
        { type: 'module' }
      );
      console.log('✅ Worker initialized successfully');
    } catch (err) {
      console.warn('❌ Worker initialization failed, will use main thread fallback:', err);
    }

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const runInference = useCallback(async (
    modelType: ModelType,
    data: DataInput | CompoundDataInput,
    options?: FitOptions
  ): Promise<InferenceResult | null> => {
    setIsRunning(true);
    setProgress(null);
    setError(null);
    
    // Generate request ID
    const requestId = `${Date.now()}-${Math.random()}`;
    requestIdRef.current = requestId;

    try {
      // Use worker if available
      if (workerRef.current) {
        console.log('🚀 Using worker for inference');
        return await new Promise((resolve, reject) => {
          const handleMessage = async (event: MessageEvent) => {
            if (event.data.id !== requestId) return;

            switch (event.data.type) {
              case 'progress':
                setProgress(event.data.payload);
                options?.onProgress?.(event.data.payload);
                break;
              
              case 'result':
                console.log('✅ Worker result received');
                workerRef.current?.removeEventListener('message', handleMessage);
                
                // Reconstruct posterior objects with their methods
                try {
                  const reconstructedResult = await reconstructPosteriorFromWorker(event.data.payload);
                  resolve(reconstructedResult);
                } catch (error) {
                  console.error('❌ Failed to reconstruct posterior:', error);
                  reject(error);
                }
                break;
              
              case 'error':
                console.error('❌ Worker error:', event.data.payload);
                workerRef.current?.removeEventListener('message', handleMessage);
                reject(new Error(event.data.payload.message));
                break;
            }
          };

          workerRef.current!.addEventListener('message', handleMessage);
          workerRef.current!.postMessage({ id: requestId, modelType, data, options });

          // Timeout after 5 minutes
          setTimeout(() => {
            if (requestIdRef.current === requestId) {
              workerRef.current?.removeEventListener('message', handleMessage);
              reject(new Error('Inference timeout'));
            }
          }, 5 * 60 * 1000);
        });
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
      return null;
    } finally {
      setIsRunning(false);
      requestIdRef.current = null;
    }
  }, []);

  const cancelInference = useCallback(() => {
    // In a real implementation, you'd send a cancel message to the worker
    // For now, just clear the request ID so the result is ignored
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