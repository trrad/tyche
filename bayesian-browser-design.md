# Bayesian Browser Library - Design Summary

## Project Vision
A TypeScript-based Bayesian inference library optimized for experimental design and power analysis, running entirely in the browser with GPU acceleration. The library prioritizes accessibility for business users while maintaining statistical rigor under the hood.

## Core Architecture

### 1. RandomVariable<T> - The Foundation
```typescript
// Core primitive that tracks computational dependencies
class RandomVariable<T> {
  // Enables automatic differentiation
  // Supports operator overloading for natural math syntax
  // Handles shape inference and broadcasting automatically
}
```

### 2. Three-Layer API Design

#### Layer 1: Business User API (Dead Simple)
```typescript
const test = new ABTest({
  control: { size: 1000, rate: 0.10 },
  treatment: { size: 1000, rate: 0.12 }
});

const result = await test.analyze();
// Returns: "75% chance treatment is better. Need 2,000 more users for 95% confidence."
```

#### Layer 2: Data Scientist API (Flexible)
```typescript
const model = new BayesianABTest({
  prior: beta(10, 190),  // Informative prior
  allocation: "adaptive",
  earlyStop: true
});

const posterior = await model.fit(data);
// Returns: Full posterior with samples, HDI, probability of improvement
```

#### Layer 3: Statistician API (Full Control)
```typescript
const theta = beta(1, 1);
const observations = binomial(n, theta);
const posterior = await infer(model, data, {
  algorithm: "NUTS",
  chains: 4,
  diagnostics: "extensive"
});
```

### 3. Computation Strategy

#### Phase 1 Focus:
- **CPU-based** automatic differentiation in TypeScript
- **WebWorker** parallelization for multiple chains
- **WebGL** preparation (infrastructure only)
- **Simple samplers** (Metropolis-Hastings) for validation

#### Future Phases:
- WebGL compute shaders for likelihood evaluation
- GPU-accelerated gradient computation
- Parallel scenario evaluation for power analysis

### 4. Key Design Decisions

**Automatic Differentiation First**
- Build a lightweight AD system optimized for statistical models
- Support forward and reverse mode
- Track computational graph for all RandomVariable operations

**Diagnostics as First-Class Citizens**
- Every sampling operation returns diagnostics
- Automatic diagnostic checking with smart user messaging
- Hidden complexity: users see guidance, not technical warnings

**Progressive Enhancement**
- Works on any modern browser (CPU fallback)
- Automatically uses WebGL when available
- Graceful degradation for older browsers

**TypeScript Throughout**
- Full type safety for model specification
- Intellisense support for discovery
- Compile-time error checking

## Phase 1 Implementation Plan (2-3 weeks)

### Week 1: Core Infrastructure
1. **RandomVariable<T>** base class with AD support
2. **ComputationGraph** for tracking dependencies
3. **Basic distributions**: Uniform, Normal, Beta, Binomial
4. **Operator overloading** for natural math syntax

### Week 2: Sampling and Testing
1. **Metropolis-Hastings** sampler implementation
2. **WebWorker** parallel chain infrastructure
3. **Basic diagnostics**: R-hat, ESS, acceptance rate
4. **Test suite** with known models

### Week 3: API and Polish
1. **ABTest** high-level class
2. **Diagnostic translation** layer
3. **Basic visualizations** (histograms, traces)
4. **Documentation** and examples

## Technical Stack

- **Language**: TypeScript 5.0+
- **Build**: Vite or esbuild for fast development
- **Testing**: Vitest for unit tests
- **Bundling**: Tree-shakeable ES modules
- **Dependencies**: Minimal (possibly just d3 for viz)

## File Structure
```
src/
  core/
    RandomVariable.ts      // Base abstraction
    ComputationGraph.ts    // AD implementation
    distributions/         // Distribution implementations
      Beta.ts
      Normal.ts
      Binomial.ts
  samplers/
    Metropolis.ts         // Basic MCMC
    Diagnostics.ts        // Convergence checks
  api/
    ABTest.ts            // High-level API
    ExperimentDesign.ts  // Power analysis
  utils/
    parallel.ts          // WebWorker management
    math.ts             // Numerical utilities
```

## Key Differentiators

1. **Browser-First**: No server required, instant startup
2. **GPU-Ready**: Architecture designed for WebGL acceleration
3. **Accessible**: Business users can use it without statistics knowledge
4. **Rigorous**: Full Bayesian inference under the hood
5. **Interactive**: Real-time feedback for experiment design

## Open Questions for Review

1. **Distribution Priority**: Should we include Poisson/Gamma in Phase 1 for revenue models?
2. **API Naming**: Is `ABTest` too limiting? Consider `ExperimentalAnalysis`?
3. **Diagnostic Defaults**: Hide all technical warnings by default, or have a "developer mode"?
4. **WebGL Timeline**: Should we prototype GPU kernels in Phase 1 or wait?
5. **Package Name**: What should we call this library?

## Next Steps
Once you approve the overall design, we'll implement:
1. Core RandomVariable class with AD
2. Basic Beta-Binomial model as proof of concept
3. Simple Metropolis sampler
4. Minimal ABTest API wrapper