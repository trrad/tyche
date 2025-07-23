# Core Statistical Components

This directory contains the fundamental statistical building blocks for Tyche.

## Current State

**What exists:**
- Distribution interfaces scattered in `vi-engine.ts`
- Beta distribution logic embedded in BetaBinomialVI class
- Numerical utilities mixed with inference code
- No actual distribution classes, just inference implementations

**Problems:**
- No reusable distribution primitives
- Numerical utilities buried in vi-engine.ts
- Tight coupling between distributions and inference

## Desired State

**Clear separation of concerns:**
```
core/
├── distributions/      # Probability distributions (mathematical objects)
│   ├── base/          # Abstract base classes
│   ├── Beta.ts
│   ├── Normal.ts
│   ├── Gamma.ts
│   ├── Exponential.ts
│   ├── LogNormal.ts
│   └── NegativeBinomial.ts
├── posteriors/        # Posterior distributions (inference results)
│   ├── base/          # Common interface for all posteriors
│   ├── BetaPosterior.ts
│   ├── GammaPosterior.ts
│   └── MixturePosterior.ts
└── utils/
    └── NumericalUtils.ts
```

**Distributions**: Mathematical objects with parameters
- Implement `logProb()`, `sample()`, `mean()`, `variance()`
- Immutable once created
- Know nothing about inference or data

**Posteriors**: Results of inference with business methods  
- Wrap distributions but add business interface
- Provide `credibleInterval()`, `probabilityGreaterThan()`
- Consistent API regardless of inference method used

## Design Principles

1. **Immutable distributions**: Once created, distribution parameters don't change
2. **Log-space computations**: Use log probabilities for numerical stability
3. **Validation at boundaries**: Check parameters in constructors, trust internally
4. **Minimal dependencies**: Only depend on jstat and numerical utils

## Migration Plan

### Phase 1: Extract existing code
- [ ] Move NumericalUtils out of vi-engine.ts
- [ ] Extract Distribution interface and expand to abstract class
- [ ] Create base posterior interface
- [ ] Keep VI framework (numerical stability work valuable)

### Phase 2: Implement distributions
- [ ] Beta (extract from BetaBinomialVI)
- [ ] Normal (new - needed for mixtures)
- [ ] Gamma (new - for compound models)
- [ ] Exponential (new - conjugate with Gamma)
- [ ] LogNormal (extract from ZILN, remove wrapper)
- [ ] NegativeBinomial (new - for count data)

### Phase 3: Cleanup
- [ ] Remove distribution logic from inference classes
- [ ] Update all imports
- [ ] Add comprehensive tests

## Usage Example (Future)

```typescript
import { Beta, Gamma } from './core/distributions';

// Create distributions
const prior = new Beta(1, 1);
const likelihood = new Gamma(2, 1);

// Use them
const logProb = prior.logProb(0.7);
const sample = prior.sample();
const mean = prior.mean();
```

## Not Including

- Multivariate distributions (future enhancement)
- Discrete distributions beyond NegativeBinomial
- Computation graph integration (being removed)
- Auto-differentiation (not needed for our approach)