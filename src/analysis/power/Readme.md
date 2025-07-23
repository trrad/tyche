# Power Analysis Engine

Smart simulation engine for experiment design space exploration and optimization.

## Vision (Phase 2.3)

Power analysis needs special treatment due to computational intensity - not just for single configurations, but for exploring thousands of design variations to find optimal experiment parameters. Progressive computation strategies make design space exploration tractable in the browser.

## Core Purpose

**Beyond Single-Point Power**: Instead of just "what's the power at n=1000?", we enable:
- Sample size curves across effect sizes
- Optimal allocation search (not always 50/50!)
- Duration vs. precision tradeoffs
- Multi-metric power surfaces
- Segment-specific sample size requirements

```typescript
interface DesignSpaceExploration {
  // Not just one configuration - explore the space
  parameterRanges: {
    sampleSize: Range;          // [1000, 50000]
    effectSize: Range;          // [0.01, 0.10]
    allocation: Range;          // [0.3, 0.7]
    duration: Range;            // [7, 45] days
  };
  
  // Find optimal designs
  optimization: {
    objective: 'minimize_sample' | 'maximize_power' | 'minimize_duration';
    constraints: {
      minPower: number;         // e.g., 0.80
      maxDuration: number;      // e.g., 30 days
      maxBudget?: number;       // Cost constraints
    };
  };
  
  // Multi-dimensional results
  results: {
    powerSurface: PowerGrid;    // 3D visualization
    optimalDesigns: Design[];   // Pareto frontier
    tradeoffCurves: Curve[];    // Duration vs power, etc.
  };
}
```

## Planned Architecture

```
power/
├── base/
│   ├── PowerAnalysis.ts         # Base interface
│   └── types.ts                 # Scenario definitions
├── strategies/
│   ├── ConjugateApproximation.ts  # <100ms first pass
│   ├── ImportanceSampling.ts      # Focus on critical regions
│   └── FullSimulation.ts          # Complete Monte Carlo
├── optimization/
│   ├── WorkerPool.ts              # Web Worker management
│   ├── CacheStrategy.ts           # Smart result caching
│   └── Interpolation.ts           # Smooth parameter curves
└── PowerEngine.ts                 # Unified API
```

## Key Innovation: Progressive Computation

Exploring the design space requires thousands of simulations. Our progressive approach makes this feasible:

```typescript
interface ProgressiveStrategy {
  // Stage 1: Conjugate approximation (<100ms)
  // Quick grid search across entire design space
  quickEstimate(): DesignSpaceEstimate;
  
  // Stage 2: Importance sampling (<5s)
  // Focus computation on promising regions
  refineEstimate(regions: PromisingRegion[]): RefinedEstimate;
  
  // Stage 3: Full simulation (<30s)
  // High-fidelity simulation for final candidates
  fullSimulation(candidates: Design[]): DetailedResults;
  
  // Stage 4: GPU acceleration (future)
  // Massive parallel exploration
  gpuSimulation?(config: GPUConfig): PowerSurface;
}
```

This enables real-time interaction: users can drag sliders and see power curves update smoothly, with progressive refinement happening in the background.

## Importance Sampling Strategy

Focus computational effort where it matters:

```typescript
interface ImportanceSampler {
  focusRegions: {
    nearSignificance: Range;    // p ∈ [0.04, 0.06]
    nearMDE: Range;            // effect ∈ [MDE-ε, MDE+ε]
    userDefined?: Range[];     // Custom regions
  };
  
  // Reuse simulations across parameter sweeps
  reuseStrategy: {
    kernel: 'gaussian' | 'uniform';
    bandwidth: number;
  };
}
```

## Web Worker Architecture

```typescript
class PowerSimulationPool {
  private workers: Worker[];
  private queue: SimulationTask[];
  
  async simulate(scenarios: PowerScenario[]): Promise<PowerCurve> {
    // Distribute scenarios across workers
    // Adaptive load balancing
    // Progress reporting
    // Cancellation support
  }
}
```

## Smart Caching

```typescript
interface CacheStrategy {
  // Interpolate between computed points
  interpolation: {
    method: 'spline' | 'linear';
    smoothing: number;
  };
  
  // Pre-compute common scenarios
  precompute: PowerScenario[];
  
  // Invalidation rules
  invalidateOn: string[];
}
```

## Integration with VI Engine

Leverage existing infrastructure:
- Use VI engine for complex posteriors
- Importance weights from ELBO
- Reuse numerical stability utilities

## Performance Targets

- **Stage 1**: <100ms (conjugate approximation)
- **Stage 2**: <5s (importance sampling, 1k simulations)
- **Stage 3**: <30s (full simulation, 10k simulations)
- **Worker speedup**: 8-16x on modern devices
- **Cache hit rate**: >80% for parameter sweeps

## User Experience

```typescript
interface PowerAnalysisUI {
  // Real-time updates as parameters change
  liveUpdating: boolean;
  
  // Show computation progress
  progressIndicator: {
    stage: 1 | 2 | 3;
    estimatedTime: number;
    confidence: number;
  };
  
  // Interactive exploration
  parameterSliders: {
    effectSize: Range;
    sampleSize: Range;
    alpha: number;
    allocation: number;
  };
  
  // Smart suggestions based on exploration
  recommendations: {
    minSampleSize: number;
    optimalAllocation: number;
    expectedDuration: number;
    alternativeDesigns: Design[];  // "Consider these tradeoffs"
  };
  
  // Design space visualization
  visualizations: {
    powerCurves: LineChart;        // Classic power vs n
    powerSurface: Surface3D;       // Power across 2 parameters
    tradeoffFrontier: ScatterPlot; // Pareto optimal designs
  };
}
```

## Practical Use Cases

1. **Finding the Sweet Spot**: "Show me all designs with 80%+ power that finish in under 30 days"
2. **Allocation Optimization**: "What if treatment is more expensive? Find optimal unequal allocation"
3. **Multi-Metric Tradeoffs**: "Balance power for conversion AND revenue metrics"
4. **Segment Planning**: "How many mobile users do we need to detect segment-specific effects?"
5. **Budget Constraints**: "Maximum impact within our traffic budget"

## Not Implementing

- Adaptive experiments (different problem)
- Sequential testing corrections (Phase 4+)
- Complex stopping rules (keep it simple)
- Cluster randomization (future)