# UnifiedDistributionViz Migration Guide

## Overview

The `UnifiedDistributionViz` component replaces multiple visualization components with a single, flexible solution that handles all distribution visualization needs.

## Philosophy: Continuous Reasoning vs Binary Decisions

This visualization system embraces Bayesian continuous reasoning:

- **No "significance" testing** - We show probabilities as continuous measures
- **No arbitrary thresholds** - 95% CI is not special, show multiple uncertainty levels
- **Focus on practical effects** - "How much better?" not "Is it significant?"
- **Embrace uncertainty** - Show full distributions, not just point estimates

Instead of asking "Is this significant?", we ask:
- What's the probability of improvement?
- How large might the improvement be?
- What's the probability of exceeding a practical threshold?
- What's our uncertainty about these estimates?

## Component Mapping

| Old Component | New Component | Migration Notes |
|--------------|---------------|-----------------|
| `AsyncDistributionPlot` | `UnifiedDistributionViz` | Single distribution with density mode |
| `AsyncPPCVisualizer` | `UnifiedDistributionViz` | Observed + predictive distributions |
| `AsyncUpliftPlot` | `UnifiedDistributionViz` | Use comparison mode: 'difference' |
| `AsyncComparisonPlot` | `UnifiedDistributionViz` | Multiple distributions with overlay/ridge |
| `AsyncViolinPlot` | `UnifiedDistributionViz` | Use ridge mode for similar effect |

## Migration Examples

### 1. AsyncDistributionPlot → UnifiedDistributionViz

**Before:**
```typescript
<AsyncDistributionPlot
  posterior={result.posterior}
  variantName="Revenue"
  showMean={true}
  showCI={true}
  color="#3b82f6"
/>
```

**After:**
```typescript
<UnifiedDistributionViz
  distributions={[{
    id: 'revenue',
    label: 'Revenue',
    posterior: result.posterior,
    color: '#3b82f6'
  }]}
  display={{
    mode: 'density',
    showMean: true,
    showCI: true
  }}
/>
```

### 2. AsyncPPCVisualizer → UnifiedDistributionViz

**Before:**
```typescript
<AsyncPPCVisualizer
  observedData={data}
  posterior={result.posterior}
  showCI={true}
  ciLevels={[0.95, 0.8]}
/>
```

**After:**
```typescript
<UnifiedDistributionViz
  distributions={[
    {
      id: 'observed',
      label: 'Observed Data',
      samples: data,
      metadata: { isObserved: true }
    },
    {
      id: 'predictive',
      label: 'Posterior Predictive',
      posterior: result.posterior
    }
  ]}
  display={{
    mode: 'density',
    showCI: true,
    ciLevels: [0.8, 0.5]
  }}
/>
```

### 3. AsyncUpliftPlot → UnifiedDistributionViz

**Before:**
```typescript
<AsyncUpliftPlot
  controlPosterior={controlResult.posterior}
  treatmentPosterior={treatmentResult.posterior}
  controlName="Control"
  treatmentName="Treatment"
  showDensity={true}
  credibleLevel={0.95}
/>
```

**After:**
```typescript
<UnifiedDistributionViz
  distributions={[
    {
      id: 'control',
      label: 'Control',
      posterior: controlResult.posterior,
      metadata: { isBaseline: true }
    },
    {
      id: 'treatment',
      label: 'Treatment',
      posterior: treatmentResult.posterior
    }
  ]}
  comparison={{
    mode: 'difference',
    baseline: 'control',
    showProbabilityOfImprovement: true
  }}
  display={{
    mode: 'density',
    showCI: true,
    ciLevels: [0.8, 0.5]
  }}
/>
```

### 4. AsyncComparisonPlot → UnifiedDistributionViz

