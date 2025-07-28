# Visualizations

React components for visualizing distributions, posteriors, and diagnostic info.

## Overview

The visualization system has evolved to handle async posteriors (from WebWorkers) and provide a unified API for all your distribution plotting needs. The star of the show is `UnifiedDistributionViz` which can handle pretty much any visualization scenario.

## Quick Start

```typescript
import { UnifiedDistributionViz } from './unified';

// Basic density plot
<UnifiedDistributionViz
  distributions={[
    { id: 'posterior', label: 'My Posterior', posterior: myPosterior }
  ]}
/>

// Comparison plot
<UnifiedDistributionViz
  distributions={[
    { id: 'control', label: 'Control', posterior: controlPosterior },
    { id: 'treatment', label: 'Treatment', posterior: treatmentPosterior }
  ]}
  comparison={{ mode: 'overlay' }}
/>
```

## Core Components

### UnifiedDistributionViz

The main visualization component that handles everything:
- Density plots, histograms, ECDFs, ridge plots
- Async posterior sampling with progress
- Comparison analysis (overlay, difference, ratio)
- Multiple uncertainty levels
- PPC diagnostics

```typescript
interface UnifiedDistributionVizProps {
  distributions: Distribution[];      // What to plot
  display?: DisplayConfig;           // How to show it
  comparison?: ComparisonConfig;     // Compare distributions
  width?: number;
  height?: number;
  // ... formatting options
}
```

### Display Modes

```typescript
display={{
  mode: 'density',      // Smooth density curves (default)
  mode: 'histogram',    // Classic bins
  mode: 'ecdf',        // Cumulative distribution
  mode: 'ridge',       // Ridge plot for many distributions
  mode: 'mixed',       // Histogram + density overlay
  
  showMean: true,      // Vertical line at mean
  showCI: true,        // Shaded credible intervals
  ciLevels: [0.95, 0.8, 0.5],  // Multiple CI levels
}}
```

### AsyncPosteriorSummary

Shows summary statistics for any posterior (sync or async):

```typescript
<AsyncPosteriorSummary 
  posterior={result.posterior}
  modelType="beta-binomial"  // Optional, for nice labels
/>
```

Handles compound posteriors automatically, showing:
- Frequency stats (conversion rate)
- Severity stats (value per conversion) 
- Combined metric (revenue per user)

### DiagnosticsPanel

Displays convergence diagnostics and model info:

```typescript
<DiagnosticsPanel diagnostics={result.diagnostics} />
```

Shows:
- Convergence status
- Number of iterations
- Runtime
- Model type
- Any warnings or issues

### AsyncPPCDiagnostics

Posterior predictive checks for model validation:

```typescript
<AsyncPPCDiagnostics
  observedData={originalData}
  posterior={result.posterior}
  modelType="normal-mixture"
/>
```

## Architecture

### Async Sampling

All components handle async posteriors transparently:

```typescript
// The component detects if it's async and handles it
if (posterior instanceof PosteriorProxy) {
  // Samples in worker, shows progress
  const samples = await posterior.sample(10000);
} else if (posterior.sample) {
  // Regular posterior, samples in batches
  const samples = generateSamplesInBatches(posterior);
}
```

### State Management

The `useDistributionStates` hook manages:
- Sample generation progress
- Caching to avoid regeneration
- Error boundaries
- Cancellation on unmount

### Comparison Analysis

Built-in comparison calculations:

```typescript
comparison={{
  mode: 'overlay',           // Overlay distributions
  mode: 'difference',        // Plot A - B
  mode: 'ratio',            // Plot A / B
  mode: 'probability',       // P(A > B) visualization
  
  showProbabilityOfImprovement: true,
  probabilityGradient: true,  // Gradient showing uncertainty
}}
```

## Examples

### Simple Posterior Plot

```typescript
<UnifiedDistributionViz
  distributions={[{
    id: 'beta',
    label: 'Conversion Rate',
    posterior: betaPosterior,
    color: '#3B82F6'
  }]}
  display={{
    mode: 'density',
    showMean: true,
    showCI: true
  }}
  formatValue={(v) => `${(v * 100).toFixed(1)}%`}
/>
```

