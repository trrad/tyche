# Experiment Metadata Layer

Rich context and constraints for business experiments beyond raw statistics.

## Vision (Phase 2.2)

Capture the full context of experiments to enable better decision-making and segment discovery.

## Planned Architecture

```
experiments/
├── types/
│   ├── ExperimentContext.ts      # Core metadata types
│   ├── RandomizationMethod.ts    # How users were assigned
│   └── BusinessConstraints.ts    # Guardrails and requirements
├── validation/
│   ├── MetadataValidator.ts      # Ensure completeness
│   └── ConstraintChecker.ts      # Verify guardrails
└── ExperimentMetadata.ts         # Main interface
```

## Core Metadata Structure

```typescript
interface ExperimentMetadata {
  // Experiment design
  design: {
    hypothesis: string;
    startDate: Date;
    expectedDuration: number;
    randomizationUnit: 'user' | 'session' | 'account';
    randomizationMethod: 'hash' | 'random' | 'time_based' | 'user_clustered';
    trafficAllocation: Map<string, number>;
  };
  
  // Business context
  business: {
    primaryMetric: string;
    guardrailMetrics: string[];
    minimumPracticalEffect: number;
    businessJustification: string;
    stakeholders: string[];
  };
  
  // Segmentation strategy
  segmentation?: {
    strategy: 'pre_defined' | 'discover' | 'both';
    predefinedSegments?: SegmentDefinition[];
    discoveryConstraints?: {
      maxSegments: number;
      minSegmentSize: number;
      allowedFeatures: string[];
    };
  };
  
  // Implementation details
  implementation: {
    platform: string;
    sdkVersion: string;
    customEvents?: string[];
    debugMode: boolean;
  };
}
```

## Integration Points

### With Power Analysis
- Use MDE from metadata for power calculations
- Consider traffic allocation in sample size estimates
- Account for guardrail metrics in multiple testing

### With Causal Trees
- Limit feature space to `allowedFeatures`
- Respect `minSegmentSize` constraints
- Pre-defined segments guide hypothesis generation

### With Decision Framework
- Incorporate guardrail metrics into loss function
- Use business justification for recommendation context
- Alert if results violate constraints

## Validation Rules

```typescript
class MetadataValidator {
  validate(metadata: ExperimentMetadata): ValidationResult {
    const errors = [];
    
    // Business logic checks
    if (metadata.business.minimumPracticalEffect <= 0) {
      errors.push('MDE must be positive');
    }
    
    // Allocation checks
    const totalAllocation = sum(metadata.design.trafficAllocation.values());
    if (Math.abs(totalAllocation - 1.0) > 0.001) {
      errors.push('Traffic allocation must sum to 100%');
    }
    
    // Segmentation checks
    if (metadata.segmentation?.minSegmentSize < 0.05) {
      errors.push('Minimum segment size should be ≥5% for reliability');
    }
    
    return { valid: errors.length === 0, errors };
  }
}
```

## User Experience

The metadata layer enables:
- Pre-flight checks before running experiments
- Automatic constraint enforcement during analysis
- Rich context in reports and recommendations
- Better collaboration through shared understanding

## Not Including

- Complex experimental designs (factorial, etc.)
- Multi-stage experiments
- Bandits/adaptive designs
- Cross-experiment dependencies