**Before:**
```typescript
<AsyncComparisonPlot
  variants={[
    { name: 'Control', posterior: controlPosterior },
    { name: 'Variant A', posterior: variantAPosterior },
    { name: 'Variant B', posterior: variantBPosterior }
  ]}
  plotType="overlapping"
  showMeans={true}
  showCredibleIntervals={true}
/>
```

**After:**
```typescript
<UnifiedDistributionViz
  distributions={[
    { id: 'control', label: 'Control', posterior: controlPosterior },
    { id: 'variantA', label: 'Variant A', posterior: variantAPosterior },
    { id: 'variantB', label: 'Variant B', posterior: variantBPosterior }
  ]}
  display={{
    mode: 'density', // or 'ridge' for many variants
    showMean: true,
    showCI: true
  }}
/>
```

## Key Differences

### 1. Unified Data Structure
All distributions use the same `Distribution` interface:
```typescript
{
  id: string;
  label: string;
  posterior?: Posterior | PosteriorProxy;
  samples?: number[];
  color?: string;
  metadata?: { ... };
}
```

### 2. Flexible Display Modes
- `'density'` - KDE curves (default)
- `'histogram'` - Bar charts
- `'ridge'` - Stacked densities (replaces violin plots)
- `'ecdf'` - Cumulative distribution functions

### 3. Built-in Comparisons
Comparison modes handle common analyses:
- `'overlay'` - Superimposed distributions
- `'difference'` - Treatment - Control
- `'ratio'` - Treatment / Control
- `'log-ratio'` - log(Treatment) - log(Control)
- `'percentage-change'` - (Treatment - Control) / Control

### 4. Better Uncertainty Defaults
- Default CI levels: `[0.8, 0.5]` not `[0.95]`
- Shows multiple levels of uncertainty
- No "significance" highlighting
- Continuous probability gradients

### 5. Consistent Formatting
All formatting functions are props:
```typescript
formatValue={v => v.toFixed(2)}
formatPercent={v => `${(v * 100).toFixed(1)}%`}
formatDifference={v => `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
```

## Advanced Features

### Adaptive Sampling
```typescript
<UnifiedDistributionViz
  distributions={distributions}
  adaptiveSampling={true} // Adjusts samples based on complexity
  cacheSamples={true}     // Caches for performance
/>
```

### Future Interactivity
```typescript
<UnifiedDistributionViz
  distributions={distributions}
  onHover={(dist, value) => console.log(dist.label, value)}
  onClick={(dist) => selectDistribution(dist.id)}
  onBrush={(selection) => zoomToRange(selection)}
/>
```

## Performance Considerations

1. **Sample Caching**: Enabled by default to avoid regenerating samples
2. **Progressive Loading**: Shows progress for large sample generation
3. **Batched Sampling**: Sync posteriors sample in batches to avoid blocking

## Troubleshooting

### "No data to display"
- Ensure either `posterior` or `samples` is provided for each distribution
- Check that posteriors implement the correct interface

### Comparison not showing
- Comparison requires 2+ distributions
- Set `comparison.mode` explicitly
- Ensure baseline distribution exists

### Performance issues
- Reduce `nSamples` for faster initial render
- Enable `adaptiveSampling` for automatic optimization
- Use `cacheSamples={true}` (default) for re-renders

## Bayesian Best Practices

### Show Continuous Probabilities
```typescript
// Instead of "significant at 95%"
comparison={{
  mode: 'difference',
  showProbabilityOfImprovement: true,  // Shows exact probability
  probabilityGradient: true             // Visual gradient of certainty
}}
```

### Multiple Uncertainty Levels
```typescript
// Show layers of uncertainty, not just one arbitrary level
display={{
  ciLevels: [0.8, 0.5, 0.2]  // 80%, 50%, 20% intervals
}}
```

### Practical Thresholds
```typescript
// Show probability of exceeding business-relevant thresholds
comparison={{
  showProbabilityOfPracticalImprovement: true,
  practicalThreshold: 0.05  // "5% improvement matters"
}}
``` 