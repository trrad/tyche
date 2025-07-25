# Inference Engine Architecture

This directory contains the core Bayesian inference implementations for Tyche, optimized for browser-based execution with a focus on revenue modeling.

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
├── compound/
│   ├── CompoundModel.ts        # Base for state→value models
│   └── implementations/
│       └── BetaLogNormalMixture.ts  # Default revenue model
└── InferenceEngine.ts         # Unified API with smart routing
```

## Inference Hierarchy

We follow a computational efficiency hierarchy:

1. **Conjugate Updates** (<10ms): Exact posterior computation for conjugate prior-likelihood pairs
2. **EM + Conjugate** (<500ms): Mixture models using weighted conjugate updates in the M-step
3. **Variational Inference** (future): For models without conjugate solutions

## Model Types

### Direct Models
Single distribution models for when you need to measure overall impact:
- LogNormal (revenue, time metrics)
- Gamma (positive continuous)
- Normal (general continuous)
- Beta (conversion rates)

### Compound Models
Decompose metrics into interpretable components:
- **State**: Beta (conversion/occurrence)
- **Value**: LogNormal Mixture (default), LogNormal, Gamma, or Normal

LogNormal Mixture with k=2-3 is the default for e-commerce revenue data, capturing typical customer segments (small basket vs bulk buyers).

### Mixture Models
For multimodal data within segments:
- LogNormal mixtures (1-4 components)
- Normal mixtures (1-4 components)

## Design Principles

### Base Interface
```typescript
abstract class InferenceEngine {
  abstract async fit(
    data: DataInput,
    options?: FitOptions
  ): Promise<InferenceResult>;
  
  protected validateInput(data: DataInput): void {
    // Common validation
  }
}
```

All inference engines implement this interface, with posteriors providing full distribution access via `mean()`, `variance()`, `sample()`, and `credibleInterval()`.

## Algorithm Selection Guide

```typescript
// The InferenceEngine automatically selects the best algorithm:
export class InferenceEngine {
  async fit(model: ModelType, data: DataInput): Promise<InferenceResult> {
    switch(model) {
      case 'beta-binomial':
        return new BetaBinomial();  // Exact conjugate
      
      case 'compound-revenue':  // Smart compound model
        const state = new BetaBinomial();
        const value = this.detectMultimodality(data) 
          ? new LogNormalMixtureEM(k=2)
          : new LogNormalBayesian();
        return new CompoundModel(state, value);
      
      case 'normal-mixture':
        return new NormalMixtureEM();  // EM for mixtures
      
      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }
}
```

## Migration Plan

### Phase 1: Extract from vi-engine.ts
- [ ] Move types to `base/types.ts`
- [ ] Extract BetaBinomialVI → `exact/conjugate/BetaBinomial.ts`
- [ ] Extract NormalMixtureEM → `approximate/em/NormalMixtureEM.ts`
- [ ] Extract VI framework → `approximate/vi/cpu/VariationalInference.ts` (keep for future use)
- [ ] Delete ZeroInflatedLogNormalVI (using compound models instead)

### Phase 2: Create clean interfaces
- [ ] Implement base InferenceEngine class
- [ ] Add ConjugateInference base for exact updates
- [ ] Add EMAlgorithm base for EM variants
- [ ] Add CompoundModel base for state→value models

### Phase 3: New algorithms
- [ ] LogNormal with Normal-Inverse-Gamma conjugate
- [ ] LogNormalMixtureEM for revenue
- [ ] GammaExponential conjugate
- [ ] NormalKnownVariance conjugate

## Numerical Considerations

- **Sufficient Statistics**: Currently stored at each node for conjugate efficiency. Future versions may use index-based storage to support VI.
- **Log-space Computation**: Used throughout for numerical stability
- **Streaming Updates**: Conjugate models support incremental computation for large datasets

## Not Including

- MCMC algorithms (too slow for browser)
- Black-box variational inference (overkill for our use cases)
- Hamiltonian Monte Carlo (requires autodiff)
- Nested sampling (too complex)

## Performance Targets

- Conjugate updates: < 1ms
- EM (100 iterations): < 100ms for 1000 points
- VI (1000 iterations): < 1s for simple models
- All algorithms: < 5s for 10,000 data points