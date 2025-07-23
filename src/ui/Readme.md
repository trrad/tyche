# UI & Visualization Layer

Visual interface for making Bayesian analysis accessible to non-statisticians.

## Vision (Phase 2.1)

Transform complex statistical concepts into intuitive visual interactions. A marketing manager with no stats background should be able to design and analyze experiments in 5 minutes.

## Planned Architecture

```
ui/
├── components/
│   ├── experiment-designer/
│   │   ├── MetricSelector.tsx      # Choose metric type
│   │   ├── VariantConfig.tsx       # Set up variants
│   │   └── MetadataForm.tsx        # Hypothesis, MDE, etc.
│   ├── prior-elicitation/
│   │   ├── PriorSliders.tsx        # Visual prior specification
│   │   ├── EmpiricalDefaults.tsx   # Smart defaults from history
│   │   └── PriorPreview.tsx        # See prior implications
│   ├── results-explorer/
│   │   ├── InteractiveResults.tsx  # Explore posteriors visually
│   │   ├── SegmentComparison.tsx   # Compare across segments
│   │   └── DecisionHelper.tsx      # What action to take
│   └── common/
│       ├── LiveUpdating.tsx        # Real-time parameter changes
│       ├── ResponsiveWrapper.tsx   # Mobile viewing support
│       └── CodeExport.tsx          # Generate reproducible code
├── visualizations/
│   ├── DistributionPlot.tsx        # Prior/posterior viz
│   ├── PowerCurves.tsx             # Sample size exploration
│   ├── UpliftForest.tsx            # Segment effect viz
│   └── DecisionBoundary.tsx        # When to ship
└── styles/
    └── [component styles]
```

## Key Components

### Experiment Designer

Given our focused inference approach, the designer is about configuration, not arbitrary model building:

```typescript
interface ExperimentDesigner {
  // Step 1: Choose your metrics
  metrics: {
    primary: 'conversion' | 'revenue' | 'count' | 'compound';
    // For compound: automatically sets up frequency × severity
    compoundConfig?: {
      frequency: 'conversion';  // Always Beta-Binomial
      severity: 'revenue' | 'time' | 'count';  // Gamma/LogNormal
    };
  };
  
  // Step 2: Configure variants
  variants: {
    control: VariantConfig;
    treatments: VariantConfig[];
    allocation?: number[];  // Optional custom allocation
  };
  
  // Step 3: Set experiment metadata
  metadata: {
    hypothesis: string;
    minimumEffect: number;
    expectedDuration: number;
    targetSegments?: string[];  // Pre-planned segments
  };
  
  // Not building: arbitrary DAGs, custom distributions, 
  // complex hierarchical structures
}
```

The UI intelligently maps these choices to our inference capabilities:
- **Conversion** → Beta-Binomial conjugate
- **Revenue alone** → Gamma or LogNormal (auto-detected)
- **Compound** → Two separate analyses, combined for business metrics
- **Count** → Negative Binomial
- **Mixtures** → Automatically tried when multimodal data detected

### Prior Elicitation

Making priors intuitive through progressive disclosure:

```typescript
interface PriorElicitation {
  // Level 1: Smart defaults
  empiricalBayes: {
    useHistoricalData: boolean;
    confidenceLevel: 'low' | 'medium' | 'high';
  };
  
  // Level 2: Visual sliders
  sliders: {
    expectedEffect: RangeSlider;      // "I expect 0-5% lift"
    confidence: ConfidenceSlider;     // "I'm pretty sure"
  };
  
  // Level 3: Advanced options
  advanced: {
    distributionPicker: boolean;      // Choose Beta vs Normal
    parameterInput: boolean;          // Direct α, β input
  };
}
```

### Interactive Results

Results that tell a story:

```typescript
interface InteractiveResults {
  // Progressive revelation
  summary: {
    headline: string;                 // "Treatment wins with 95% probability"
    keyMetric: string;               // "3.2% conversion lift"
    recommendation: string;          // "Ship to all users"
  };
  
  // Interactive exploration
  exploration: {
    hoverForCI: boolean;             // Hover to see intervals
    dragThreshold: boolean;          // Drag to see P(effect > X)
    clickForSegments: boolean;       // Click to drill down
  };
  
  // Export options
  sharing: {
    screenshotMode: boolean;         // Clean for presentations
    interactiveLink: boolean;        // Share explorable results
    codeGeneration: boolean;         // Reproducible analysis
  };
}
```

## Design Principles

1. **Progressive Disclosure**: Simple by default, powerful when needed
2. **Direct Manipulation**: Drag sliders, see results update instantly
3. **Visual Metaphors**: Use familiar concepts (sliders, distributions)
4. **Immediate Feedback**: Every action has instant visual response
5. **Export to Code**: Visual interactions generate real code

## Example User Flow

```typescript
// 1. Configure experiment (not build arbitrary model)
const experiment = ui.configureExperiment()
  .setMetricType('compound')  // Automatic frequency × severity
  .addVariant('Control')
  .addVariant('New Checkout')
  .setHypothesis('Simplified checkout increases conversion and AOV');

// 2. Set priors visually
ui.setPriors()
  .useEmpiricalDefaults()
  .adjustExpectedLift(0.02, confidence='medium');

// 3. Run and explore
const results = await ui.analyzeResults(data);
ui.exploreInteractively(results)
  .showSegmentDrilldown()
  .shareLink();  // Works on mobile!

// 4. Generate code for reproduction
const code = ui.generateCode();  // Returns TypeScript using core libraries
```

## Integration with Core

The UI layer is a thin wrapper over our statistical core:
- All statistical computation happens in core libraries
- UI only handles visualization and interaction
- Every UI action can be exported as code
- No statistical logic in UI components

## Not Building

- Complex dashboard with 100 charts
- Real-time streaming updates
- Collaborative editing features
- Custom charting library (use existing)
- Arbitrary model composition UI (we have focused inference)

## Mobile Strategy

**Responsive Viewing**: Results and experiment configurations should be viewable on mobile devices
- Stakeholders often check results on phones
- Shared links should work everywhere
- Power curves and key metrics display well on small screens

**Desktop-First Editing**: Complex interactions optimized for desktop
- Prior elicitation sliders need precision
- Power analysis exploration benefits from screen space
- Experiment design requires thoughtful interaction

```typescript
interface ResponsiveStrategy {
  // Mobile-optimized views
  mobile: {
    viewResults: true;
    viewPowerCurves: true;
    viewExperimentConfig: true;
    shareableLinks: true;
  };
  
  // Desktop-optimized editing
  desktop: {
    designExperiments: true;
    elicitPriors: true;
    explorePowerSpace: true;
    exportCode: true;
  };
}
```