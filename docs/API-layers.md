# Tyche API Architecture: Three Layers

## Overview

Tyche provides three API layers following the principle of progressive disclosure from CoreVision.md. Each layer serves different user needs while maintaining clean separation of concerns.

## Design Philosophy

**"Make principled Bayesian inference accessible to anyone who can use Excel"**

The three-layer approach enables:
- **Layer 1**: Excel-level simplicity for 90% of users
- **Layer 2**: Statistical control for power users
- **Layer 3**: Full customization for visualization

## Layer 1: Simple Opinionated API

**For**: 90% of users who want immediate insights with no configuration

### Entry Point
```typescript
const insights = await tyche.analyze(control, treatment);
```

### What You Get
- **Natural language summary** with business recommendations
- **All formatting handled internally** (80% CI default, percentages, business language)
- **Automatic decomposition** for compound models
- **Opinionated defaults** (5% practical significance threshold)

### Example Output
```typescript
console.log(insights.summary);
// "Treatment increases revenue by 18% [80% CI: 5%, 32%]
//  Effect driven by conversion rate (+22%).
//  Value per customer unchanged (+3% [-2%, 8%]).
//  Recommendation: Focus on conversion optimization, not pricing."

console.log(insights.confidence);
// "high" | "medium" | "low"

console.log(insights.recommendation);
// "Focus on conversion optimization"
```

### Built-in Features
- Automatic model selection (compound vs simple)
- Uncertainty propagation throughout
- Effect decomposition when applicable
- Business-friendly language
- Action-oriented recommendations

## Layer 2: Statistical Operations API

**For**: Power users who need access to posteriors and custom analysis

### Entry Point
```typescript
const result = await tyche
  .experiment()
  .forMetric('revenue')
  .withControl(control)
  .withTreatment('A', treatment)
  .analyze();
```

### What You Get
- **Full posterior samples** for custom analysis
- **Comparison distributions** with lift posteriors
- **Decomposition with uncertainty** (contribution as distributions)
- **Still opinionated** but configurable

### Example Usage
```typescript
const comparison = await result.compareVariants();
const liftPosterior = comparison.get('A').liftSamples;

// Custom analysis with full posteriors
const probMeaningful = liftPosterior.filter(l => l > 0.05).length / liftPosterior.length;

// Access decomposition with uncertainty
const decomp = comparison.get('A').decomposition;
if (decomp) {
  const freqContribution = decomp.combined.frequencyContribution;
  const medianContrib = quantile(freqContribution, 0.5);
  const contribCI = [quantile(freqContribution, 0.1), quantile(freqContribution, 0.9)];
}
```

### Key Features
- Merges Fluent API design (#92)
- Maintains posterior traces throughout
- Runtime capability detection
- Progressive configuration options

## Layer 3: Visualization API

**For**: Custom visualization and embedding needs (completely separate concern)

### Entry Point
```typescript
import { ExperimentViz } from 'tyche/viz';

// From Layer 1 results
new ExperimentViz(insights).render('#chart');

// From Layer 2 results
new ExperimentViz()
  .withPosteriors(result)
  .withComparison(comparison)
  .configure({
    ciLevels: [0.8, 0.5],
    decomposition: true,
    interactive: true
  })
  .render('#chart');
```

### What You Get
- **Interactive exploration** of posterior distributions
- **Multiple visualization types** (density, histogram, ridge plots)
- **Export capabilities** (PNG, SVG, PDF)
- **Embeddable components** for sharing

### Future Features
- Standalone bundles (no Tyche dependency)
- React components and vanilla JS
- Custom themes and styling

## Design Principles

### 1. No Leaky Abstractions
Each layer is complete - you don't need to drop down to lower layers unless you want more control.

### 2. Progressive Enhancement
```typescript
// Start simple
const insights = await tyche.analyze(control, treatment);

// Need posteriors? Access them
const posteriors = insights.getPosteriors();

// Need custom viz? Separate API
import { CustomViz } from 'tyche/viz';
new CustomViz(posteriors).render();
```

### 3. Separation of Concerns
- **Layer 1 & 2**: Statistical operations and business logic
- **Layer 3**: Rendering and interaction
- **No mixing**: Visualization doesn't leak into statistical APIs

### 4. Opinionated Defaults Throughout
```typescript
// Internal constants (not exposed)
const DEFAULTS = {
  credibleLevel: 0.8,        // 80% CI (more actionable than 95%)
  minPracticalEffect: 0.05,  // 5% minimum meaningful change
  nSamples: 10000,           // Sufficient for stability
  language: 'business',      // "increased by" not "Δ = "
  precision: 1               // One decimal place
};
```

## Implementation Status

### Phase 2A: Statistical Foundation
- [ ] Enhance #108 (Result Objects) with full posteriors
- [ ] Enhance #82 (Business Decomposition) with uncertainty
- [ ] Complete #81 (Analyzer Framework)

### Phase 2B: API Layers
- [ ] Layer 1: Simple Opinionated API (incorporates #93 Natural Language)
- [ ] Layer 2: Statistical Operations API (merges #92 Fluent API)
- [ ] Layer 3: Visualization API Foundation

### Phase 2C: Supporting Features
- [ ] #83: Prior Elicitation (simplified)
- [ ] #84: Industry Presets

## Migration from Current API

The current `UnifiedDistributionViz` and analyzer patterns will be refactored to support this three-layer architecture while maintaining backward compatibility during the transition.

## References

- CoreVision.md: Progressive disclosure principle
- InterfaceStandards.md: Statistical interfaces
- TechnicalArchitecture.md: Overall system design