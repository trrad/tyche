# Exact Inference Methods

Closed-form and conjugate inference algorithms that provide exact posterior distributions.

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
│   ├── GammaExponential.ts      # Gamma prior + Exponential likelihood
│   ├── GammaGamma.ts            # Gamma prior + Gamma likelihood
│   └── NormalNormal.ts          # Normal prior + Normal likelihood
└── closed-form/
    └── NormalKnownVariance.ts   # When variance is known
```

## Conjugate Pairs We Support

### Beta-Binomial
- **Prior**: Beta(α, β)
- **Likelihood**: Binomial(n, p)
- **Posterior**: Beta(α + successes, β + failures)
- **Use case**: Conversion rates

### Gamma-Exponential  
- **Prior**: Gamma(α, β)
- **Likelihood**: Exponential(λ)
- **Posterior**: Gamma(α + n, β + Σx)
- **Use case**: Time between events, waiting times

### Gamma-Gamma
- **Prior**: Gamma(α, β)  
- **Likelihood**: Gamma(shape known, rate unknown)
- **Posterior**: Gamma(α + n×shape, β + Σx)
- **Use case**: Positive continuous values when shape is stable

### Normal-Normal (Known Variance)
- **Prior**: Normal(μ₀, τ₀)
- **Likelihood**: Normal(μ, σ²) with σ² known
- **Posterior**: Normal(μ_post, τ_post)
- **Use case**: Future hierarchical models

## Implementation Pattern

```typescript
abstract class ConjugateInference extends InferenceEngine {
  abstract updatePosterior(
    priorParams: number[],
    data: SufficientStats
  ): number[];
  
  async fit(data: DataInput, options?: FitOptions): Promise<VIResult> {
    const stats = this.computeSufficientStats(data);
    const priorParams = this.getDefaultPrior(options);
    const posteriorParams = this.updatePosterior(priorParams, stats);
    
    return {
      posterior: this.createPosterior(posteriorParams),
      diagnostics: {
        converged: true,  // Always true for conjugate
        iterations: 1,    // Single update
        finalELBO: this.computeELBO(posteriorParams, stats)
      }
    };
  }
}
```

### Example: Beta-Binomial

```typescript
export class BetaBinomial extends ConjugateInference {
  updatePosterior(
    priorParams: [number, number],  // [α, β]
    stats: { successes: number; failures: number }
  ): [number, number] {
    return [
      priorParams[0] + stats.successes,
      priorParams[1] + stats.failures
    ];
  }
  
  computeSufficientStats(data: DataInput): { successes: number; failures: number } {
    if ('successes' in data.data && 'trials' in data.data) {
      return {
        successes: data.data.successes,
        failures: data.data.trials - data.data.successes
      };
    }
    // Handle raw data format...
  }
}
```

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

## Not Implementing

- Conjugate pairs we don't need (Dirichlet-Multinomial, etc.)
- Complex sufficient statistics (exponential families)
- Natural parameter representations (not needed)