# Tyche Test Suite

Comprehensive test suite for the Tyche Bayesian inference library.

## Structure

```
src/tests/
├── scenarios/
│   └── test-scenarios.ts      # Centralized test data and scenarios
├── utilities/
│   ├── synthetic/             # Data generation utilities
│   │   ├── DataGenerator.ts
│   │   └── BusinessScenarios.ts
│   └── validation/
│       └── ParameterRecovery.ts
├── core/
│   └── utils/
│       └── numerical-utils.test.ts
├── inference/
│   ├── exact/
│   │   └── conjugate-inference.test.ts
│   ├── approximate/
│   │   └── mixture-models.test.ts
│   └── inference-engine.test.ts
├── models/
│   ├── compound-models.test.ts
│   └── conversion-value-model.test.ts
└── parameter-recovery.test.ts
```

## Running Tests

### Quick Start
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Targeted Testing
```bash
# Foundation tests (run first)
npm run test:numerical
npm run test:scenarios

# Inference algorithms
npm run test:conjugate
npm run test:mixtures

# Business models
npm run test:compound
npm run test:business

# Integration tests
npm run test:integration
```

### Test Execution Order

For debugging or when making structural changes, run tests in this order:

1. **Numerical utilities** - Foundation for all computations
2. **Test scenarios** - Verify test data generation
3. **Parameter recovery** - Basic validation framework
4. **Conjugate inference** - Exact algorithms
5. **Mixture models** - Approximate algorithms
6. **Compound models** - Multi-component models
7. **Business models** - High-level API
8. **Integration tests** - Full system validation

Use the provided script for automated ordered execution:
```bash
./scripts/run-tests.sh
```

## Test Scenarios

### Beta-Binomial (Conversion Rates)
- **Typical**: 3% e-commerce conversion rate
- **High**: 25% email click rate
- **Edge cases**: All success, no success, single trial

### Revenue (LogNormal)
- **E-commerce**: Mixed small/large purchases
- **SaaS**: Three-tier pricing model
- **With outliers**: Whale customers

### Compound Models
- **Control**: 5% conversion, $55 AOV
- **Treatment**: 6.5% conversion, $60 AOV

### Mixtures
- **Bimodal**: Clear two-component normal
- **Revenue**: Customer value segments

## Tolerances

Different test types use different tolerance levels:

- **EXACT** (1e-10): Mathematical identities
- **TIGHT** (1e-6): Numerical computations
- **NUMERICAL** (1e-4): Iterative algorithms
- **STATISTICAL** (0.01): Parameter estimates
- **PARAMETER_RECOVERY** (0.1): Recovery from data
- **BUSINESS_METRIC** (0.2): High-level metrics

## Writing New Tests

### 1. Use Test Scenarios
```typescript
import { TestScenarios } from '../scenarios/test-scenarios';

const data = TestScenarios.betaBinomial.typical.generateData();
```

### 2. Use Business Scenarios
```typescript
import { BusinessScenarios } from '../utilities/synthetic/BusinessScenarios';

const scenarios = new BusinessScenarios(seed);
const experiment = scenarios.ecommerce({
  baseConversionRate: 0.05,
  conversionLift: 0.3,
  // ...
});
```

### 3. Parameter Recovery Pattern
```typescript
const result = await ParameterRecovery.testRecovery(
  { rate: 0.05 },           // True parameters
  () => generateData(),     // Data generator
  inferenceEngine,          // Engine to test
  'beta-binomial'          // Model type
);

expect(result.withinTolerance).toBe(true);
expect(result.coverage).toBe(true);
```

## Debugging Tips

1. **Set random seeds** for reproducibility
2. **Use smaller samples** for faster iteration
3. **Check diagnostics** in results
4. **Log intermediate values** in complex tests
5. **Run focused tests** with `.only`

## Coverage Goals

- Core algorithms: >95%
- Business models: >90%
- Utilities: >95%
- Integration paths: >80%

Run `npm run test:coverage` to check current coverage.