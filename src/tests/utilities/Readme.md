# Testing Utilities

Synthetic data generation and testing infrastructure for Tyche.

## Purpose (Phase 1.2)

Generate realistic synthetic data with known ground truth for:
- Parameter recovery validation
- Performance benchmarking  
- Demo applications
- Integration testing

## Planned Structure

```
testing/
├── synthetic/
│   ├── DataGenerator.ts         # Base synthetic data utilities
│   ├── BusinessScenarios.ts     # E-commerce, SaaS patterns
│   └── HTEScenarios.ts         # Hidden segment generation
└── validation/
    ├── ParameterRecovery.ts     # Can we recover true params?
    └── InferenceValidation.ts   # Are posteriors calibrated?
```

## Synthetic Data Generators

### Core Generator

```typescript
export class SyntheticDataGenerator {
  // Generate from known distributions
  static generateFromDistribution(
    dist: Distribution,
    n: number,
    seed?: number
  ): number[];
  
  // Generate experiment data
  static generateExperiment(config: {
    control: Distribution;
    treatment: Distribution;
    sampleSize: number;
    allocation?: number;
  }): ExperimentData;
}
```

### Business Scenarios

```typescript
export class BusinessScenarios {
  // E-commerce: compound model with treatment effects
  static ecommerce(config: {
    baseConversionRate: number;      // e.g., 0.03
    conversionLift: number;          // e.g., 0.10 (relative)
    revenueDistribution: 'gamma' | 'lognormal';
    revenueLift: number;             // e.g., 0.05
    sampleSize: number;
  }): ExperimentData;
  
  // SaaS: user retention and feature adoption
  static saas(config: {
    baseRetention: number;
    retentionLift: number;
    featureUsage: 'poisson' | 'negative-binomial';
    sampleSize: number;
  }): ExperimentData;
}
```

### HTE Scenarios

```typescript
export class HTEScenarios {
  // Hidden segment with different treatment effect
  static hiddenSegment(config: {
    mainEffect: number;         // Effect for majority
    segmentEffect: number;      // Effect for segment
    segmentFeature: string;     // e.g., 'is_mobile'
    segmentSize: number;        // e.g., 0.3
    sampleSize: number;
  }): HTEExperimentData;
  
  // Stable temporal patterns
  static temporalEffect(config: {
    weekdayEffect: number;
    weekendEffect: number;
    sampleSize: number;
    duration: number;           // Days
  }): HTEExperimentData;
}
```

## Parameter Recovery Tests

Validate that our inference recovers known parameters:

```typescript
export class ParameterRecovery {
  static async testRecovery(
    trueParams: Parameters,
    generator: () => Data,
    inferenceEngine: InferenceEngine,
    tolerance: number = 0.05
  ): Promise<RecoveryResult> {
    const data = generator();
    const posterior = await inferenceEngine.fit(data);
    
    return {
      recovered: posterior.mean(),
      true: trueParams,
      withinTolerance: this.checkTolerance(posterior, trueParams, tolerance),
      coverage: this.checkCoverage(posterior, trueParams)
    };
  }
}
```

## Usage in Tests

```typescript
describe('Beta-Binomial Recovery', () => {
  it('recovers true conversion rate', async () => {
    const trueRate = 0.15;
    const data = BusinessScenarios.ecommerce({
      baseConversionRate: trueRate,
      conversionLift: 0,  // No treatment effect
      revenueDistribution: 'gamma',
      revenueLift: 0,
      sampleSize: 1000
    });
    
    const result = await ParameterRecovery.testRecovery(
      { rate: trueRate },
      () => data.control,
      new BetaBinomialInference()
    );
    
    expect(result.withinTolerance).toBe(true);
    expect(result.coverage).toBeGreaterThan(0.9);
  });
});
```