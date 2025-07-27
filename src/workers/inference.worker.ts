import { InferenceEngine } from '../inference/InferenceEngine';
import type { ModelType } from '../inference/InferenceEngine';
import type { DataInput, CompoundDataInput, FitOptions } from '../inference/base/types';

const inferenceEngine = new InferenceEngine();

interface WorkerMessage {
  id: string;
  modelType: ModelType;
  data: DataInput | CompoundDataInput;
  options?: FitOptions;
}

/**
 * Reconstruct posterior objects with their methods after serialization
 */
function reconstructPosterior(posterior: any, modelType: string): any {
  // For now, we'll return the posterior as-is since the methods should be preserved
  // The issue might be elsewhere - let's add some debugging
  console.log('Posterior type:', typeof posterior);
  console.log('Posterior keys:', Object.keys(posterior));
  console.log('Has sample method:', typeof posterior.sample === 'function');
  
  return posterior;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, modelType, data, options } = event.data;

  try {
    const result = await inferenceEngine.fit(
      modelType,
      data,
      {
        ...options,
        onProgress: (progress) => {
          self.postMessage({ id, type: 'progress', payload: progress });
        }
      }
    );

    // Reconstruct posteriors if needed
    if (result.posterior) {
      result.posterior = reconstructPosterior(result.posterior, modelType);
    }

    self.postMessage({ id, type: 'result', payload: result });
  } catch (error: any) {
    self.postMessage({ 
      id, 
      type: 'error', 
      payload: { message: error.message } 
    });
  }
}; 