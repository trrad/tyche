# Approximate Inference Methods

Iterative algorithms for models without closed-form solutions.

## Current State

**What exists:**
- `NormalMixtureEM` in vi-engine.ts - working EM for 2-component mixtures
- VI framework with ELBO computation and numerical stability (keeping!)
- `ZeroInflatedLogNormalVI` in vi-engine.ts (to be removed - using two-part models)
- Adam optimizer in separate file

**Problems:**
- EM implementation mixed with other code
- VI used for zero-inflation (not needed with two-part approach)
- No clear base classes for algorithm families

## Desired State

**Two main algorithm families:**
```
approximate/
├── em/
│   ├── EMAlgorithm.ts           # Base EM class
│   ├── NormalMixtureEM.ts       # 2-4 component mixtures
│   └── GammaMixtureEM.ts        # Future: for multimodal revenue
└── vi/
    ├── cpu/
    │   ├── VariationalInference.ts  # Base VI class
    │   ├── optimizers/
    │   │   ├── Optimizer.ts         # Base interface
    │   │   └── AdamOptimizer.ts    # Existing Adam
    │   └── models/
    │       └── [Future VI models]
    └── gpu/
        └── [Future WebGL/WebGPU]
```

## Algorithm Details

### EM (Expectation-Maximization)

**When to use**: 
- Mixture models with 1-4 components
- Heavy-tail distributions (LogNormal mixtures)
- Clear cluster structure
- CPU-bound is fine

**Current implementation (NormalMixtureEM)**:
- Supports 1-4 component mixtures
- K-means++ initialization
- Stable log-space computations
- Automatic convergence detection
- Handles degenerate cases

**Planned additions**:
- `LogNormalMixtureEM` for revenue distributions with multiple modes
- Uses EM by default (more stable than VI for mixtures)
- VI only when GPU parallelization needed

**Pattern**:
```typescript
abstract class EMAlgorithm extends InferenceEngine {
  abstract eStep(data: number[], params: any): any;
  abstract mStep(data: number[], responsibilities: any): any;
  
  async fit(data: DataInput, options?: FitOptions): Promise<VIResult> {
    let params = this.initialize(data);
    
    for (let iter = 0; iter < maxIterations; iter++) {
      const resp = this.eStep(data, params);
      const newParams = this.mStep(data, resp);
      
      if (this.hasConverged(params, newParams)) break;
      params = newParams;
    }
    
    return this.createResult(params);
  }
}
```

### VI (Variational Inference)

**When to use**:
- Models without conjugate or EM solutions
- Future GPU parallelization (power analysis with 100k+ sims)
- When EM's sequential nature becomes a bottleneck

**Current implementation to keep**:
- ELBO computation framework
- Numerical stability (log-sum-exp, gradient clipping)
- Adam optimizer integration
- Finite difference gradients

**To remove**:
- ZeroInflatedLogNormalVI specifically (using compound models instead)

**Design philosophy**:
- Keep as foundation for future GPU work
- EM preferred for CPU-based mixture inference
- VI shines when we can parallelize gradient computations

## Performance Characteristics

### EM Algorithm
- **Iterations**: 20-100 typical
- **Per iteration**: O(n × k) for k components
- **Total time**: 50-200ms for 1000 points

### VI (Future)
- **Iterations**: 500-2000 typical  
- **Per iteration**: O(p × s) for p parameters, s samples
- **Total time**: 0.5-2s for moderate problems

## Numerical Stability

### Critical for EM:
```typescript
// Log-sum-exp trick
function logSumExp(logValues: number[]): number {
  const maxVal = Math.max(...logValues);
  const shifted = logValues.map(x => x - maxVal);
  const sumExp = shifted.reduce((sum, x) => sum + Math.exp(x), 0);
  return maxVal + Math.log(sumExp);
}

// Regularization
covMatrix[i][i] += 1e-6;  // Prevent singular covariance
```

### Critical for VI:
```typescript
// Gradient clipping
const clipped = grad.map(g => Math.max(-10, Math.min(10, g)));

// Adaptive learning rate
if (elbo < prevElbo) learningRate *= 0.5;
```

## Testing Requirements

1. **Convergence tests**: Algorithm stops appropriately
2. **Recovery tests**: Known parameters recoverable
3. **Stability tests**: No NaN/Inf in edge cases
4. **Performance tests**: Meet timing targets

## Not Implementing

- Stochastic VI (minibatches) - our datasets fit in memory
- Natural gradients - too complex for benefit
- Structured VI - mean-field sufficient
- ADVI (automatic differentiation VI) - overkill