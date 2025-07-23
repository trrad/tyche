# Probability Distributions

Core probability distributions for Tyche's inference engine.

## Current State

**What exists:**
- Beta distribution logic embedded in `BetaBinomialVI` class in vi-engine.ts
- LogNormal logic embedded in `ZeroInflatedLogNormalVI` class (extract LogNormal, remove ZI wrapper)
- Normal distribution partially implemented for mixture components
- No standalone distribution classes

**Problems:**
- Can't reuse distributions across different inference methods
- No consistent interface
- Missing key distributions (Gamma, standalone Normal)
- Zero-inflation mixed with base distributions

## Desired State

**Clean distribution hierarchy:**
```typescript
abstract class Distribution {
  abstract logProb(x: number | number[]): number;
  abstract sample(rng?: Random): number | number[];
  abstract mean(): number;
  abstract variance(): number;
  abstract support(): { min: number; max: number };
}

class ContinuousDistribution extends Distribution {
  abstract pdf(x: number): number;
  abstract cdf(x: number): number;
}

class DiscreteDistribution extends Distribution {
  abstract pmf(x: number): number;
}
```

## Implementation Status

### 📅 To Implement (Week 1)

#### Beta Distribution
- **Current**: Logic in BetaBinomialVI.computeELBO()
- **Desired**: Standalone `Beta.ts`
- **Use case**: Conversion rate priors/posteriors

#### Normal Distribution  
- **Current**: Minimal implementation in NormalMixtureEM
- **Desired**: Full `Normal.ts` with log-space stability
- **Use case**: Mixture components, future hierarchical models

#### Gamma Distribution
- **Current**: Doesn't exist
- **Desired**: Shape-rate parameterization
- **Use case**: Positive continuous values (time, revenue)

#### Exponential Distribution
- **Current**: Doesn't exist
- **Desired**: Conjugate pair with Gamma
- **Use case**: Time between events, simple waiting times

#### LogNormal Distribution
- **Current**: Embedded in ZeroInflatedLogNormalVI (extract core, remove ZI wrapper)
- **Desired**: Standalone `LogNormal.ts` with stable log-space operations
- **Use case**: Revenue/value modeling in compound models

#### Negative Binomial Distribution
- **Current**: Doesn't exist  
- **Desired**: For overdispersed count data
- **Use case**: Future - modeling repeat purchases

### ❌ Not Implementing
- Zero-Inflated LogNormal (using two-part models instead - Beta + LogNormal)
- Other zero-inflated distributions
- Multivariate distributions (future enhancement)
- Exotic distributions (Pareto, etc.)

## Design Guidelines

### Parameter Validation
```typescript
class Gamma extends ContinuousDistribution {
  constructor(
    private shape: number,  // α > 0
    private rate: number    // β > 0
  ) {
    super();
    if (shape <= 0) throw new Error('Shape must be positive');
    if (rate <= 0) throw new Error('Rate must be positive');
  }
}
```

### Numerical Stability
- Always implement `logProb()` natively (not as `log(prob())`)
- Use log-gamma functions from NumericalUtils
- Handle edge cases explicitly

### Sampling
- Use jstat where available
- Implement inverse transform or rejection sampling as needed
- Accept optional RNG for reproducibility

## Example Implementation Pattern

```typescript
import { ContinuousDistribution } from './base';
import { NumericalUtils } from '../utils';
import jStat from 'jstat';

export class Gamma extends ContinuousDistribution {
  constructor(
    private shape: number,
    private rate: number
  ) {
    super();
    this.validateParameters();
  }

  logProb(x: number): number {
    if (x <= 0) return -Infinity;
    
    return (this.shape - 1) * Math.log(x) 
         - this.rate * x 
         + this.shape * Math.log(this.rate)
         - NumericalUtils.logGamma(this.shape);
  }

  sample(): number {
    return jStat.gamma.sample(this.shape, 1 / this.rate);
  }

  mean(): number {
    return this.shape / this.rate;
  }

  variance(): number {
    return this.shape / (this.rate * this.rate);
  }

  support() {
    return { min: 0, max: Infinity };
  }
}
```

## Testing Requirements

Each distribution needs:
1. **Moment tests**: Empirical mean/variance match theoretical
2. **Log probability tests**: Known values, edge cases
3. **Sampling tests**: Stays within support, follows distribution
4. **Parameter validation tests**: Rejects invalid parameters
5. **Numerical stability tests**: Extreme values don't break