# Business Models

High-level APIs that compose distributions and inference for specific business use cases.

## Current Structure

```
models/
├── compound/
│   ├── CompoundModel.ts        # Base class and implementations
│   └── README.md              # Compound model details
├── ConversionValueModelVI.ts   # Legacy VI-based implementation
├── ConversionValueModel2.ts    # Current implementation using CompoundModel
└── index.ts                   # Public exports
```

## Active Models

### ConversionValueModel2

The current implementation for analyzing experiments with conversion and revenue data. Built on top of the compound model architecture.

```typescript
const model = new ConversionValueModel2();
model.addVariant({ name: 'control', users: controlData });
model.addVariant({ name: 'treatment', users: treatmentData });

const results = await model.analyze();
// Results include conversion rates, revenue per user, lift metrics, etc.
```

### CompoundModel Base Classes

The `/compound/` subdirectory contains the actual compound model implementations:

- `BetaGammaCompound` - Conversion × Gamma revenue
- `BetaLogNormalCompound` - Conversion × LogNormal revenue  
- `BetaLogNormalMixtureCompound` - Conversion × LogNormal mixture (multimodal revenue)

These separate frequency (did they convert?) from severity (how much did they spend?).

```typescript
// Under the hood in ConversionValueModel2
const compound = new BetaLogNormalCompound(inferenceEngine);
const posterior = await compound.fit(userData);

// Access components
const conversionRate = posterior.frequency.mean()[0];
const avgRevenue = posterior.severity.mean()[0];
const revenuePerUser = posterior.expectedValuePerUser();
```

## Legacy Model

### ConversionValueModelVI

Still present for backward compatibility but should not be used for new code. This was the transition implementation between the old computation graph approach and the current modular system.

## Data Format

All models expect user-level data:

```typescript
interface UserData {
  converted: boolean;  // Did this user convert?
  value: number;      // Revenue/value (0 if not converted)
}

// Example data
const data = [
  { converted: true, value: 49.99 },
  { converted: false, value: 0 },
  { converted: true, value: 129.95 },
  // ...
];
```

## Why Compound Models?

Instead of zero-inflated distributions, we decompose metrics into interpretable components:

1. **Business clarity** - "2% more people converted AND they spent $5 more"
2. **Statistical benefits** - Use the best distribution for each component
3. **Computational efficiency** - Parallelize frequency and severity analysis

See the [compound model README](compound/README.md) for more details.

## Usage with Workers

These models work seamlessly with the WebWorker infrastructure:

```typescript
const { runInference } = useInferenceWorker();

// ConversionValueModel2 uses this internally
const result = await runInference(
  'compound-beta-lognormal',
  { data: userData }
);
```

## Future Models

- **MultiMetricModel** - Analyze multiple outcomes simultaneously
- **SegmentedModel** - Built-in segment discovery
- **TimeSeriesModel** - For temporal patterns