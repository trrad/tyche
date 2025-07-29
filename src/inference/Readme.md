# Inference Algorithms

All the inference implementations - from exact conjugate updates to approximate algorithms.

## Structure

```
inference/
├── base/
│   ├── InferenceEngine.ts    # Base class
│   └── types.ts             # Common types
├── exact/                   # Conjugate updates
│   ├── BetaBinomial.ts
│   ├── GammaExponential.ts
│   └── NormalNormal.ts
├── approximate/            # EM and VI
│   ├── em/
│   │   ├── NormalMixtureEM.ts
│   │   └── LogNormalMixtureEM.ts
│   └── vi/
│       └── vi-engine.ts    # Legacy VI (being refactored)
└── InferenceEngine.ts      # Smart router
```

## API and Data Formats

### Basic Interface

All inference engines implement:

```typescript
interface InferenceEngine {
  async fit(
    data: DataInput, 
    options?: FitOptions
  ): Promise<InferenceResult>;
}
```

### Data Input Formats

```typescript
// For simple models (beta-binomial, gamma, etc.)
interface DataInput {
  data: number[] | BinomialData | SummaryStats;
  config?: { [key: string]: any };
}

// For compound models
interface CompoundDataInput {
  data: UserData[];  // { converted: boolean, value: number }[]
  config?: { numComponents?: number };
}

// Examples
const binaryData = { data: [1, 0, 1, 1, 0] };
const binomialData = { data: { successes: 47, trials: 100 } };
const revenueData = { data: [45.2, 0, 123.5, 0, 67.8] };
const compoundData = {
  data: [
    { converted: true, value: 45.2 },
    { converted: false, value: 0 },
    { converted: true, value: 123.5 }
  ]
};
```

### Result Structure

```typescript
interface InferenceResult {
  posterior: Posterior | CompoundPosterior;
  diagnostics: {
    converged: boolean;
    iterations: number;
    runtime: number;
    modelType?: string;
  };
}

// Posterior methods (all posteriors implement these)
interface Posterior {
  mean(): number[];
  variance(): number[];
  sample(): number[];  // Note: This is async when using workers!
  credibleInterval(level?: number): Array<[number, number]>;
}
```

## WebWorker Integration

**Important**: In practice, you'll rarely use the InferenceEngine directly. Instead, use the `useInferenceWorker` hook which handles WebWorker communication:

```typescript
import { useInferenceWorker } from '../hooks/useInferenceWorker';

// This runs in a WebWorker automatically
const { runInference } = useInferenceWorker();
const result = await runInference('beta-binomial', data);

// The posterior is actually a proxy - sampling is async!
const samples = await result.posterior.sample(10000);  // Runs in worker
const mean = result.posterior.mean();  // Instant (cached)
```

See the [Workers README](../workers/README.md) for details on the proxy pattern and async sampling.

## The Router

`InferenceEngine` automatically picks the best algorithm:

```typescript
const engine = new InferenceEngine();

// Detects beta-binomial → uses conjugate
const result1 = await engine.fit('beta-binomial', data);

// Detects mixture → uses EM
const result2 = await engine.fit('normal-mixture', data);

// Falls back to VI for complex models
const result3 = await engine.fit('custom-model', data);
```

## Algorithm Hierarchy

We follow a speed-first approach:

1. **Conjugate updates** (<1ms) - Exact math when prior-likelihood pairs allow
2. **EM algorithms** (~50ms) - For mixture models with 1-4 components  
3. **Variational Inference** (~500ms) - Everything else

## Exact Inference

Conjugate pairs give exact posteriors instantly:
- Beta-Binomial (conversion rates)
- Gamma-Exponential (rates/times)
- Normal-Normal (known variance)
- LogNormal-NIG (via log transform)

## Approximate Inference

### EM for Mixtures
Clean, fast mixture fitting:
- Initialize with k-means++
- E-step: compute responsibilities
- M-step: weighted MLE updates
- Handles 1-4 components
- Auto-detects optimal k (planned)

### VI Engine
The workhorse for everything else:
- Black-box VI with reparameterization
- Adam optimizer
- Automatic differentiation
- Numerical stability throughout

## Adding New Algorithms

1. Extend base class:
```typescript
export class MyInference extends InferenceEngine {
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    // Your implementation
  }
}
```

2. Register in router:
```typescript
// In InferenceEngine.ts
if (this.canUseMyAlgorithm(modelType, data)) {
  return new MyInference().fit(data, options);
}
```

## Performance Tips

- **Batch operations** - Process multiple variants in parallel
- **Reuse posteriors** - Cache when parameters don't change
- **Profile first** - Most time is usually in sampling, not inference
- **Consider approximations** - Sometimes good enough is perfect

## Common Patterns

### Direct Usage (Rare)
```typescript
// Only for testing or special cases
const engine = new InferenceEngine();
const result = await engine.fit('beta-binomial', {
  data: { successes: 47, trials: 100 }
});
```

### With WebWorkers (Recommended)
```typescript
// This is how you'll actually use inference
const { runInference, isRunning, progress } = useInferenceWorker();

const result = await runInference(
  'compound-beta-lognormal',
  { data: userData },
  {
    priorParams: {
      frequency: { type: 'beta', params: [1, 1] },
      severity: { type: 'lognormal', params: [3, 1] }
    },
    onProgress: (p) => console.log(`${p.stage}: ${p.progress}%`)
  }
);
```

### Fit Options

```typescript
interface FitOptions {
  priorParams?: PriorSpec;     // Override default priors
  maxIterations?: number;      // For iterative algorithms
  tolerance?: number;          // Convergence threshold
  warmStart?: boolean;         // Use previous solution
  seed?: number;              // For reproducibility
  onProgress?: (p) => void;   // Progress callback
}
```

## Design Patterns & Future Considerations

### Distribution/Posterior Interface Pattern (For Future Consideration)

A useful pattern to consider for future extensibility is to define a core `Distribution` interface and have all posteriors implement or wrap it. For example:

```typescript
interface Distribution {
  logPdf(x: number): number;
  sample(): number;
  mean(): number;
  variance(): number;
}

interface Posterior extends Distribution {
  // Posterior-specific operations
  credibleInterval(level: number): [number, number];
  // ... other business methods
}

// Now posteriors can wrap ANY distribution
class PosteriorWrapper<T extends Distribution> implements Posterior {
  constructor(private dist: T) {}
  
  logPdf(x: number): number {
    return this.dist.logPdf(x);
  }
  
  // Add posterior semantics
  credibleInterval(level: number): [number, number] {
    // Implementation
  }
}
```

This approach gives you the best of both worlds: clean separation and no duplication. **However, do not implement this pattern without careful consideration**—it can introduce complexity and may not be necessary for all use cases. Evaluate the trade-offs for your specific needs before adopting this design.