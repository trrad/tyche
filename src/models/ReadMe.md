# Business-Level Models

High-level statistical models that compose distributions and inference methods for specific business use cases.

## Current State

**What exists:**
- `ConversionValueModel.ts` - Old computation graph approach (TO BE DELETED)
- `ConversionValueModelVI.ts` - Working VI-based implementation
- Mixed abstraction levels (low-level inference with business logic)

**Problems:**
- Old model uses deprecated computation graph
- VI model works but could be cleaner with new architecture
- No clear pattern for new business models

## Desired State

**Clean business model implementations:**
```
models/
├── base/
│   └── BusinessModel.ts         # Common interface
├── CompoundModel.ts            # Frequency × Severity composition
├── ConversionValueModelVI.ts   # Current working model (refactored)
├── RevenueModel.ts             # Future: pure revenue analysis
└── SegmentedModel.ts           # Future: with user segments
```

## Design Philosophy

### Compound Model Architecture

We use "compound models" (frequency × severity) instead of zero-inflated models for business clarity. The term comes from actuarial science where it's standard for modeling claim frequency × claim severity.

```typescript
export class CompoundModel<
  FrequencyDist extends Distribution,
  SeverityDist extends Distribution
> {
  private frequency: FrequencyDist;  // "Did they convert?"
  private severity: SeverityDist;    // "How much did they spend?"
  
  async analyze(data: VariantData[]): Promise<BusinessResults> {
    // Part 1: Conversion analysis
    const conversionResults = await this.analyzeConversion(data);
    
    // Part 2: Value analysis (converters only)
    const valueResults = await this.analyzeValue(data);
    
    // Combine for business insights
    return this.combineResults(conversionResults, valueResults);
  }
}

// Supports mixtures for complex value distributions (1-4 components)
type ValueDistribution = Gamma | LogNormal | NormalMixture | LogNormalMixture;
const model = new CompoundModel<Beta, LogNormalMixture>();
```

### Why Compound Models

**Business clarity**:
- "Conversion increased 2%" - clear metric
- "Revenue per converter increased $5" - actionable
- "Overall effect: +$3.20 per user" - bottom line

**Statistical benefits**:
- Use best distribution for each part
- Support mixtures for multimodal severity
- Cleaner parameter interpretation  
- Easier prior specification

**Computational benefits**:
- Parallelize frequency and severity analysis
- Use conjugate updates where possible
- EM for mixtures, VI only when needed

## Model Patterns

### Current: ConversionValueModelVI

Needs refactoring to:
1. Use new distribution classes
2. Delegate to inference engines
3. Focus on business logic only
4. Adopt compound model architecture internally

### Future: Segmented Models

```typescript
export class SegmentedModel extends BusinessModel {
  async analyze(data: SegmentedData): Promise<SegmentResults> {
    // Detect segments using mixture models
    const segments = await this.detectSegments(data);
    
    // Analyze each segment separately
    const segmentResults = await Promise.all(
      segments.map(s => this.analyzeSegment(s))
    );
    
    // Aggregate for overall insights
    return this.aggregateResults(segmentResults);
  }
}
```

## Business Metrics

Models should output interpretable business metrics:

```typescript
interface BusinessResults {
  // Point estimates
  conversionRate: Map<string, number>;
  revenuePerConverter: Map<string, number>;
  revenuePerUser: Map<string, number>;
  
  // Uncertainty  
  credibleIntervals: Map<string, [number, number]>;
  probabilityOfImprovement: Map<string, number>;
  
  // Insights
  effectDecomposition: EffectDrivers;
  outlierInfluence: OutlierDiagnostic;
  sampleSizeRecommendation?: number;
}
```

## Future Models

### Causal Trees for HTE Discovery (Phase 3.3)

Hypothesis-driven heterogeneous treatment effect discovery:

```typescript
export class CausalTreeModel extends BusinessModel {
  // Constrained for interpretability and stability
  constraints = {
    maxFeatures: 8,           // Increased from 3 - more realistic
    maxDepth: 4,              // Still interpretable
    minSegmentSize: 0.10,     // ≥10% of users
    requiredStability: 0.80,  // Must appear in 80% of bootstraps
  };
  
  async discoverSegments(
    data: ExperimentData,
    hypotheses: BusinessHypothesis[]
  ): Promise<StableSegments> {
    // Honest inference with train/estimate split
    // Bootstrap for stability validation
    // Return only actionable, stable segments
  }
}
```

### Decision Framework Integration (Phase 3.1)

Incorporating loss functions and business costs:

```typescript
export class DecisionAwareModel extends BusinessModel {
  async analyzeWithCosts(
    data: VariantData[],
    costs: BusinessCosts
  ): Promise<DecisionRecommendation> {
    // Standard analysis
    const results = await this.analyze(data);
    
    // Integrate loss function over posteriors
    const decision = this.computeOptimalDecision(results, costs);
    
    return {
      recommendation: decision,
      expectedValue: this.computeExpectedValue(decision, results),
      riskAssessment: this.assessRisks(decision, results)
    };
  }
}
```

## Testing Business Models

1. **Synthetic data tests**: Known ground truth recovery
2. **Business logic tests**: Metrics computed correctly
3. **Edge case tests**: No conversions, single converter, etc.
4. **Integration tests**: Full pipeline with real-like data