# Phase 2 Revised: Core Business Layer & Three-Layer API

## Overview

Phase 2 has been restructured to prioritize the three-layer API architecture that makes Tyche accessible per CoreVision.md's "Excel-level" goal while maintaining full statistical rigor.

## Why This Revision?

The original Phase 2 focused on business logic orchestration. This revision recognizes that **API design is foundational** - without the right user interface, the statistical capabilities remain inaccessible.

Key insight: **Natural language generation isn't a "nice-to-have" polish feature - it's core to making Bayesian inference accessible.**

## Revised Structure

### Phase 2A: Statistical Foundation (Enhanced)
**Goal**: Complete statistical operations with full posterior support

**Issues**:
- **#108 Result Objects** (enhanced scope):
  - Original: Basic result structure
  - **New**: Full posterior comparisons, lift distributions
  - Work with sample traces throughout, not point estimates

- **#82 Business Decomposition** (enhanced scope):
  - Original: Basic effect decomposition
  - **New**: Decomposition with uncertainty propagation
  - Contribution percentages as distributions

- **#81 Analyzer Framework** (unchanged):
  - Orchestrates engines, provides business interface

**Key Technical Changes**:
- All comparison methods return posterior samples
- Sample-wise decomposition preserving correlations
- No premature aggregation to point estimates

### Phase 2B: Three-Layer API Architecture (NEW)
**Goal**: Implement progressive disclosure from simple to advanced usage

**New Issues**:

1. **Simple Opinionated API (Layer 1)** - **P0, Size: L**
   - Incorporates #93 (Natural Language Insights) from Phase 4
   - One-line analysis: `tyche.analyze(control, treatment)`
   - Returns formatted insights with recommendations
   - All text generation built-in
   - 80% CI default, business language

2. **Statistical Operations API (Layer 2)** - **P0, Size: M**
   - Merges #92 (Fluent API) from Phase 4
   - Access to full posteriors and custom analysis
   - Still opinionated but configurable
   - For power users who need statistical details

3. **Visualization API Foundation (Layer 3)** - **P1, Size: M**
   - Completely separate concern from statistical operations
   - Foundation for #95 (Embeddable Visualizations) in Phase 4
   - Clean adapter from statistical results to viz data

**Why This Is Critical**:
- Without Layer 1, Tyche remains a power-user tool
- Layer 1 enables the "Excel user" accessibility goal
- Clean separation prevents feature creep

### Phase 2C: Quick Wins (Simplified)
- **#83 Prior Elicitation** (simplified scope)
- **#84 Industry Presets** (unchanged)

### Moved to Phase 4 (Performance & Polish)
- **#85 Worker Pool** (was Phase 2): Performance optimization, not blocking
- **#91 Power Analysis** (was Phase 3): Needs workers, can wait
- **#86 Dependence Research** (was Phase 2): Future research

## Dependency Structure

### Critical Path (Must Complete in Order)
1. **#108 Result Objects** → Blocks everything else
2. **#81 Analyzer Framework** → Blocks API layers
3. **Layer 1 API** → Critical for MVP usability

### Parallel Work Possible
- **#82 Decomposition** (after #108)
- **Layer 3 Visualization Foundation** (can start early)
- **#83, #84** (anytime)

### HTE Work (Phase 3)
- Can start **Layer 2 API** and **Segment Interface** in parallel
- No longer depends on Worker Pool (simplified first)

## Success Metrics Revised

### Phase 2A Success
- [ ] `compareVariants()` returns full posteriors, not summaries
- [ ] Decomposition works sample-wise with uncertainty propagation
- [ ] No point estimates before user explicitly requests them

### Phase 2B Success
- [ ] One-line API produces publication-ready insights
- [ ] Natural language includes uncertainty qualifiers
- [ ] Power users can access raw posteriors seamlessly
- [ ] Visualization completely separated from statistics

### Overall Phase 2 Success
- [ ] Excel user can analyze A/B test in one line
- [ ] Statistician can access full Bayesian machinery
- [ ] Clear upgrade path from simple to advanced
- [ ] No statistical functionality sacrificed for simplicity

## Technical Implementation Notes

### Layer 1 API Implementation
```typescript
// Internal flow
async function analyze(control: UserData[], treatment: UserData[]) {
  // Use existing analyzer framework
  const result = await experiment()
    .forMetric('revenue')  // Auto-detect
    .withControl(control)
    .withTreatment('treatment', treatment)
    .analyze();

  // Generate insights using new formatter
  const comparison = await result.compareVariants();
  const insights = InsightFormatter.generateSummary(comparison);

  return {
    summary: insights.summary,
    recommendation: insights.recommendation,
    confidence: insights.confidence,
    // Provide access to Layer 2 if needed
    getPosteriors: () => comparison
  };
}
```

### Uncertainty-Aware Decomposition
```typescript
// Sample-wise decomposition preserving correlations
function decomposeEffects(
  controlFreq: number[],    // Posterior samples
  treatmentFreq: number[],
  controlValue: number[],
  treatmentValue: number[]
): EffectDecomposition {
  const nSamples = controlFreq.length;
  const freqContribution = [];

  for (let i = 0; i < nSamples; i++) {
    const freqEffect = (treatmentFreq[i] - controlFreq[i]) * controlValue[i];
    const valueEffect = controlFreq[i] * (treatmentValue[i] - controlValue[i]);
    const total = freqEffect + valueEffect;

    // Contribution % gets uncertainty too!
    if (Math.abs(total) > 1e-10) {
      freqContribution.push(Math.abs(freqEffect) / Math.abs(total));
    }
  }

  return { frequencyContribution: freqContribution, ... };
}
```

## Impact on Other Phases

### Phase 3 (HTE & Segmentation)
- **Simplified**: No longer depends on Worker Pool
- **Enhanced**: Will use Layer 1 API for simple segment analysis
- **Timeline**: Can start sooner with simpler approach

### Phase 4 (Polish & Performance)
- **Expanded**: Now includes Worker Pool, Power Analysis
- **Focused**: Pure performance and polish, not core functionality
- **Reduced pressure**: Core usability achieved in Phase 2

## Migration Strategy

1. **Backward Compatibility**: Existing APIs continue to work
2. **Gradual Migration**: New Layer 1 API alongside existing
3. **Documentation**: Clear upgrade paths for each layer
4. **Examples**: Show progression from simple to advanced

## Risks Mitigated

### Risk: Complexity Creep
**Solution**: Strict separation of layers, no feature mixing

### Risk: Performance Issues
**Solution**: Defer worker optimization to Phase 4, keep simple first

### Risk: Poor User Experience
**Solution**: Layer 1 API prioritizes user experience over internal simplicity

### Risk: Technical Debt
**Solution**: Clean architecture with clear interfaces between layers

## References

- **Issue #148**: This tracking issue
- **CoreVision.md**: Progressive disclosure principle
- **API-layers.md**: Detailed API specification
- **Original phase-2-context.md**: Foundation work that remains valid