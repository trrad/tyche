# Posterior Distributions

Wrappers that provide business-friendly interfaces to distributions resulting from inference.

## Purpose

While `Distribution` objects are pure mathematical constructs, `Posterior` objects represent the results of Bayesian inference with methods useful for decision-making.

## Design

```typescript
// Mathematical distribution - just the math
class Beta extends Distribution {
  constructor(public alpha: number, public beta: number) {}
  mean(): number { return this.alpha / (this.alpha + this.beta); }
  sample(): number { /* mathematical sampling */ }
}

// Posterior - inference result with business methods
class BetaPosterior implements Posterior {
  constructor(private distribution: Beta) {}
  
  // Standard posterior interface
  mean(): number[] { 
    return [this.distribution.mean()]; 
  }
  
  credibleInterval(level: number): Array<[number, number]> {
    const alpha = (1 - level) / 2;
    return [[
      this.distribution.quantile(alpha),
      this.distribution.quantile(1 - alpha)
    ]];
  }
  
  // Business-specific methods
  probabilityGreaterThan(threshold: number): number {
    return 1 - this.distribution.cdf(threshold);
  }
  
  probabilityOfPracticalSignificance(mde: number): number {
    return this.probabilityGreaterThan(mde);
  }
}
```

## Common Interface

All posteriors implement:

```typescript
interface Posterior {
  // Point estimates
  mean(): number[];
  variance(): number[];
  
  // Uncertainty quantification  
  sample(): number[];
  credibleInterval(level: number): Array<[number, number]>;
  
  // Decision support
  probabilityGreaterThan?(threshold: number): number;
}
```

## Posterior Types

### Analytical Posteriors
For conjugate updates where we know the closed form:
- `BetaPosterior` - wraps Beta distribution
- `GammaPosterior` - wraps Gamma distribution  
- `NormalPosterior` - wraps Normal distribution

### Sample-Based Posteriors
For complex posteriors represented by samples:
- `MixturePosterior` - weighted combination of components
- `EmpiricalPosterior` - arbitrary samples from VI/MCMC

### Compound Posteriors
For compound models:
- `CompoundPosterior<F, S>` - combines frequency and severity
- Methods compute business metrics like revenue per user

## Usage Example

```typescript
// After inference
const betaDist = new Beta(successCount + 1, failureCount + 1);
const posterior = new BetaPosterior(betaDist);

// Business decisions
const significant = posterior.probabilityGreaterThan(0.02) > 0.95;
const ci = posterior.credibleInterval(0.95);
console.log(`95% CI: [${ci[0][0].toFixed(3)}, ${ci[0][1].toFixed(3)}]`);
```

## Key Benefits

1. **Consistent API**: Same interface whether conjugate, VI, or EM
2. **Business methods**: Not just parameters but actionable insights
3. **Type safety**: Know what kind of posterior you're working with
4. **Extensible**: Easy to add new posterior types