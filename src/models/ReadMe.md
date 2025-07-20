# Tyche Models

This directory contains the statistical models for Tyche's Bayesian analysis capabilities.

## Current Architecture

### ConversionValueModelVI (Recommended)
- **File**: `ConversionValueModelVI.ts`
- **Purpose**: Fast variational inference for conversion + value analysis
- **Features**:
  - Runs in seconds instead of minutes
  - Auto-detects best model type based on data
  - Supports zero-inflated and mixture models
  - Browser-optimized performance
  - is GPU parallizable, via webworkers.

### Usage

```typescript
import { ConversionValueModelVI } from './models/ConversionValueModelVI';

const model = new ConversionValueModelVI();

// Add variant data
model.addVariant({
  name: 'Control',
  users: [
    { converted: true, value: 95.50 },
    { converted: false, value: 0 },
    // ...
  ]
});

// Run analysis
const results = await model.analyze({
  modelType: 'auto',      // Auto-detect best model
  maxIterations: 1000,    // VI iterations
  tolerance: 1e-6         // Convergence tolerance
});

// Access results
console.log('Conversion rates:', results.conversionRates);
console.log('Mean values:', results.meanValues);
console.log('Outlier influence:', results.outlierInfluence);
```

### Model Types

The VI engine supports several model types:

1. **Beta-Binomial** (default)
   - Simple conversion rate analysis
   - Fast exact inference

2. **Zero-Inflated LogNormal**
   - For revenue data with many zeros
   - Handles sparse conversion scenarios

3. **Normal Mixture**
   - For multimodal value distributions
   - Detects customer segments

4. **Auto-detect**
   - Automatically selects based on data characteristics
   - Recommended for most use cases

### Migration from ConversionValueModel

The old MCMC-based `ConversionValueModel` is deprecated. To migrate:

1. Replace `ConversionValueModel` with `ConversionValueModelVI`
2. Remove `ComputationGraph` references (no longer needed)
3. Update analysis options to use VI parameters
4. Results format remains the same for compatibility

### Performance

Typical analysis times:
- 1,000 users: < 1 second
- 10,000 users: 2-5 seconds  
- 100,000 users: 10-20 seconds

Compare to MCMC which took minutes for similar datasets.