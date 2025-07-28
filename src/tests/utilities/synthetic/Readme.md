# DataGenerator Utility

The `DataGenerator` utility provides a unified API for generating synthetic data for Bayesian inference testing and experimentation. It supports various data types, noise levels, and includes ground truth metadata for validation.

## Quick Start

```typescript
import { DataGenerator } from './DataGenerator';

// Create a generator instance
const gen = new DataGenerator(seed); // Optional seed for reproducibility

// Generate simple data
const data = gen.continuous('normal', { mean: 100, std: 30 }, 1000);

// Generate compound data (user-level)
const users = gen.compound(0.05, { type: 'lognormal', params: [3.5, 0.5] }, 2000);

// Use predefined scenarios
const revenue = DataGenerator.scenarios.revenue.realistic(3.5, 0.5, 1000, seed);
```

## Data Types

### 1. Simple Data (Arrays of Numbers)

**Continuous Distributions:**
```typescript
// Normal distribution
const normal = gen.continuous('normal', { mean: 100, std: 30 }, 1000);

// LogNormal distribution  
const lognormal = gen.continuous('lognormal', { logMean: 3.5, logStd: 0.5 }, 1000);

// Gamma distribution
const gamma = gen.continuous('gamma', { shape: 2, scale: 50 }, 1000);
```

**Binary Data:**
```typescript
// Beta-Binomial (conversion rates)
const conversion = gen.betaBinomial(0.05, 1000); // 5% conversion rate
```

### 2. Compound Data (User-Level)

Compound data represents individual users with conversion status and value:

```typescript
// E-commerce users: 5% conversion, $75 average order value
const users = gen.compound(0.05, { 
  type: 'lognormal', 
  params: [3.5, 0.5] // logMean, logStd
}, 2000);

// Each user has: { converted: boolean, value: number }
```

### 3. Mixture Models

Generate data from multiple underlying distributions:

```typescript
const mixture = gen.mixture([
  { distribution: 'normal', params: [50, 10], weight: 0.6 },
  { distribution: 'normal', params: [100, 20], weight: 0.4 }
], 1000);
```

## Noise Levels

All data generation supports three noise levels:

- **`clean`**: No noise, perfect data
- **`realistic`**: 5% measurement error, 2% outliers  
- **`noisy`**: 15% measurement error, 5% outliers

```typescript
// Apply noise to existing data
const noisyData = gen.applyNoiseLevel(cleanData, 'realistic');
```

## Predefined Scenarios

### Simple Scenarios

```typescript
// Conversion rates
DataGenerator.scenarios.betaBinomial.clean(0.05, 1000, seed);
DataGenerator.scenarios.betaBinomial.realistic(0.05, 1000, seed);
DataGenerator.scenarios.betaBinomial.noisy(0.05, 1000, seed);

// Revenue distributions
DataGenerator.scenarios.revenue.clean(3.5, 0.5, 1000, seed);
DataGenerator.scenarios.revenue.realistic(3.5, 0.5, 1000, seed);
DataGenerator.scenarios.revenue.noisy(3.5, 0.5, 1000, seed);

// Customer segments
DataGenerator.scenarios.segments.clean(1000, seed);
DataGenerator.scenarios.segments.realistic(1000, seed);
DataGenerator.scenarios.segments.noisy(1000, seed);
```

### Compound Scenarios

```typescript
// E-commerce
DataGenerator.scenarios.ecommerce.clean(2000, seed);
DataGenerator.scenarios.ecommerce.realistic(2000, seed);
DataGenerator.scenarios.ecommerce.noisy(2000, seed);

// SaaS subscriptions
DataGenerator.scenarios.saas.clean(2000, seed);
DataGenerator.scenarios.saas.realistic(2000, seed);
DataGenerator.scenarios.saas.noisy(2000, seed);

// Marketplace
DataGenerator.scenarios.marketplace.clean(2000, seed);
DataGenerator.scenarios.marketplace.realistic(2000, seed);
DataGenerator.scenarios.marketplace.noisy(2000, seed);
```

## Presets

Curated datasets with known ground truth for validation:

```typescript
// Four-component mixture stress test
DataGenerator.presets.fourSegments(1000, seed);

// E-commerce with customer segments
DataGenerator.presets.ecommerceSegments(1000, seed);

// Beta-Binomial with known truth
DataGenerator.presets.betaBinomial(0.05, 1000, seed);

// LogNormal with known truth
DataGenerator.presets.lognormal(3.5, 0.5, 1000, seed);
```

## Ground Truth & Metadata

All generated datasets include metadata for validation:

```typescript
const dataset = gen.continuous('normal', { mean: 100, std: 30 }, 1000);

console.log(dataset.groundTruth);
// {
//   type: 'continuous-normal',
//   parameters: { mean: 100, std: 30 },
//   noiseLevel: 'clean'
// }

console.log(dataset.metadata);
// {
//   sampleSize: 1000,
//   seed: 12345,
//   generatedAt: Date
// }
```

## Custom Data Generation

### Writing Your Own Generator

```typescript
// Simple custom generator
function customRevenueGenerator(n: number, seed?: number) {
  const gen = new DataGenerator(seed);
  
  // Generate base data
  const baseData = gen.continuous('lognormal', { logMean: 4.0, logStd: 0.8 }, n);
  
  // Apply business logic
  const businessData = baseData.data.map(value => {
    // Add seasonal effects, discounts, etc.
    return value * (1 + Math.sin(Date.now() / 1000) * 0.1);
  });
  
  return {
    ...baseData,
    data: businessData,
    groundTruth: {
      ...baseData.groundTruth,
      businessLogic: 'seasonal_multiplier'
    }
  };
}
```

### Compound Data with Segments

```typescript
// Multi-segment e-commerce
const segments = gen.compoundWithSegments({
  conversionRate: 0.08,
  segments: [
    { weight: 0.7, revenueMean: 50, revenueVariance: 25 },  // Budget
    { weight: 0.25, revenueMean: 150, revenueVariance: 100 }, // Standard  
    { weight: 0.05, revenueMean: 500, revenueVariance: 400 }  // Premium
  ],
  n: 2000
});
```

## Best Practices

1. **Use seeds for reproducibility**: `new DataGenerator(12345)`
2. **Choose appropriate noise levels**: Use `realistic` for most testing
3. **Include ground truth**: Always return `GeneratedDataset` with metadata
4. **Test with known parameters**: Use presets for validation
5. **Consider sample sizes**: Larger samples = better inference, but slower computation

## Integration with Inference Engine

The generated data works seamlessly with Tyche's inference engine:

```typescript
import { InferenceEngine } from '../../../inference/InferenceEngine';

const engine = new InferenceEngine();
const result = await engine.runInference('auto', { data: dataset.data });
```

## Examples

See the `examples/inference-explorer.tsx` for interactive examples of all data generation capabilities. 