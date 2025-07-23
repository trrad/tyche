# Hypothesis-Driven Causal Trees

Constrained, interpretable heterogeneous treatment effect (HTE) discovery for stable business insights.

## Philosophy (Phase 3.3)

The pragmatic middle ground between "average effects for everyone" and "black box ML optimization." We find segments that:
- **Persist**: Remain true months later
- **Generalize**: Apply to future customers  
- **Actionable**: Marketing/product can actually target them

## Planned Architecture

```
trees/
├── base/
│   ├── CausalTree.ts            # Core tree structure
│   ├── HonestInference.ts       # Train/estimate split
│   └── types.ts                 # Segment definitions
├── constraints/
│   ├── TreeConstraints.ts       # Enforce interpretability
│   ├── StabilityChecker.ts      # Bootstrap validation
│   └── BusinessFilters.ts       # Actionability rules
├── inference/
│   ├── TreeBuilder.ts           # Construct tree structure
│   ├── EffectEstimator.ts       # Estimate segment effects
│   └── BootstrapCI.ts          # Credible intervals
└── CausalTreeEngine.ts          # Main API
```

## Key Design Choices

### Constrained for Interpretability

```typescript
interface TreeConstraints {
  // Feature limits (balanced for real patterns)
  maxFeatures: 8;              // Enough for real patterns
  maxInteractionDepth: 2;      // device × dayOfWeek OK
  
  // Tree structure
  maxDepth: 4;                 // Still interpretable
  minSamplesLeaf: 100;         // Reliable estimates
  minSegmentSize: 0.10;        // ≥10% of population
  
  // Stability requirements
  bootstrapIterations: 200;    // NOT 2000!
  requiredStability: 0.80;     // 80% bootstrap appearance
  
  // Business constraints
  requiredActionability: true;  // Can we target this?
  allowedFeatures: string[];   // From experiment metadata
}
```

### Hypothesis-Driven Features

```typescript
interface BusinessHypothesis {
  name: string;                // "Mobile users during weekends"
  features: string[];          // ['device_type', 'is_weekend']
  businessRationale: string;   // Why we think this matters
  actionableHow: string;       // How to use if true
}

// Pre-specify sensible features
const allowedFeatures = {
  // User characteristics (stable)
  device: ['mobile', 'desktop', 'tablet'],
  userTenure: ['new', 'active', 'loyal'],
  channel: ['organic', 'paid', 'email', 'social'],
  
  // Temporal patterns (targetable)
  dayOfWeek: [1, 2, 3, 4, 5, 6, 7],
  isWeekend: boolean,
  hourOfDay: [0...23],
  
  // Business-specific (customizable)
  custom: Map<string, any>
};
```

### Honest Inference Process

```typescript
class HonestCausalTree {
  // Three-way split for rigorous inference
  split(data: ExperimentData): {
    structure: ExperimentData;    // 33%: Find tree structure
    estimation: ExperimentData;   // 33%: Estimate effects
    validation: ExperimentData;   // 33%: Validate segments
  }
  
  // Build tree on structure set
  buildTree(structureData: ExperimentData): TreeStructure;
  
  // Estimate effects on fresh data
  estimateEffects(
    tree: TreeStructure, 
    estimationData: ExperimentData
  ): SegmentEffects;
  
  // Validate on holdout
  validateSegments(
    effects: SegmentEffects,
    validationData: ExperimentData
  ): ValidatedSegments;
}
```

## Output: Actionable Insights

```typescript
interface CausalTreeResult {
  segments: Array<{
    // Clear description
    description: string;        // "Mobile weekend users"
    
    // Who is in this segment
    definition: SegmentRule;    // device='mobile' AND is_weekend=true
    size: number;              // 0.15 (15% of population)
    
    // Treatment effect
    effect: {
      estimate: number;        // 0.032 (3.2% lift)
      ci_lower: number;        // 0.018
      ci_upper: number;        // 0.046
      probability_positive: number;  // 0.98
    };
    
    // Stability metrics
    stability: {
      bootstrap_frequency: number;   // 0.87 (87% of bootstraps)
      validation_confirmed: boolean; // true
    };
    
    // Business implications
    insight: {
      summary: string;         // Key finding
      recommendation: string;  // What to do
      expectedImpact: number; // Revenue impact
    };
  }>;
}
```

## What We're NOT Building

❌ **Random forests** - 2000 trees finding noise
❌ **Deep interactions** - device×browser×time×phase_of_moon
❌ **Micro-segments** - 0.3% of users who clicked on Tuesday
❌ **Black box models** - "Segment #47 with 73 features"
❌ **Temporal noise** - Patterns that disappear next week

## What We ARE Building

✅ **Stable segments** - True customer differences
✅ **Clear insights** - "Mobile users love this feature"  
✅ **Actionable results** - Marketing can target these
✅ **Fast computation** - 10-60 seconds, not hours
✅ **Business value** - Insights that drive strategy

## Integration Example

```typescript
// From experiment metadata
const metadata = {
  allowedFeatures: ['device_type', 'user_tenure', 'day_of_week'],
  hypotheses: [
    {
      name: 'Mobile First',
      features: ['device_type'],
      rationale: 'Mobile users have different needs'
    }
  ]
};

// Run constrained discovery
const tree = new CausalTreeEngine(constraints);
const results = await tree.discover(experimentData, metadata);

// Get actionable insights
results.segments.forEach(segment => {
  if (segment.effect.probability_positive > 0.95) {
    console.log(`Target ${segment.description} with ${segment.insight.recommendation}`);
  }
});
```