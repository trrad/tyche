# Conjugate Inference Implementations

Exact Bayesian inference using conjugate prior-likelihood pairs. These provide closed-form posterior updates without requiring iterative algorithms.

## Current State

**What exists:**
- `BetaBinomialVI` in vi-engine.ts (misnamed - it's actually exact conjugate)
- Logic mixed with VI infrastructure

**Problems:**
- Conjugate update logic tangled with VI abstractions
- No other conjugate pairs implemented
- Not leveraging the speed advantage of exact inference

## Desired State

**Conjugate pairs with closed-form updates:**
```
exact/
├── conjugate/
│   ├── ConjugateInference.ts    # Base class
│   ├── BetaBinomial.ts          # Beta prior + Binomial likelihood
│   ├── LogNormalNIG.ts          # LogNormal with Normal-Inverse-Gamma prior
│   ├── GammaExponential.ts      # Gamma prior + Exponential likelihood
│   ├── GammaGamma.ts            # Gamma prior + Gamma likelihood
│   ├── PoissonGamma.ts          # Gamma prior + Poisson likelihood
│   └── NormalNormal.ts          # Normal prior + Normal likelihood
└── closed-form/
    └── NormalKnownVariance.ts   # When variance is known
```

## Conjugate Pairs We Support

### LogNormal-NormalInverseGamma (Implemented)
- **Prior**: Normal-Inverse-Gamma(μ₀, λ, α, β) on (μ, σ²)
- **Data**: Positive values with potential heavy tails
- **Posterior**: Normal-Inverse-Gamma with updated parameters
- **Use Case**: Revenue, time-on-site, any positive skewed data

### Beta-Binomial
- **Prior**: Beta(α, β)
- **Likelihood**: Binomial(n, p)
- **Posterior**: Beta(α + successes, β + failures)
- **Use Case**: Conversion rates, click-through rates

### Gamma-Exponential (Planned)
- **Prior**: Gamma(α, β)
- **Likelihood**: Exponential(λ)
- **Posterior**: Gamma(α + n, β + Σx)
- **Use Case**: Time between events, waiting times

### Gamma-Gamma (Planned)
- **Prior**: Gamma(α, β) on rate parameter
- **Likelihood**: Gamma(shape known, rate unknown)
- **Posterior**: Gamma(α + n×shape, β + Σx)
- **Use Case**: Positive continuous values when shape is stable

### Poisson-Gamma (Planned)
- **Prior**: Gamma(α, β) on rate λ
- **Likelihood**: Poisson(λ)
- **Posterior**: Gamma(α + Σx, β + n)
- **Use Case**: Count data (purchases per customer)
- **Note**: Posterior predictive is Negative Binomial

### Normal-Normal (Known Variance) (Planned)
- **Prior**: Normal(μ₀, τ₀)
- **Likelihood**: Normal(μ, σ²) with σ² known
- **Posterior**: Normal(μ_post, τ_post)
- **Use Case**: Future hierarchical models

## Mixture Model Integration

Conjugate updates work within EM algorithm iterations:

1. **E-step**: Compute responsibilities γᵢₖ for each point/component
2. **M-step**: Update each component using weighted conjugate formulas
   - Treat γᵢₖ as fractional observations
   - Effective sample size: n_k = Σᵢ γᵢₖ
   - All conjugate formulas remain valid with fractional n

Example for LogNormal mixture:
```javascript
// In M-step for component k
const n_k = weights.reduce((sum, w) => sum + w, 0);
const weightedMean = weights.reduce((sum, w, i) => 
  sum + w * logData[i], 0) / n_k;

// Standard NIG update with fractional n
const posteriorLambda = prior.lambda + n_k;
const posteriorMu0 = (prior.lambda * prior.mu0 + n_k * weightedMean) / posteriorLambda;
// ... etc
```

## Implementation Pattern

```typescript
abstract class ConjugateInference extends InferenceEngine {
  abstract updatePosterior(
    priorParams: number[],
    data: SufficientStats
  ): number[];
  
  async fit(data: DataInput, options?: FitOptions): Promise<InferenceResult> {
    const stats = this.computeSufficientStats(data);
    const priorParams = this.getDefaultPrior(options);
    const posteriorParams = this.updatePosterior(priorParams, stats);
    
    return {
      posterior: this.createPosterior(posteriorParams),
      diagnostics: {
        converged: true,  // Always true for conjugate
        iterations: 1,    // Single update
        runtime: 0
      }
    };
  }
}
```

## Streaming Computation

Conjugate models naturally support batch processing:

```javascript
// Process large datasets in chunks
const batchSize = 100000;
let runningStats = initializeSufficientStats();

for (let i = 0; i < data.length; i += batchSize) {
  const batch = data.slice(i, i + batchSize);
  const batchStats = computeSufficientStats(batch);
  runningStats = mergeSufficientStats(runningStats, batchStats);
}

const posterior = conjugateUpdate(prior, runningStats);
```

This approach enables processing millions of observations with constant memory usage.

## Why Exact Inference Matters

1. **Speed**: Instant updates vs iterative algorithms
2. **Accuracy**: No approximation error
3. **Interpretability**: Posterior has same form as prior
4. **Numerical stability**: No optimization needed

## Testing Strategy

For each conjugate pair:
1. **Analytical tests**: Posterior parameters match theory
2. **Moment tests**: Posterior mean/variance are correct
3. **Edge cases**: Zero observations, extreme parameters
4. **Prior recovery**: Flat prior + data recovers MLE