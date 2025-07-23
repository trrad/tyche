# Numerical Utilities

Shared numerical computation utilities for stability and efficiency.

## Current State

**What exists:**
- `NumericalUtils` class in vi-engine.ts with:
  - `logSumExp()` - numerically stable log-sum-exp
  - `clipGradient()` - gradient clipping
  - `logGamma()` - log gamma function
  - `logBeta()` - log beta function
  - `safeLog()` - log with bounds checking

**Problems:**
- Buried inside vi-engine.ts
- Not independently testable
- Missing some useful utilities

## Desired State

**Standalone numerical utilities:**
```
utils/
├── NumericalUtils.ts    # Core numerical functions
├── RandomUtils.ts       # Future: random number utilities
└── ValidationUtils.ts   # Future: parameter validation
```

## Core Utilities

### NumericalUtils (to extract)

```typescript
export class NumericalUtils {
  /**
   * Numerically stable log-sum-exp
   * log(sum(exp(x_i))) without overflow/underflow
   */
  static logSumExp(logValues: number[]): number;
  
  /**
   * Gradient clipping to prevent explosions
   */
  static clipGradient(grad: number[], maxNorm: number): number[];
  
  /**
   * Special functions using jStat
   */
  static logGamma(x: number): number;
  static logBeta(a: number, b: number): number;
  static digamma(x: number): number;  // Add: derivative of logGamma
  
  /**
   * Safe operations
   */
  static safeLog(x: number): number;
  static safeDivide(a: number, b: number, default: number): number;  // Add
  
  /**
   * Numerical derivatives (for finite differences)
   */
  static finiteDifference(  // Add
    f: (x: number[]) => number,
    x: number[],
    h: number = 1e-5
  ): number[];
}
```

### SyntheticDataGenerator (Phase 1.2)

```typescript
export class SyntheticDataGenerator {
  /**
   * Generate data with known ground truth for testing
   */
  static generateFromDistribution(
    dist: Distribution,
    n: number,
    seed?: number
  ): number[];
  
  /**
   * Business scenario generators
   */
  static generateEcommerceExperiment(config: {
    baseConversion: number;
    treatmentLift: number;
    revenueDistribution: 'gamma' | 'lognormal';
    sampleSize: number;
  }): ExperimentData;
  
  static generateSaaSExperiment(config: {
    baseRetention: number;
    featureAdoptionRate: number;
    sampleSize: number;
  }): ExperimentData;
  
  /**
   * HTE test scenarios
   */
  static generateWithHiddenSegment(config: {
    mainEffect: number;
    segmentEffect: number;
    segmentFeature: string;
    segmentSize: number;
  }): ExperimentData;
}
```

### Future: RandomUtils

```typescript
export class RandomUtils {
  /**
   * Sampling utilities beyond what jStat provides
   */
  static sampleDirichlet(alpha: number[]): number[];
  static sampleCategorical(probs: number[]): number;
  
  /**
   * Random number generation helpers
   */
  static setSeed(seed: number): void;
  static getRandomGenerator(): Random;
}
```

### Future: BootstrapUtils

```typescript
export class BootstrapUtils {
  /**
   * Bootstrap sampling for causal trees
   */
  static bootstrapSample<T>(
    data: T[],
    size?: number,
    seed?: number
  ): T[];
  
  /**
   * Stratified bootstrap for experiments
   */
  static stratifiedBootstrap<T>(
    data: T[],
    strata: (item: T) => string,
    seed?: number
  ): T[];
  
  /**
   * Parallel bootstrap via Web Workers
   */
  static parallelBootstrap<T, R>(
    data: T[],
    statistic: (sample: T[]) => R,
    iterations: number,
    workers?: number
  ): Promise<R[]>;
}
```

### Future: ValidationUtils

```typescript
export class ValidationUtils {
  /**
   * Parameter validation helpers
   */
  static checkPositive(x: number, name: string): void;
  static checkProbability(p: number, name: string): void;
  static checkFinite(x: number, name: string): void;
  static checkShape(array: any[], expected: number[], name: string): void;
}
```

## Numerical Stability Patterns

### Log-space computations
Always prefer log-space when dealing with probabilities:
```typescript
// Bad: prone to underflow
const p = prob1 * prob2 * prob3;

// Good: stable
const logP = logProb1 + logProb2 + logProb3;
```

### Avoiding catastrophic cancellation
```typescript
// Bad: loss of precision
const x = 1e10;
const y = 1e10 + 1;
const diff = y - x;  // May be 0 due to floating point

// Good: reformulate
const diff = 1;  // Direct computation when possible
```

### Gradient clipping
Essential for optimization stability:
```typescript
// Prevent gradient explosion
const clipped = NumericalUtils.clipGradient(gradient, maxNorm = 10);
```

## Testing Strategy

1. **Accuracy tests**: Compare to known values
2. **Stability tests**: Extreme inputs don't break
3. **Edge cases**: Empty arrays, infinities, NaN
4. **Performance tests**: No unnecessary allocations

## Dependencies

- **jStat**: For special functions (gamma, beta)
- **No other dependencies**: Keep it lightweight

## Not Including

- Matrix operations (use external library if needed)
- Complex numbers (not needed for our models)
- Arbitrary precision (JavaScript limitations)
- Symbolic math (out of scope)