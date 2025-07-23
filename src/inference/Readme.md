# Inference Algorithms

This directory contains all statistical inference implementations for Tyche.

## Current State

**What exists:**
- All inference logic in monolithic `vi-engine.ts`:
  - `BetaBinomialVI` class (conjugate update)
  - `NormalMixtureEM` class (EM algorithm)  
  - `ZeroInflatedLogNormalVI` class (gradient-based VI)
- Single `VariationalInferenceEngine` class routing between them

**Problems:**
- 1000+ lines in single file
- Mixed abstraction levels (conjugate updates with complex VI)
- No clear interface between inference methods
- Hard to add new algorithms

## Desired State

**Clean separation by inference type:**
```
inference/
├── base/
│   ├── InferenceEngine.ts      # Abstract base class
│   └── types.ts                # DataInput, VIResult, etc.
├── exact/
│   ├── conjugate/
│   │   ├── ConjugateInference.ts
│   │   ├── BetaBinomial.ts
│   │   └── GammaExponential.ts
│   └── closed-form/
│       └── NormalKnownVariance.ts
├── approximate/
│   ├── em/
│   │   ├── EMAlgorithm.ts
│   │   ├── NormalMixtureEM.ts      # 1-4 component mixtures
│   │   └── LogNormalMixtureEM.ts   # For heavy-tail revenue
│   └── vi/
│       ├── cpu/
│       │   ├── VariationalInference.ts
│       │   └── optimizers/
│       └── gpu/                # Future WebGL/WebGPU
└── InferenceEngine.ts         # Unified API with smart routing
```

## Design Principles

### Base Interface
```typescript
abstract class InferenceEngine {
  abstract async fit(
    data: DataInput,
    options?: FitOptions
  ): Promise<VIResult>;
  
  protected validateInput(data: DataInput): void {
    // Common validation
  }
}
```

### Inference Categories

#### Exact Inference
- **When**: Conjugate prior-likelihood pairs
- **Why**: Fastest, most accurate
- **Examples**: Beta-Binomial, Gamma-Exponential

#### Approximate Inference
- **When**: No conjugate solution exists
- **Why**: Handles complex models
- **Types**:
  - **EM**: For mixture models
  - **VI**: For high-dimensional problems

## Migration Plan

### Phase 1: Extract from vi-engine.ts
- [ ] Move types to `base/types.ts`
- [ ] Extract BetaBinomialVI → `exact/conjugate/BetaBinomial.ts`
- [ ] Extract NormalMixtureEM → `approximate/em/NormalMixtureEM.ts`
- [ ] Extract VI framework → `approximate/vi/cpu/VariationalInference.ts` (keep for future use)
- [ ] Delete ZeroInflatedLogNormalVI (using two-part models instead)

### Phase 2: Create clean interfaces
- [ ] Implement base InferenceEngine class
- [ ] Add ConjugateInference base for exact updates
- [ ] Add EMAlgorithm base for EM variants

### Phase 3: New algorithms
- [ ] GammaExponential conjugate
- [ ] NormalKnownVariance conjugate
- [ ] Future: Laplace approximation

## Algorithm Selection Guide

```typescript
// The InferenceEngine automatically selects the best algorithm:
export class InferenceEngine {
  async fit(model: ModelType, data: DataInput): Promise<InferenceResult> {
    switch(model) {
      case 'beta-binomial':
        return new BetaBinomial();  // Exact conjugate
      
      case 'gamma-exponential':
        return new GammaExponential();  // Exact conjugate
      
      case 'revenue':  // Smart selection based on data
        if (this.hasMultipleModes(data)) {
          return new LogNormalMixtureEM();  // EM for heavy-tail mixtures
        } else if (this.isGammaLike(data)) {
          return new GammaConjugate();     // Simple conjugate
        } else {
          return new LogNormalEM();        // Single mode heavy-tail
        }
      
      case 'normal-mixture':
        return new NormalMixtureEM();  // EM for mixtures
      
      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }
}
```

## Not Including

- MCMC algorithms (too slow for browser)
- Black-box variational inference (overkill)
- Hamiltonian Monte Carlo (requires autodiff)
- Nested sampling (too complex)

## Performance Targets

- Conjugate updates: < 1ms
- EM (100 iterations): < 100ms for 1000 points
- VI (1000 iterations): < 1s for simple models
- All algorithms: < 5s for 10,000 data points