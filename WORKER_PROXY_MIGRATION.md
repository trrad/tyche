# Worker Proxy Pattern Migration Guide

## Overview

The worker proxy pattern moves posterior objects into Web Workers, allowing us to:
- Generate 100k+ samples without blocking the UI
- Prepare for worker pools and GPU acceleration
- Maintain responsive UIs during heavy computation

## Architecture

```
Main Thread                    Worker Thread
┌─────────────┐               ┌──────────────┐
│ UI Code     │               │ Inference    │
│ ↓           │               │ Engine       │
│ Proxy       │←─ messages →─│ ↓            │
│ Objects     │               │ Posterior    │
└─────────────┘               │ Objects      │
                              └──────────────┘
```

## Quick Start

### 1. Update your inference code

```typescript
// Before
const engine = new InferenceEngine();
const result = await engine.fit(modelType, data, options);
const samples = result.posterior.sample(); // Sync

// After
import { useInferenceWorker } from './hooks/useInferenceWorker';

const { runInference, isRunning, progress } = useInferenceWorker();
const result = await runInference(modelType, data, options);
const samples = await result.posterior.sample(1000); // Async!
```

### 2. Handle compound posteriors

```typescript
// Compound posteriors work the same way
if ('frequency' in result.posterior) {
  const freqSamples = await result.posterior.frequency.sample(1000);
  const sevSamples = await result.posterior.severity.sample(1000);
  const rpu = result.posterior.expectedValuePerUser(); // Still sync
}
```

### 3. Update visualizations gradually

#### Option A: Use the adapter (minimal changes)

```typescript
import { VisualizationAdapter } from './workers/VisualizationAdapter';

// Works with both sync and async posteriors
const samples = await VisualizationAdapter.generateSamples(
  posterior, 
  10000,
  (progress) => console.log(`${progress}% complete`)
);
```

#### Option B: Use async components

```typescript
// Replace SimpleViolinPlot with AsyncViolinPlot
import { AsyncViolinPlot } from './ui/visualizations/AsyncViolinPlot';

<AsyncViolinPlot
  data={data}
  posteriors={{ control, treatment }}
  modelType="beta-binomial"
/>
```

## Key Differences

### Sync Methods (cached from summary)
- `mean()` - returns immediately
- `variance()` - returns immediately  
- `credibleInterval(0.95)` - returns immediately for common levels

### Async Methods (computed in worker)
- `sample(n)` - returns Promise<number[]>
- `sampleBatched(n, batchSize)` - returns AsyncGenerator
- `credibleIntervalAsync(level)` - for non-cached levels

## Migration Checklist

- [ ] Update inference calls to use `useInferenceWorker`
- [ ] Replace direct `posterior.sample()` loops with `VisualizationAdapter`
- [ ] Update visualizations one at a time
- [ ] Test with large sample sizes (100k+)
- [ ] Remove any serialization workarounds

## Performance Tips

1. **Batch large sample requests**
   ```typescript
   // For 1M samples, use batching
   const allSamples = [];
   for await (const batch of posterior.sampleBatched(1000000, 10000)) {
     allSamples.push(...batch);
   }
   ```

2. **Pre-cache common statistics**
   - 95%, 90%, and 80% CIs are pre-cached
   - Mean and variance are pre-cached
   - Use these in hot paths

3. **Dispose of proxies when done**
   ```typescript
   // Clean up to free worker memory
   await posterior.dispose();
   ```

## Troubleshooting

**"Posterior proxy has been disposed"**
- Don't reuse proxies after disposal
- Create new inference results instead

**Timeout errors**
- Large sample requests (>100k) may need longer timeouts
- Consider batching or reducing sample size

**Missing methods**
- Check if you're using a proxy-specific method
- Use the adapter for compatibility

## Future Enhancements

Once migrated, you'll be ready for:
- Worker pools for parallel power analysis
- GPU acceleration via WebGL workers
- Streaming results for real-time updates
- Distributed inference across multiple workers

## Implementation Files

### Core Files
- `src/workers/inference.worker.ts` - Enhanced worker with posterior storage
- `src/workers/PosteriorProxy.ts` - Proxy classes for async access
- `src/hooks/useInferenceWorker.ts` - Updated hook with proxy creation
- `src/workers/VisualizationAdapter.ts` - Backward compatibility helpers

### Example Components
- `src/ui/visualizations/AsyncViolinPlot.tsx` - Async violin plot
- `src/ui/visualizations/AsyncPPCVisualizer.tsx` - Async PPC visualizer

## Testing the Migration

1. **Start with a simple test**
   ```typescript
   const { runInference } = useInferenceWorker();
   const result = await runInference('beta-binomial', { data: [1,0,1,1,0] });
   const samples = await result.posterior.sample(1000);
   console.log('Samples:', samples.length);
   ```

2. **Test with large samples**
   ```typescript
   const samples = await result.posterior.sample(100000);
   console.log('Large sample test:', samples.length);
   ```

3. **Test compound posteriors**
   ```typescript
   const compoundResult = await runInference('compound-beta-gamma', compoundData);
   const freqSamples = await compoundResult.posterior.frequency.sample(1000);
   const sevSamples = await compoundResult.posterior.severity.sample(1000);
   ```

## Rollback Plan

If issues arise, you can temporarily disable the worker:

```typescript
// In useInferenceWorker.ts, force fallback
const useMainThread = true; // Set to true to disable worker

if (useMainThread || !workerRef.current) {
  // Use main thread fallback
}
```

This ensures your app continues working while you debug any issues. 