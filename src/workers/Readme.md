# WebWorker Infrastructure

Parallel computation infrastructure enabling non-blocking Bayesian inference and responsive UIs.

## Overview

The workers directory implements a proxy pattern that moves heavy computation (posterior sampling, inference) into Web Workers, allowing the main thread to remain responsive. This is critical for:

- Generating 100k+ samples without freezing the UI
- Running multiple inferences in parallel
- Preparing for future GPU acceleration
- Maintaining 60fps interactions during analysis

## Architecture

```
Main Thread                    Worker Thread
┌─────────────────┐           ┌──────────────────┐
│ React UI        │           │ InferenceEngine  │
│     ↓           │           │      ↓           │
│ useInferenceWorker ←──────→ │ inference.worker │
│     ↓           │ messages  │      ↓           │
│ PosteriorProxy  │           │ Posterior Objects│
└─────────────────┘           └──────────────────┘
```

## Core Components

### inference.worker.ts
The main worker that:
- Runs inference algorithms in the background
- Stores posterior objects in worker memory
- Handles sampling requests without blocking UI
- Manages posterior lifecycle (creation, access, disposal)

**Key features:**
- Posterior storage with unique IDs
- Batch sampling for large requests
- Progress reporting during inference
- Memory management with cleanup

### PosteriorProxy.ts
Proxy classes that provide async access to posteriors living in the worker:

```typescript
// Simple posterior proxy
class PosteriorProxy {
  // Sync methods (using cached summary)
  mean(): number[]              // Instant
  variance(): number[]          // Instant  
  credibleInterval(0.95)       // Instant (cached levels)
  
  // Async methods (computed in worker)
  async sample(n: number): Promise<number[]>
  async *sampleBatched(n, batchSize): AsyncGenerator<number[]>
  async credibleIntervalAsync(level): Promise<[number, number][]>
}

// Compound posterior proxy
class CompoundPosteriorProxy {
  frequency: PosteriorProxy
  severity: PosteriorProxy
  expectedValuePerUser(): number  // Computed from cached means
}
```

## Usage Pattern

### 1. Hook Integration (Primary Pattern)

```typescript
import { useInferenceWorker } from '../hooks/useInferenceWorker';

function MyComponent() {
  const { runInference, isRunning, progress, error } = useInferenceWorker();
  
  const analyze = async () => {
    // Runs in worker, returns proxy
    const result = await runInference('beta-binomial', data, options);
    
    // Sync access to cached stats
    const mean = result.posterior.mean();
    
    // Async sampling
    const samples = await result.posterior.sample(10000);
  };
}
```

### 2. Compound Models

```typescript
const result = await runInference('compound-beta-lognormal', userData);

// Access components separately
const conversionRate = result.posterior.frequency.mean()[0];
const avgRevenue = result.posterior.severity.mean()[0];
const revenuePerUser = result.posterior.expectedValuePerUser();

// Sample for uncertainty  
const convSamples = await result.posterior.frequency.sample(1000);
const revSamples = await result.posterior.severity.sample(1000);
```

### 3. Large-Scale Sampling

```typescript
// For 1M+ samples, use batching
const allSamples: number[] = [];
for await (const batch of posterior.sampleBatched(1_000_000, 10_000)) {
  allSamples.push(...batch);
  updateProgress(allSamples.length / 1_000_000);
}
```

## Message Protocol

The worker communicates via typed messages:

```typescript
// Request types
type WorkerRequest = 
  | { type: 'fit', payload: { modelType, data, options } }
  | { type: 'sample', payload: { posteriorId, n } }
  | { type: 'mean', payload: { posteriorId } }
  | { type: 'credibleInterval', payload: { posteriorId, level } }
  | { type: 'clear', payload: { posteriorId } }
  | { type: 'clearAll' };

// Response types  
type WorkerResponse =
  | { type: 'progress', payload: FitProgress }
  | { type: 'result', payload: { posteriorIds, diagnostics, summary } }
  | { type: 'samples', payload: number[] }
  | { type: 'error', payload: { message: string } };
```

## Performance Optimizations

### Pre-cached Statistics
To minimize latency, common statistics are computed once and cached:
- Mean and variance
- 95%, 90%, and 80% credible intervals
- Expected value per user (compound models)

### Batched Sampling
Large sample requests are processed in batches to:
- Yield to message queue periodically
- Report progress incrementally
- Avoid memory spikes

### Memory Management
- Posteriors track last access time
- Cleanup via `dispose()` method
- Bulk cleanup on worker termination

## Integration with Visualizations

The proxy pattern integrates seamlessly with async-aware visualization components:

```typescript
// Components handle both sync and async posteriors
<UnifiedDistributionViz
  distributions={[
    { id: 'post', label: 'Posterior', posterior: proxyPosterior }
  ]}
/>

// The viz component detects proxy and samples asynchronously
if (posterior instanceof PosteriorProxy) {
  const samples = await posterior.sample(nSamples);
}
```

## Error Handling

### Timeout Protection
```typescript
// Operations have appropriate timeouts
- Regular operations: 30 seconds
- Large sampling (>10k): 60 seconds
- Automatic cleanup on timeout
```

### Disposal Safety
```typescript
// Proxies check disposal status
if (this.disposed) {
  throw new Error('Posterior proxy has been disposed');
}
```

### Worker Fallback
The system gracefully falls back to main thread if workers unavailable:
```typescript
if (!workerRef.current) {
  // Use main thread implementation
  const engine = new InferenceEngine();
  return await engine.fit(modelType, data, options);
}
```

## Future Enhancements

### Worker Pool (Phase 2.3)
```typescript
class WorkerPool {
  private workers: Worker[] = [];
  
  async runParallel(tasks: InferenceTask[]): Promise<Result[]> {
    return Promise.all(
      tasks.map((task, i) => 
        this.workers[i % this.workers.length].run(task)
      )
    );
  }
}
```

### GPU Acceleration (Phase 3+)
- WebGPU compute shaders for sampling
- Parallel chain execution
- Matrix operations for hierarchical models

### Streaming Results
- Progressive posterior updates
- Real-time convergence monitoring
- Live power analysis updates

## Testing

Test the worker infrastructure with:

```typescript
// Simple test
const { runInference } = useInferenceWorker();
const result = await runInference('beta-binomial', [1,0,1,1,0]);
console.assert(result.posterior instanceof PosteriorProxy);

// Stress test
const samples = await result.posterior.sample(100_000);
console.assert(samples.length === 100_000);

// Cleanup test
await result.posterior.dispose();
try {
  await result.posterior.sample(10);
  console.error('Should have thrown!');
} catch (e) {
  console.log('✓ Disposal working');
}
```

## Common Issues

**"Cannot read property 'sample' of undefined"**
- The posterior might be a compound type
- Access via `.frequency` or `.severity`

**Timeout errors**
- Reduce sample size or increase timeout
- Consider batched sampling

**Memory leaks**
- Always dispose proxies when done
- Hook handles cleanup automatically

## Not Implemented

- Worker pool for parallel inference
- Shared memory between workers
- Transferable objects optimization
- WebAssembly integration
- GPU compute shaders