### A/B Test Comparison

```typescript
<UnifiedDistributionViz
  distributions={[
    { id: 'control', label: 'Control', posterior: controlPost },
    { id: 'treatment', label: 'Treatment', posterior: treatmentPost }
  ]}
  comparison={{
    mode: 'overlay',
    showProbabilityOfImprovement: true
  }}
  display={{
    mode: 'density',
    opacity: 0.7  // See through overlaps
  }}
/>
```

### Revenue Analysis (Compound Model)

```typescript
// For compound posteriors, plot revenue per user
<UnifiedDistributionViz
  distributions={[{
    id: 'revenue',
    label: 'Revenue per User',
    posterior: compoundPosterior,  // Has .frequency and .severity
    metadata: { 
      modelType: 'compound-beta-lognormal' 
    }
  }]}
  formatValue={(v) => `$${v.toFixed(2)}`}
/>
```

### Multiple Segments

```typescript
const segments = ['mobile', 'desktop', 'tablet'];
const colors = ['#3B82F6', '#EF4444', '#10B981'];

<UnifiedDistributionViz
  distributions={segments.map((seg, i) => ({
    id: seg,
    label: seg.charAt(0).toUpperCase() + seg.slice(1),
    posterior: posteriors[seg],
    color: colors[i]
  }))}
  display={{ mode: 'ridge' }}  // Ridge plot for multiple
/>
```

## Performance Tips

1. **Sample caching** - The system caches samples by default
2. **Adaptive sampling** - Fewer samples for simpler distributions
3. **Progressive loading** - Shows progress during generation
4. **Debouncing** - Prevents regeneration on rapid updates

## Migration from Old Components

If you're using the old components:

```typescript
// Old
<SimpleViolinPlot posterior={posterior} />

// New
<UnifiedDistributionViz
  distributions={[{ id: 'main', label: 'Posterior', posterior }]}
  display={{ mode: 'density' }}
/>
```

## Extending

### Custom Renderers

The system uses a renderer pattern:

```typescript
// In renderers/customRenderer.ts
export function renderCustomPlot(
  container: d3.Selection,
  data: DistributionState[],
  scales: { x: ScaleLinear, y: ScaleLinear },
  config: DisplayConfig
) {
  // Your D3 code here
}
```

### Custom Annotations

Add your own annotations:

```typescript
function MyAnnotation({ distributions, scale }) {
  const mean = distributions[0].stats?.mean;
  return (
    <text x={scale(mean)} y={20}>
      Mean: {mean.toFixed(2)}
    </text>
  );
}
```

## Common Patterns

### Loading States

```typescript
const MyViz = () => {
  const [data, setData] = useState(null);
  
  if (!data) {
    return <div>Loading...</div>;
  }
  
  return (
    <UnifiedDistributionViz
      distributions={[{ id: 'data', label: 'Results', posterior: data }]}
    />
  );
};
```

### Error Boundaries

All viz components are wrapped in error boundaries:

```typescript
<VisualizationErrorBoundary>
  <UnifiedDistributionViz {...props} />
</VisualizationErrorBoundary>
```

### Responsive Sizing

```typescript
const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

useEffect(() => {
  const handleResize = () => {
    setDimensions({
      width: containerRef.current?.clientWidth || 800,
      height: 400
    });
  };
  
  window.addEventListener('resize', handleResize);
  handleResize();
  
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

## Not Implemented Yet

- Interactive tooltips (coming soon)
- Brush selection for zooming
- Export to SVG/PNG
- Animation between states
- 3D visualizations

## File Structure

```
visualizations/
├── unified/                # Main visualization system
│   ├── UnifiedDistributionViz.tsx
│   ├── renderers/         # D3 rendering functions
│   ├── hooks/            # State management
│   └── types.ts          # TypeScript interfaces
├── base/                 # Shared utilities
│   ├── useAsyncPosterior.ts
│   └── formatters.ts
├── AsyncPosteriorSummary.tsx
├── DiagnosticsPanel.tsx
└── index.ts              # Public exports
```