import { InferenceEngine } from '../inference/InferenceEngine';
import type { ModelType } from '../inference/InferenceEngine';
import type { DataInput, CompoundDataInput, FitOptions } from '../inference/base/types';

const inferenceEngine = new InferenceEngine();

// Store posteriors with their metadata
interface StoredPosterior {
  posterior: any;
  type: string;
  created: number;
  lastAccessed: number;
}

const posteriorStore = new Map<string, StoredPosterior>();

// Message types
type WorkerRequest = 
  | { id: string; type: 'fit'; payload: { modelType: ModelType; data: DataInput | CompoundDataInput; options?: FitOptions } }
  | { id: string; type: 'sample'; payload: { posteriorId: string; n: number } }
  | { id: string; type: 'mean'; payload: { posteriorId: string } }
  | { id: string; type: 'variance'; payload: { posteriorId: string } }
  | { id: string; type: 'credibleInterval'; payload: { posteriorId: string; level: number } }
  | { id: string; type: 'getComponents'; payload: { posteriorId: string } }
  | { id: string; type: 'clear'; payload: { posteriorId: string } }
  | { id: string; type: 'clearAll'; payload?: never }
  | { id: string; type: 'getStats'; payload: { posteriorId: string } }
  | { id: string; type: 'logPdf'; payload: { posteriorId: string; data: any } }
  | { id: string; type: 'logPdfBatch'; payload: { posteriorId: string; dataArray: any[] } };

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  console.log('🟡 [A] Worker received message');
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'fit': {
        console.log('🟡 [B] Starting inference');
        const { modelType, data, options } = payload;
        
        // Run inference
        const result = await inferenceEngine.fit(modelType, data, {
          ...options,
          onProgress: (progress) => {
            self.postMessage({ id, type: 'progress', payload: progress });
          }
        });
        
        // Store the posterior(s)
        const posteriorIds = storePosteriorResult(id, result.posterior);
        
        // Compute summary statistics for immediate use
        const summary = computePosteriorSummary(result.posterior);
        console.log('🟡 [C] Inference complete');
        console.log('🟡 [D] About to send result');
        self.postMessage({ 
          id, 
          type: 'result', 
          payload: {
            posteriorIds,
            diagnostics: result.diagnostics,
            summary
          }
        });
        break;
      }
      
      case 'sample': {
        const { posteriorId, n } = payload;
        const stored = posteriorStore.get(posteriorId);
        
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        
        stored.lastAccessed = Date.now();
        
        // Generate samples in batches to avoid blocking
        const samples: number[] = [];
        const batchSize = Math.min(n, 10000);
        
        for (let i = 0; i < n; i += batchSize) {
          const currentBatch = Math.min(batchSize, n - i);
          for (let j = 0; j < currentBatch; j++) {
            samples.push(stored.posterior.sample(1)[0]);
          }
          
          // Yield to message queue periodically
          if (i + batchSize < n) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        
        self.postMessage({ id, type: 'samples', payload: samples });
        break;
      }
      
      case 'mean': {
        const { posteriorId } = payload;
        const stored = posteriorStore.get(posteriorId);
        
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        
        stored.lastAccessed = Date.now();
        self.postMessage({ 
          id, 
          type: 'mean', 
          payload: stored.posterior.mean() 
        });
        break;
      }
      
      case 'variance': {
        const { posteriorId } = payload;
        const stored = posteriorStore.get(posteriorId);
        
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        
        stored.lastAccessed = Date.now();
        const variance = stored.posterior.variance ? 
          stored.posterior.variance() : 
          estimateVariance(stored.posterior);
        
        self.postMessage({ id, type: 'variance', payload: variance });
        break;
      }
      
      case 'credibleInterval': {
        const { posteriorId, level } = payload;
        const stored = posteriorStore.get(posteriorId);
        
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        
        stored.lastAccessed = Date.now();
        self.postMessage({ 
          id, 
          type: 'credibleInterval', 
          payload: stored.posterior.credibleInterval(level) 
        });
        break;
      }
      
      case 'getComponents': {
        const { posteriorId } = payload;
        const stored = posteriorStore.get(posteriorId);
        
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        
        stored.lastAccessed = Date.now();
        
        // Check if posterior has getComponents method
        if ('getComponents' in stored.posterior && typeof stored.posterior.getComponents === 'function') {
          const components = stored.posterior.getComponents();
          self.postMessage({ id, type: 'components', payload: components });
        } else {
          // Not a mixture posterior
          self.postMessage({ id, type: 'components', payload: null });
        }
        break;
      }
      
      case 'getStats': {
        const { posteriorId } = payload;
        const stored = posteriorStore.get(posteriorId);
        
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        
        stored.lastAccessed = Date.now();
        const stats = computePosteriorSummary(stored.posterior);
        
        self.postMessage({ id, type: 'stats', payload: stats });
        break;
      }
      
      case 'logPdf': {
        const { posteriorId, data } = payload;
        const stored = posteriorStore.get(posteriorId);
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        // Check if posterior has logPdf method
        if ('logPdf' in stored.posterior && typeof stored.posterior.logPdf === 'function') {
          const logProb = stored.posterior.logPdf(data);
          self.postMessage({ id, type: 'logPdf', payload: logProb });
        } else {
          throw new Error(`Posterior ${stored.type} does not implement logPdf`);
        }
        break;
      }

      case 'logPdfBatch': {
        const { posteriorId, dataArray } = payload;
        const stored = posteriorStore.get(posteriorId);
        if (!stored) {
          throw new Error(`Posterior ${posteriorId} not found`);
        }
        if ('logPdf' in stored.posterior && typeof stored.posterior.logPdf === 'function') {
          const logProbs = dataArray.map(data => stored.posterior.logPdf(data));
          self.postMessage({ id, type: 'logPdfBatch', payload: logProbs });
        } else {
          throw new Error(`Posterior ${stored.type} does not implement logPdf`);
        }
        break;
      }
      
      case 'clear': {
        const { posteriorId } = payload;
        posteriorStore.delete(posteriorId);
        self.postMessage({ id, type: 'cleared', payload: { posteriorId } });
        break;
      }
      
      case 'clearAll': {
        posteriorStore.clear();
        self.postMessage({ id, type: 'cleared', payload: { all: true } });
        break;
      }
    }
  } catch (error: any) {
    self.postMessage({ 
      id, 
      type: 'error', 
      payload: { 
        message: error.message,
        stack: error.stack 
      } 
    });
  }
};

