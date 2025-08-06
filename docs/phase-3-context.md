# docs/phase-3-context.md

# Phase 3: Segmentation & HTE Context

## Phase Goal

Enable discovery and validation of heterogeneous treatment effects. Find which users respond differently and why.

## Critical Distinction

**Segments are NOT mixture components!**

- Segments: User groups (mobile users, new customers)
- Mixture components: Value distribution modes (low/high spenders)

## Key Architectural Decisions

### Unified Segment Interface (3.1)

- **Pattern**: Single Segment interface for all sources
- **Sources**: `manual` or `causal_tree` (not mixtures!)
- **Key field**: `selector` function filters users
- **Effect measurement**: Added after analysis

### HTE Analyzer (3.2)

- **Pattern**: Orchestrates discovery and validation
- **Why**: Segments need validation to be trustworthy
- **Key steps**: Discover → Analyze → Validate → Compare
- **Bootstrap**: Essential for stability scoring

### Manual Segmentation (3.3)

- **Pattern**: Helper builders for common segments
- **Examples**: device type, time of week, value ranges
- **Composability**: AND/OR operations on segments
- **Why**: Hypothesis-driven analysis

### Causal Trees (3.4)

- **Pattern**: Constrained for interpretability
- **Max depth**: 3 (human readable)
- **Min size**: 10% (worth targeting)
- **Min effect**: 2% (meaningful)
- **Why**: Business-actionable, not just significant

### Power Analysis (3.5)

- **Pattern**: Bayesian simulation-based
- **Why**: Priors affect power calculations
- **Implementation**: Importance sampling + workers
- **Key outputs**: Power curves, sample size recommendations

## Common Pitfalls

1. **Don't confuse segments with mixture components**
2. **Don't create tiny segments** - Not actionable
3. **Don't skip validation** - Segments can be unstable
4. **Don't use all features** - Hypothesis-driven only
5. **Don't ignore multiple testing** - More segments = more false positives

## Testing Strategy

- Test segment selectors with edge cases
- Verify bootstrap stability scores
- Test causal tree constraints
- Verify power calculations with known scenarios

## Dependencies

- Depends on Phase 2: Uses worker pool for parallel computation
- Depends on user-level data from Phase 0

## Implementation Notes

### Causal Trees

- Use honest splitting (separate data for split and estimate)
- Bootstrap each tree for stability
- Only hypothesis-relevant features

### Power Analysis

- Distribute simulations across workers
- Cache results for common scenarios
- Importance sampling for efficiency

## Success Metrics

- [ ] Clear segment vs. component distinction
- [ ] Manual segments easy to define
- [ ] Causal trees producing interpretable segments
- [ ] Bootstrap validation working
- [ ] Power analysis with worker parallelization
