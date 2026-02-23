# Tyche Demo Application: Complete Design Specification

**Version:** 2.0
**Date:** 2025-11-24
**Status:** Implementation Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Philosophy](#architecture-philosophy)
3. [Core Design Principles](#core-design-principles)
4. [User Flow](#user-flow)
5. [Main Results View](#main-results-view)
6. [Credible Interval Interactions](#credible-interval-interactions)
7. [Visualization Components](#visualization-components)
8. [Framework Integration](#framework-integration)
9. [Data Pipeline](#data-pipeline)
10. [Implementation Phases](#implementation-phases)

---

## Overview

### Purpose

The Tyche demo application is an interactive, browser-based tool for Bayesian A/B test analysis. It enables users to:

- Upload experimental data (CSV)
- Automatically analyze with appropriate Bayesian models
- Explore uncertainty through interactive visualizations
- Make informed decisions based on probabilistic outcomes

### Key Differentiator

Unlike traditional A/B testing tools that provide binary "significant/not significant" results, Tyche emphasizes **distributional thinking**:

- Full posterior distributions, not point estimates
- Continuous probability statements
- Always-visible uncertainty quantification
- Business-context integration

### Core Message

Experimentation is about incrementally updating beliefs with uncertainty quantified. Bayesian inference reveals what's plausible given the data, not binary proof of effects.

---

## Architecture Philosophy

### Three-Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Pure D3 Visualization Components               │
│ - Framework-agnostic                                     │
│ - Event-based API                                        │
│ - Embeddable anywhere (vanilla JS, React, Vue, etc.)   │
│ - No dependencies except D3                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Framework Wrappers (Optional)                  │
│ - Observable Framework wrapper (for our demo)           │
│ - React wrapper (future)                                 │
│ - Vue/Svelte wrappers (future)                          │
│ - Thin adapters that wire events to framework state     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Application (Demo, Mountain Prints, etc.)     │
│ - Uses wrappers for their chosen framework              │
│ - Or uses vanilla components directly                   │
│ - Business logic and data fetching                      │
└─────────────────────────────────────────────────────────┘
```

### Why This Matters

**Embeddability:** D3 components work in any browser environment

- Vanilla HTML/JS sites
- Observable Framework notebooks
- React/Vue/Svelte apps
- Jupyter notebooks
- Electron apps
- Embedded iframes

**Reusability:** Same viz components across projects

- Tyche demo application
- Mountain Prints analytics dashboard
- Other e-commerce optimization tools
- Standalone Bayesian viz library

**Testability:** Pure D3 components are easy to test

- No framework mocking needed
- Just test rendering and event emission
- Clear input/output contracts

**Flexibility:** Not locked into one framework

- Observable Framework is our _first_ integration
- But not a requirement for the viz components themselves
- Can distribute as standalone library

---

## Core Design Principles

1. **Lift is Primary** - Default to treatment effects (lift %), toggle to absolute values
2. **Always Show Uncertainty** - Never naked point estimates: `+15.3% [10%-90%: +8.2% to +22.7%]`
3. **Outcome Space Only** - Business outcomes ("89% probability exceeds Control"), not parameters
4. **Direct Manipulation** - Drag CI bounds on plot, not separate sliders
5. **Progressive Disclosure** - Simple overview, reveal complexity on demand
6. **Synchronized Interactions** - CI changes apply to all variants for fair comparison
7. **Plain English** - "80% probability" not "credible interval" (technical terms in tooltips only)

---

## User Flow

### Phase 1: Data Upload

```
┌─────────────────────────────────────┐
│  Upload Your Experiment Data        │
│                                      │
│  [📁 Upload CSV] or [Use Example]   │
│                                      │
│  Required format:                   │
│  - user_id, variant, converted, revenue
│  - At least 2 variants             │
│  - At least 30 users per variant   │
│                                      │
│  [Preview shows first 10 rows]      │
│                                      │
│  ✓ Validation passed                │
│  [Analyze Experiment →]             │
└─────────────────────────────────────┘
```

**Future enhancement (Phase 2):**

- Flexible column mapping UI
- Support multiple CSV formats
- JSON upload

### Phase 2: Automatic Analysis

```
Running Bayesian inference...
├─ Detecting metric type: Revenue (compound model)
├─ Routing to Beta × LogNormal model
├─ Fitting posteriors for each variant
└─ Computing comparisons

Analysis complete! (2.3s)
```

**User sees:**

- Progress indicator during inference
- Model selection explanation
- Quick summary stats

### Phase 3: Interactive Exploration

```
Main Results View (default)
  ├─ Ridge plot with quantile dotplots
  ├─ Lift % view (treatments vs control)
  ├─ Draggable CI bounds
  ├─ Toggle to absolute $ view
  └─ Baseline selector dropdown

Click variant → Deep Dive
  ├─ Larger quantile dotplot (100 dots)
  ├─ Sankey decomposition (if compound)
  ├─ Segment breakdown (if applicable)
  ├─ Cost function calculator (future)
  └─ Export results
```

---

## Main Results View

### Layout: Lift View (Default)

```
┌─────────────────────────────────────────────────────────────┐
│  Experiment Results: Revenue Lift vs Control                │
│                                                              │
│  Baseline: [Control ▼]  View: [Lift % | Absolute $]        │
│  Credible Interval Width: [80%] [Reset to 80%]             │
│  Current bounds: 10%-90%                                     │
│  [☐ Show Control uncertainty]  [+ Add Threshold]           │
│                                                              │
│  Scale:  -10%     0%     +10%    +20%    +30%    +40%      │
│           ├────────┼────────┼────────┼────────┼────────┤   │
│                    ↑ Zero (no effect)                        │
│                                                              │
│  Variant A  ✓ Very likely positive (click for deep dive)   │
│  │     10%|←────••••••••••••••••────→|90%                  │
│  │      +8.2%        +15.3%        +22.7%                   │
│  │                  (median)                                 │
│  │                                                           │
│  │  80% credible interval: +8.2% to +22.7%                 │
│  │  (80% probability the lift is in this range)            │
│  │                                                           │
│  │  89% probability of exceeding Control                    │
│  └─────────────────────────────────────────────────────────│
│                                                              │
│  Variant B  ~ Possibly positive                             │
│  │     10%|←────•••••••••••••────→|90%                     │
│  │      +2.1%       +7.2%      +13.8%                      │
│  │                 (median)                                  │
│  │                                                           │
│  │  80% credible interval: +2.1% to +13.8%                 │
│  │  (80% probability the lift is in this range)            │
│  │                                                           │
│  │  67% probability of exceeding Control                    │
│  └─────────────────────────────────────────────────────────│
│                                                              │
│  [Show Segments]  [Export Results]  [Pairwise Comparison]  │
└─────────────────────────────────────────────────────────────┘
```

### Layout: Absolute View (Toggle)

```
┌─────────────────────────────────────────────────────────────┐
│  Experiment Results: Revenue Per User                       │
│                                                              │
│  Baseline: [Control ▼]  View: [Lift % | Absolute $]        │
│  Credible Interval Width: [80%] [Reset to 80%]             │
│  Current bounds: 10%-90%                                     │
│                                                              │
│  Scale:  $30      $40      $50      $60      $70      $80  │
│           ├────────┼────────┼────────┼────────┼────────┤   │
│                    ↑ Control median ($45)                   │
│                                                              │
│  Control                                                     │
│  │ 10%|←──────•••••••••••••••••──→|90%                     │
│  │  $41.20      $45.00         $48.90                       │
│  │  80% credible interval: $41.20 to $48.90                │
│  └─────────────────────────────────────────────────────────│
│                                                              │
│  Variant A                                                   │
│  │     10%|←────••••••••••••••••────→|90%                  │
│  │    $48.20       $52.10         $57.30                    │
│  │    80% credible interval: $48.20 to $57.30              │
│  │                                                           │
│  │    Lift: +15.3% [10%-90%: +8.2% to +22.7%]             │
│  │    89% probability > Control                             │
│  └─────────────────────────────────────────────────────────│
│                                                              │
│  Variant B                                                   │
│  │     10%|←────•••••••••••••────→|90%                     │
│  │    $45.10       $48.20         $51.80                    │
│  │    80% credible interval: $45.10 to $51.80              │
│  │                                                           │
│  │    Lift: +7.2% [10%-90%: +2.1% to +13.8%]              │
│  │    67% probability > Control                             │
│  └─────────────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────┘
```

**Key differences:**

- Absolute view always shows Control (it's the reference)
- Lift view hides Control by default (it's the baseline at 0%)
- Reference line changes: 0% in lift view, Control median in absolute view
- Lift stats shown as secondary info in absolute view

### Control Visibility Toggle

**Default in Lift View:** Control hidden
**Rationale:** Control vs itself = 0% lift always, not informative

**When "Show Control uncertainty" checked:**

```
│  Control (uncertainty in estimating Control's mean)         │
│  │ 10%|←──────•••••••••••••••••──→|90%                     │
│  │    -4.2%         0%           +3.8%                      │
│  │    (Shows our uncertainty about Control itself)          │
│  │    This helps assess baseline stability                  │
│  └─────────────────────────────────────────────────────────│
```

**Use case:**

- Diagnose whether Control is well-estimated
- Wide Control CI = noisy baseline, differences harder to detect
- Narrow Control CI = stable baseline, more trust in comparisons

---

## Credible Interval Interactions

### Symmetric CI Adjustment

**Top-level control:**

```
Credible Interval Width: [80%]
```

**User types "95" in box:**

1. All variants update to symmetric 95% CI
2. Left bound: 2.5th percentile
3. Right bound: 97.5th percentile
4. Label updates: "2.5%-97.5% interval"
5. Current bounds display: "2.5%-97.5%"

**Visual update:**

- CI bound markers `|←` and `→|` slide to new positions
- Interval widens on all variants simultaneously
- Smooth 300ms animation

### Asymmetric CI Adjustment

**User drags left bound (on any variant):**

```
Initial state: 10%-90% (80% coverage)
User drags left bound from 10% → 5%
Result: 5%-90% (85% coverage)
```

**Effects:**

1. Left bound marker moves to 5th percentile position
2. Right bound stays at 90th percentile
3. All other variants sync to 5%-90%
4. Top control updates: "Current bounds: 5%-90%"
5. Coverage calculation: 90% - 5% = 85%

**Visual indicators:**

- Percentile labels on bounds: `5%|←` and `→|90%`
- Coverage shown below: "85% probability the lift is in this range"
- Tail probabilities: "5% chance below, 10% chance above"

**User drags right bound:**

```
Current: 5%-90% (85% coverage)
User drags right bound from 90% → 95%
Result: 5%-95% (90% coverage)
```

**Same sync behavior:** All variants update to 5%-95%

### Reset Button

**Behavior:**

- Resets all intervals to centered 80% (10th to 90th percentile)
- Returns to symmetric configuration
- Top control shows: "80%" width, "10%-90%" bounds

### Labeling Strategy

**Symmetric intervals:**

```
80% credible interval: +8.2% to +22.7%
(10th to 90th percentile)
80% probability the lift is in this range
```

**Asymmetric intervals:**

```
[5%-90% interval]: +5.1% to +22.7%
85% probability the lift is in this range

Breakdown:
- 5% probability below +5.1%
- 85% probability between +5.1% and +22.7%
- 10% probability above +22.7%
```

**Very asymmetric (e.g., 5%-99%):**

```
[5%-99% interval]: +5.1% to +31.2%
94% probability the lift is in this range

Conservative estimate focused on downside risk
(only 5% chance worse than +5.1%)
```

### Plain English Interpretations

**Hover tooltip on CI bound:**

```
┌────────────────────────────────────────────────┐
│ Understanding Credible Intervals               │
│                                                 │
│ This interval shows where we believe the lift  │
│ is likely to be, given our data.               │
│                                                 │
│ Your current interval: 5%-90%                  │
│ Coverage: 85%                                   │
│                                                 │
│ This means:                                     │
│ • 85% probability lift is between              │
│   +5.1% and +22.7%                             │
│ • 5% probability it's lower than +5.1%        │
│ • 10% probability it's higher than +22.7%     │
│                                                 │
│ Why asymmetric?                                 │
│ You've chosen to focus more on downside risk   │
│ (wider lower tail = 5% vs 10% upper tail)     │
└────────────────────────────────────────────────┘
```

---

## Visualization Components

**See [d3-component-api-reference.md](./d3-component-api-reference.md) for complete component specifications.**

All visualization components are **pure D3** (framework-agnostic) and use the closure pattern with getter-setter methods. Key components:

1. **QuantileDots** - Individual variant visualization with quantile dotplot and optional KDE violin overlay
2. **RidgeDotplot** - Multi-variant ridge layout using QuantileDots for each variant
3. **DraggableCIBounds** - Interactive CI handles (integrated into RidgeDotplot)
4. **ThresholdLine** - Draggable business threshold overlay
5. **Tooltip** - Context-aware tooltips with plain English
6. **SankeyDecomposition** (Future) - Compound model decomposition visualization

**Framework Integration:** Components work in vanilla JS, Observable, React, Vue, etc. via thin event-driven wrappers (see below).

---

## Framework Integration

### Observable Framework Integration

Observable Framework is our **first integration**, but visualizations are not coupled to it.

**Project structure:**

```
examples/observable-demo/
├── src/
│   ├── index.md              # Landing page
│   ├── results.md            # Main results view
│   ├── condition.md          # Deep-dive view
│   ├── components/
│   │   └── wrappers.js       # Thin Observable wrappers
│   └── lib/
│       └── tyche.js          # Built bundle (includes viz)
└── package.json
```

**Wrapper pattern:**

```javascript
// src/components/wrappers.js

import { RidgeDotplot } from '../lib/tyche.js';

/**
 * Observable-specific wrapper for RidgeDotplot
 * Wires D3 events to Observable reactive cells
 */
export function createRidgePlot(container, data, options, mutableCells) {
  // Create component using closure pattern
  const viz = RidgeDotplot()
    .ciLower(options.ciLower)
    .ciUpper(options.ciUpper)
    .showViolin(true)
    .numDots(20);

  // Wire events to Observable Mutable cells
  viz.on('ciDrag', (event) => {
    mutableCells.ciLower.value = event.detail.lower;
    mutableCells.ciUpper.value = event.detail.upper;
  });

  viz.on('thresholdDrag', (event) => {
    mutableCells.threshold.value = event.detail.value;
  });

  viz.on('variantClick', (event) => {
    // Navigate to deep-dive page
    window.location.href = `/condition?variant=${event.detail.name}`;
  });

  // Render
  d3.select(container).datum(data).call(viz);

  return viz;
}
```

**Usage in Observable Markdown:**

```javascript
// src/results.md

import { createRidgePlot } from './components/wrappers.js';

// Reactive state (Observable Mutable cells)
viewof ciLower = Mutable(0.1);
viewof ciUpper = Mutable(0.9);
viewof threshold = Mutable(null);
viewof baseline = Inputs.select(variantNames);

// Computed data (auto-updates when dependencies change)
displayData = computeDisplayData(analysisResult, baseline, ciLower, ciUpper);

// Render visualization
chart = {
  const container = html`<div class="ridge-plot"></div>`;

  const viz = createRidgePlot(
    container,
    displayData,
    { ciLower, ciUpper, threshold },
    { ciLower, ciUpper, threshold }  // Mutable cells
  );

  return container;
}

// Observable reactivity: when cells change, update viz
{
  if (chart && viz) {
    viz.ciLower(ciLower).ciUpper(ciUpper);
    d3.select(chart).call(viz);  // Re-render with new config
  }
}
```

**Benefits:**

- Observable's reactive cells drive state
- D3 viz has no Observable dependencies
- Clean separation of concerns
- Easy to test each layer independently

### React Integration (Future)

**Example React wrapper:**

```typescript
// src/react/RidgePlot.tsx

import { useEffect, useRef } from 'react';
import { RidgeDotplot } from 'tyche/visualizations';
import * as d3 from 'd3';

interface RidgePlotProps {
  data: RidgeDotplotData;
  ciLower: number;
  ciUpper: number;
  threshold?: number;
  onCIDrag?: (bounds: {lower: number, upper: number}) => void;
  onThresholdDrag?: (value: number) => void;
  onVariantClick?: (name: string) => void;
}

export function RidgePlot({
  data,
  ciLower,
  ciUpper,
  threshold,
  onCIDrag,
  onThresholdDrag,
  onVariantClick
}: RidgePlotProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vizRef = useRef<ReturnType<typeof RidgeDotplot> | null>(null);

  // Initialize viz on mount
  useEffect(() => {
    if (!containerRef.current) return;

    // Create component using closure pattern
    vizRef.current = RidgeDotplot()
      .ciLower(ciLower)
      .ciUpper(ciUpper)
      .showViolin(true)
      .numDots(20);

    // Wire up events
    if (onCIDrag) {
      vizRef.current.on('ciDrag', (event) => onCIDrag(event.detail));
    }
    if (onThresholdDrag) {
      vizRef.current.on('thresholdDrag', (event) => onThresholdDrag(event.detail.value));
    }
    if (onVariantClick) {
      vizRef.current.on('variantClick', (event) => onVariantClick(event.detail.name));
    }

    // Render
    d3.select(containerRef.current).datum(data).call(vizRef.current);

    // Cleanup
    return () => {
      vizRef.current?.on('ciDrag', null);
      vizRef.current?.on('thresholdDrag', null);
      vizRef.current?.on('variantClick', null);
    };
  }, []);

  // Update when props change
  useEffect(() => {
    if (vizRef.current && containerRef.current) {
      vizRef.current.ciLower(ciLower).ciUpper(ciUpper);
      d3.select(containerRef.current).call(vizRef.current);
    }
  }, [ciLower, ciUpper]);

  useEffect(() => {
    if (vizRef.current && containerRef.current) {
      d3.select(containerRef.current).datum(data).call(vizRef.current);
    }
  }, [data]);

  return <div ref={containerRef} />;
}
```

**Usage:**

```typescript
function App() {
  const [ciLower, setCILower] = useState(0.1);
  const [ciUpper, setCIUpper] = useState(0.9);
  const [threshold, setThreshold] = useState<number | null>(null);

  return (
    <RidgePlot
      data={analysisData}
      ciLower={ciLower}
      ciUpper={ciUpper}
      threshold={threshold}
      onCIDrag={(bounds) => {
        setCILower(bounds.lower);
        setCIUpper(bounds.upper);
      }}
      onThresholdDrag={setThreshold}
      onVariantClick={(name) => navigate(`/condition/${name}`)}
    />
  );
}
```

### Vanilla JavaScript (Simplest)

**No framework needed** - progressive disclosure from simple to detailed.

#### Quick Start (Recommended)

For users who want to get results quickly with sensible defaults:

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="tyche.js"></script>
  </head>
  <body>
    <div id="chart"></div>

    <script>
      // Analyze and visualize in 2 lines
      const result = await tyche.experiment(csvData).forMetric('revenue').analyze();
      const viz = await tyche.renderLiftComparison(result, '#chart');
    </script>
  </body>
</html>
```

**Opinionated defaults:**

- Baseline: First variant (alphabetically) or variant named "control"
- CI bounds: 80% credible interval (10th to 90th percentile)
- Number of dots: 20
- Violin overlay: Enabled

**Override defaults:** Pass options object as 3rd argument:

```javascript
const viz = await tyche.renderLiftComparison(result, '#chart', {
  baseline: 'variant_a',
  ciLower: 0.05,
  ciUpper: 0.95,
  numDots: 50,
  showViolin: false,
});
```

#### Understanding the Pipeline (For Learning)

For users who want to see what happens under the hood:

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="tyche.js"></script>
  </head>
  <body>
    <div id="chart"></div>

    <script>
      async function runAnalysis() {
        // Step 1: Parse CSV into ExperimentData
        const csvText = await d3.text('experiment.csv');
        const experimentData = tyche.parseExperimentCSV(csvText, {
          variantColumn: 'variant',
          metricColumn: 'revenue',
          conversionColumn: 'converted',
        });

        // Step 2: Run Bayesian analysis
        const analyzer = new tyche.RevenueAnalyzer();
        const analysisResult = await analyzer.analyze(experimentData);

        // Step 3: Compare variants to get lift samples
        const comparison = await analysisResult.compareVariants({
          baseline: 'control', // Uses first variant if not specified
        });

        // Step 4: Extract visualization data
        const vizData = {
          variants: Array.from(comparison.comparisons.entries()).map(([name, comp]) => ({
            name: name,
            displayName: name.charAt(0).toUpperCase() + name.slice(1),
            samples: comp.liftSamples, // number[] from Tyche
          })),
        };

        // Step 5: Create and render D3 visualization
        const viz = tyche
          .RidgeDotplot()
          .ciLower(0.1) // Default: 10th percentile
          .ciUpper(0.9) // Default: 90th percentile
          .showViolin(true) // Default: enabled
          .numDots(20); // Default: 20 dots

        d3.select('#chart').datum(vizData).call(viz);

        // Optional: Handle interactions
        viz.on('ciDrag', (event) => {
          viz.ciLower(event.detail.lower).ciUpper(event.detail.upper);
          d3.select('#chart').call(viz);
        });

        return viz;
      }

      runAnalysis();
    </script>
  </body>
</html>
```

**What `renderLiftComparison()` does:** This helper function wraps steps 3-5 above, providing a streamlined API while maintaining full access to the underlying components when needed.

**See also:** The [Data Pipeline](#data-pipeline) section below provides complete TypeScript examples of the full data transformation process.

---

## Data Pipeline

### Input: CSV Upload

**Required format (Phase 1):**

```csv
user_id,variant,converted,revenue
u001,control,1,45.00
u002,control,0,0.00
u003,treatment_a,1,52.30
u004,treatment_a,1,48.00
...
```

**Validation:**

- At least 2 unique variants (1 control + 1+ treatments)
- At least 30 users per variant
- `converted` is 0 or 1
- `revenue` is non-negative number
- No missing required values

**Future (Phase 2):** Flexible column mapping UI

### Processing: CSV → StandardData

```typescript
// Parse CSV
const rows = d3.csvParse(csvText);

// Group by variant
const variantGroups = d3.group(rows, (d) => d.variant);

// Convert each variant to StandardData
const variants = new Map();
for (const [variantName, users] of variantGroups) {
  const userData: UserLevelData[] = users.map((u) => ({
    userId: u.user_id,
    value: parseFloat(u.revenue),
    converted: parseInt(u.converted) === 1,
    features: {}, // Future: extract additional columns
  }));

  variants.set(variantName, {
    name: variantName,
    data: StandardDataFactory.fromUserLevel(userData),
  });
}

// Create ExperimentData
const experimentData: ExperimentData = {
  id: `exp-${Date.now()}`,
  name: 'User Experiment',
  variants: {
    control: variants.get('control'),
    treatments: new Map([...variants].filter(([k]) => k !== 'control')),
  },
  metadata: {
    startDate: new Date(),
    hypothesis: 'User-provided experiment',
  },
};
```

### Analysis: ExperimentData → AnalysisResult

```typescript
// Run Tyche analysis
const analyzer = new RevenueAnalyzer();
const analysisResult = await analyzer.analyze(experimentData);

// Get comparisons
const variantComparison = await analysisResult.compareVariants({
  baseline: 'control',
});
```

### Transform: AnalysisResult → Visualization Data

**CRITICAL**: This section shows the exact Tyche API calls for extracting visualization data.

```typescript
// 1. Run analysis to get ExperimentResult
const analysisResult: ExperimentResult = await analyzer.analyze(experimentData);

// 2. Compare variants to get lift/effect samples
const comparison = await analysisResult.compareVariants({
  baseline: 'control', // Can be changed dynamically by user
});

// 3. Extract data for visualizations
const vizData = {
  absolute: [], // For absolute value view
  lift: [], // For lift view (default)
};

// Get absolute posterior samples for each variant
for (const [name, variantResult] of analysisResult.getAllVariantResults()) {
  const absoluteSamples = variantResult.getPosteriorSamples(10000);

  vizData.absolute.push({
    name: name,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    samples: absoluteSamples, // Returns number[], not Float64Array
    isBaseline: name === 'control',
  });
}

// Get lift samples for treatments (not control)
for (const [variantName, comparisonResult] of comparison.comparisons) {
  vizData.lift.push({
    name: variantName,
    displayName: variantName.charAt(0).toUpperCase() + variantName.slice(1),
    samples: comparisonResult.liftSamples, // Already number[]
    isBaseline: false,
  });
}

// 4. For compound model decomposition (optional)
const controlResult = analysisResult.getVariantResult('control');
if (controlResult && controlResult.isCompoundModel()) {
  const decomposition = controlResult.getDecomposition();
  if (decomposition) {
    // decomposition: { frequency: Posterior, severity: Posterior }
    const freqSamples = decomposition.frequency.sample(10000);
    const sevSamples = decomposition.severity.sample(10000);
    // Use for Sankey visualization (future)
  }
}

// 5. Get probability statements
const primaryComparison = comparison.comparisons.get('variant_a');
if (primaryComparison) {
  const probPositive = primaryComparison.probabilityPositive; // P(lift > 0)
  const probMeaningful = primaryComparison.probabilityMeaningful; // P(lift > threshold)
}
```

### Render: Visualization Data → D3 Components

```typescript
// Create visualization using closure pattern
const viz = RidgeDotplot().ciLower(0.1).ciUpper(0.9).showViolin(true).numDots(20);

// Render with lift data (default view)
d3.select('#chart').datum({ variants: vizData.lift }).call(viz);

// Handle interactions
viz.on('ciDrag', (event) => {
  // Update application state
  updateCIBounds(event.detail);
});

viz.on('variantClick', (event) => {
  // Navigate to deep-dive
  navigateToDeepDive(event.detail.name);
});

// Toggle to absolute view
function showAbsoluteView() {
  d3.select('#chart').datum({ variants: vizData.absolute }).call(viz);
}

// Change baseline (requires re-running comparison)
async function changeBaseline(newBaseline: string) {
  const newComparison = await analysisResult.compareVariants({
    baseline: newBaseline,
  });

  // Re-extract lift data...
  const newLiftData = [];
  for (const [name, result] of newComparison.comparisons) {
    newLiftData.push({
      name,
      displayName: name.charAt(0).toUpperCase() + name.slice(1),
      samples: result.liftSamples,
    });
  }

  // Re-render
  d3.select('#chart').datum({ variants: newLiftData }).call(viz);
}
```

---

## Implementation Phases

### Phase 1: Core D3 Visualization Components (Week 1)

**Goal:** Build framework-agnostic D3 components

**Tasks:**

1. **Project Setup** (Day 1)
   - Create `src/visualizations/` directory
   - Set up TypeScript build for viz components
   - Configure exports in package.json

2. **QuantileDots Component** (Day 1-2)
   - Quantile computation algorithm
   - Dot stacking/binning logic
   - Rendering with D3
   - Hover interactions
   - Tests

3. **RidgeDotplot Component** (Day 2-3)
   - Ridge layout (multiple variants)
   - Integrate QuantileDots
   - Scales and axes
   - Reference line
   - Optional violin overlay
   - Tests

4. **DraggableCIBounds Component** (Day 3-4)
   - Visual handles with percentile labels
   - Drag interaction
   - Sync across variants
   - Event emission
   - Constraints (min/max percentiles)
   - Tests

5. **ThresholdLine Component** (Day 4)
   - Draggable vertical line
   - Value label
   - Event emission
   - Tests

6. **Tooltip Component** (Day 5)
   - Positioning logic
   - Content formatting
   - Context-aware display
   - Tests

**Deliverable:** Standalone D3 visualization library that works in any browser

### Phase 2: Observable Framework Integration (Week 2)

**Goal:** Build demo application using Observable Framework

**Tasks:**

1. **Observable Project Setup** (Day 6)
   - Initialize Observable Framework project
   - Build Tyche library (inference + viz)
   - Copy built bundle to Observable
   - Configure data loaders

2. **Data Upload Flow** (Day 6-7)
   - CSV upload component
   - Validation logic
   - Error handling
   - Example datasets

3. **Observable Wrappers** (Day 7)
   - Create wrapper functions
   - Wire D3 events to Mutable cells
   - Handle reactive updates

4. **Main Results Page** (Day 8)
   - Layout with controls
   - Render RidgeDotplot via wrapper
   - Baseline selector
   - View toggle (lift/absolute)
   - CI controls
   - Threshold button

5. **Deep-Dive Page** (Day 9)
   - Larger quantile dotplot (100 dots)
   - Navigation from main page
   - Placeholder for decomposition
   - Export functionality

6. **Polish & Deploy** (Day 10)
   - Styling and responsive design
   - Cross-browser testing
   - Documentation
   - Deploy to Observable

**Deliverable:** Working demo application on Observable Framework

### Phase 3: Segments & Decomposition (Future)

**Deferred to later sprint:**

- Sankey decomposition component
- Manual segmentation UI
- Segment comparison visualizations
- Causal tree design (implementation deferred)

### Phase 4: Advanced Features (Future)

**Deferred:**

- Cost function calculator
- Pairwise comparison matrix
- Power analysis integration
- React/Vue wrappers
- Multi-threshold support

---

## Design Decisions Log

### Decided

1. ✅ **Framework-agnostic D3 components** - Core visualizations work anywhere
2. ✅ **Observable Framework as first integration** - But not required by viz
3. ✅ **Event-based API** - Components emit events, frameworks wire them up
4. ✅ **Lift is primary view** - Default to treatment effects
5. ✅ **Always show uncertainty** - Never naked point estimates
6. ✅ **Draggable CI bounds** - Direct manipulation on plot
7. ✅ **Asymmetric CI support** - Independent left/right handles
8. ✅ **Synced CIs across variants** - Fair comparison
9. ✅ **Control hidden in lift view** - Toggle to show
10. ✅ **Plain English interpretations** - No jargon in main UI
11. ✅ **Quantile dotplots** - 20 in overview, 100 in deep-dive
12. ✅ **Browser-based computation** - Privacy-first, client-side only

### Resolved Decisions

1. ✅ **Default CI width**: **80%** (10th-90th percentile) - Standard practice, easy to explain
2. ✅ **Color scheme**: Start with simple colors from API spec (green/blue/gray), refine for colorblind accessibility later
3. ✅ **Threshold default position**: **Median of best performing variant** - Provides meaningful business context
4. ✅ **Violin overlay**: **ON by default** - Provides additional distributional context
5. ✅ **Number of example datasets**: **3-5 datasets** - Cover binary conversion, revenue, different effect sizes and sample sizes

### Deferred Decisions

1. ⏳ **Pairwise comparison UI**: Defer detailed design until Phase 3
2. ⏳ **Cost function interface**: Defer until business context features
3. ⏳ **HTE visualization**: Needs causal tree implementation first
4. ⏳ **Library refactoring**: Make `control` less special (low priority)
5. ⏳ **React/Vue wrappers**: Build after Observable demo works

---

## File Structure

### Core Library

```
tyche/
├── src/
│   ├── core/                    # Bayesian inference
│   ├── domain/                  # Analyzers, results
│   └── visualizations/          # NEW: D3 components
│       ├── core/
│       │   ├── RidgeDotplot.ts
│       │   ├── QuantileDots.ts
│       │   ├── DraggableCIBounds.ts
│       │   ├── ThresholdLine.ts
│       │   ├── Tooltip.ts
│       │   └── SankeyDecomposition.ts (future)
│       ├── utils/
│       │   ├── quantiles.ts
│       │   ├── scales.ts
│       │   └── EventEmitter.ts
│       ├── types.ts
│       └── index.ts
├── dist/
│   ├── index.js                 # Main bundle (inference)
│   └── visualizations/
│       └── index.js             # Viz bundle (D3 components)
└── package.json
```

### Observable Demo

```
examples/observable-demo/
├── src/
│   ├── index.md                 # Landing
│   ├── results.md               # Main results view
│   ├── condition.md             # Deep-dive
│   ├── components/
│   │   └── wrappers.js          # Observable-specific wrappers
│   ├── lib/
│   │   └── tyche.js             # Built Tyche bundle
│   └── data/
│       └── examples.json        # Sample datasets
└── package.json
```

### Future: Vanilla Demo

```
examples/vanilla-demo/
├── index.html
├── app.js                       # Pure vanilla JS
└── tyche.js                     # Same bundle as Observable
```

---

**End of Specification**

**Next Steps:**

1. ✅ Review and approve this specification
2. Create D3 component API reference
3. Set up project structure
4. Begin Phase 1 implementation (D3 components)

**Questions or clarifications?** Update "Open Questions" and discuss before implementation.