// Helper functions
function storePosteriorResult(requestId: string, posterior: any): any {
  // Handle compound posteriors
  if ('frequency' in posterior && 'severity' in posterior) {
    const freqId = `${requestId}-frequency`;
    const sevId = `${requestId}-severity`;
    
    posteriorStore.set(freqId, {
      posterior: posterior.frequency,
      type: 'frequency',
      created: Date.now(),
      lastAccessed: Date.now()
    });
    
    posteriorStore.set(sevId, {
      posterior: posterior.severity,
      type: 'severity',
      created: Date.now(),
      lastAccessed: Date.now()
    });
    
    return {
      type: 'compound',
      frequency: freqId,
      severity: sevId
    };
  }
  
  // Simple posterior
  const posteriorId = `${requestId}-posterior`;
  posteriorStore.set(posteriorId, {
    posterior,
    type: 'simple',
    created: Date.now(),
    lastAccessed: Date.now()
  });
  
  return {
    type: 'simple',
    id: posteriorId
  };
}

function computePosteriorSummary(posterior: any): any {
  // Handle compound posteriors
  if ('frequency' in posterior && 'severity' in posterior) {
    return {
      type: 'compound',
      frequency: computePosteriorSummary(posterior.frequency),
      severity: computePosteriorSummary(posterior.severity),
      expectedValuePerUser: posterior.expectedValuePerUser ? 
        posterior.expectedValuePerUser() : 
        posterior.frequency.mean()[0] * posterior.severity.mean()[0]
    };
  }
  
  // Simple posterior
  const summary: any = {
    type: 'simple',
    mean: posterior.mean(),
    variance: posterior.variance ? posterior.variance() : null,
    ci95: posterior.credibleInterval(0.95),
    ci90: posterior.credibleInterval(0.90),
    ci80: posterior.credibleInterval(0.80)
  };
  
  // NEW: Add components if available
  if ('getComponents' in posterior && typeof posterior.getComponents === 'function') {
    summary.components = posterior.getComponents();
    summary.numComponents = summary.components.length;
  }
  
  return summary;
}

function estimateVariance(posterior: any): number[] {
  // If posterior doesn't have variance method, estimate from samples
  const samples: number[] = [];
  for (let i = 0; i < 1000; i++) {
            samples.push(posterior.sample(1)[0]);
  }
  
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / samples.length;
  
  return [variance];
}

// Optional: Clean up old posteriors periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [id, stored] of posteriorStore.entries()) {
    if (now - stored.lastAccessed > maxAge) {
      posteriorStore.delete(id);
      console.log(`Cleaned up old posterior: ${id}`);
    }
  }
}, 60 * 1000); // Check every minute 