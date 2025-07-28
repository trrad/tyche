# React Hooks

Custom hooks for running inference and managing statistical computations in React apps.

## Overview

Just one main hook for now - `useInferenceWorker` - which handles all the WebWorker communication, state management, and cleanup so you don't have to think about it.

## Core Hook

### useInferenceWorker

Runs inference in a WebWorker and gives you reactive state updates.

```typescript
const {
  runInference,    // Function to start inference
  cancelInference, // Cancel running inference  
  isRunning,       // Loading state
  progress,        // Current progress
  error           // Error message if something breaks
} = useInferenceWorker();
```

#### What it does

- **Runs off main thread**: No UI freezing during computation
- **Progress updates**: Know what's happening during long runs
- **Fallback handling**: If workers aren't available, uses main thread
- **Cleans up after itself**: No memory leaks from dangling posteriors
- **TypeScript everywhere**: Full type safety

#### Basic Usage

```typescript
function MyAnalysis() {
  const { runInference, isRunning, progress } = useInferenceWorker();
  
  const analyze = async () => {
    const result = await runInference(
      'beta-binomial',           // Model type
      { data: [1, 0, 1, 1, 0] }, // Your data
      {                          // Options (optional)
        priorParams: { type: 'beta', params: [1, 1] }
      }
    );
    
    if (result) {
      // Cached stats are instant
      const mean = result.posterior.mean();
      console.log('Mean:', mean);
      
      // Sampling is async
      const samples = await result.posterior.sample(10000);
      console.log('Got', samples.length, 'samples');
    }
  };
  
  return (
    <div>
      <button onClick={analyze} disabled={isRunning}>
        {isRunning ? 'Running...' : 'Analyze'}
      </button>
      
      {progress && (
        <div>
          {progress.stage}: {progress.progress}%
        </div>
      )}
    </div>
  );
}
```

#### Advanced Usage

##### Compound Models

```typescript
const { runInference } = useInferenceWorker();

const analyzeRevenue = async (userData: UserData[]) => {
  const result = await runInference(
    'compound-beta-lognormal',
    { data: userData }
  );
  
  if (result?.posterior) {
    // Access components
    const convRate = result.posterior.frequency.mean()[0];
    const avgRevenue = result.posterior.severity.mean()[0];
    const rpu = result.posterior.expectedValuePerUser();
    
    // Sample for uncertainty
    const [convSamples, revSamples] = await Promise.all([
      result.posterior.frequency.sample(1000),
      result.posterior.severity.sample(1000)
    ]);
  }
};
```

##### Progress Monitoring

```typescript
const { runInference, progress } = useInferenceWorker();

// Progress updates for different stages
useEffect(() => {
  if (progress) {
    switch (progress.stage) {
      case 'Initializing':
        setStatusMessage('Setting up analysis...');
        break;
      case 'E-step':
        setStatusMessage(`EM iteration ${progress.iteration}/${progress.totalIterations}`);
        break;
      case 'Computing posterior':
        setStatusMessage('Finalizing results...');
        break;
    }
  }
}, [progress]);
```

##### Error Handling

```typescript
const { runInference, error } = useInferenceWorker();

const safeAnalyze = async () => {
  try {
    const result = await runInference(modelType, data);
    if (!result) {
      throw new Error('Inference returned null');
    }
    processResult(result);
  } catch (err) {
    console.error('Inference failed:', err);
    // Hook's error state also available
    if (error) {
      showErrorToast(error);
    }
  }
};
```

#### Implementation Details

The hook handles a bunch of stuff you don't want to deal with:

1. **Worker lifecycle** - Creates on mount, cleans up on unmount
2. **Memory management** - Tracks and disposes posterior proxies
3. **Fallback logic** - No worker? No problem, uses main thread
4. **Request tracking** - Unique IDs prevent race conditions

## Future Hooks

We're planning to add more hooks as we build out the UI layer:

### usePowerAnalysis (Coming in Phase 2.3)

```typescript
const {
  calculatePower,
  findSampleSize,
  powerCurve,
  isCalculating
} = usePowerAnalysis();
```

### usePriorElicitation (Phase 2.1)

```typescript
const {
  prior,
  setPriorFromPercentiles,
  setPriorFromParameters,
  priorSamples,
  resetToDefault
} = usePriorElicitation(modelType);
```

## Tips

1. **Always check results** - `runInference` can return null on error
2. **Workers timeout after 5 minutes** - For huge datasets, consider batching
3. **The hook cleans up automatically** - But cancel dependent operations in your effects
4. **Progress events are throttled** - You won't get spammed with updates

## Testing

Mock the worker in your tests:

```typescript
jest.mock('../workers/inference.worker.ts', () => ({
  default: jest.fn(() => ({
    postMessage: jest.fn(),
    terminate: jest.fn()
  }))
}));
```

## Common Issues

**Worker not loading?**
- Check your bundler config
- Make sure your browser supports Workers
- Try the demo to see if it's a general issue

**Getting timeouts?**
- Default is 5 minutes
- Maybe your data is huge?
- Check for infinite loops in custom code

**Memory usage growing?**
- The hook cleans up proxies automatically
- Don't store old posterior references
- Use React DevTools to check for leaks