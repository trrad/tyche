# Tyche: Core Philosophy & Vision

## Mission
Make principled, honest Bayesian inference and discovery of causal effects in observational and experimental settings accessible to anyone who is capable of using Excel. Democratize a deep understanding of distributions, belief and decision theory in a way where a marketing manager can design a program of experimentation to discover the patterns that are driving real value within the populations they're studying -- where previously it was just a simple statistic with incorrect error bars.

## What Tyche Is

Tyche provides complete distributional understanding of experimental effects through rigorous & opinionated Bayesian analysis. We discover stable, actionable customer segments that persist for months - not chasing micro-optimizations that will be gone by the time you can effectively target them.

We maintain full posterior distributions throughout every analysis, propagating uncertainty correctly and honestly communicating what we know and what we don't. When we can't detect an effect, we quantify the upper bounds - knowing what we can rule out is valuable.

### Core Capabilities

**1. Full Bayesian Inference**
- Conjugate updates when exact (<1ms)
- EM algorithms for mixture discovery (posterior weights coming soon!)
- Complete posterior distributions, always
- Proper uncertainty propagation throughout

**2. Compound Models for Business Metrics**
- Elegantly separate "who converts" from "how much they spend"
- Our general approach for handling zero-inflated data
- Clean composition: Beta × LogNormal[k] for revenue metrics
- Value distributions support k components (e.g., budget vs premium customers)

**3. Heterogeneous Treatment Effect Discovery**
- **Constrained causal trees** - not random forests chasing noise
- Small max. depth for interpretability ("mobile weekend users" not "segment #47")
- Minimum segment sizes ensure marketing can actually target them
- Stability validation ensures patterns persist for months
- **Unified segment analysis** - whether from trees, mixtures, or manual definition

**4. Progressive Analysis Journey**
```
Simple A/B Test → Compound Models → Segment Analysis → HTE Discovery
    (1 click)      (conversion×revenue)  (any source)    (causal trees)
```

Segments can come from:
- Manual definition (hypothesis-driven) - typical starting point
- Causal tree discovery (pattern-driven) - where effects differ

All analyzed through the same unified pipeline.

**5. Browser-Native Architecture**
- Zero installation, instant sharing
- Complete privacy - data never leaves your machine
- WebWorker parallelization for interactive performance
- Results are just URLs

### Who Uses Tyche

From analysts running their first A/B test to researchers developing new methods:
- **Practitioners** who need deeper insights than "significant/not significant"
- **Teams** who value reproducible, shareable analysis
- **Companies** running 10-100 experiments/year seeking competitive advantage
- **Anyone** who wants rigorous statistics without the complexity

The interface starts simple and reveals complexity as needed, providing the same statistical rigor whether you're testing a button color or discovering complex interaction effects.

## Our Approach

### Opinionated Defaults, Not Infinite Options
- Revenue experiments? Start with compound-lognormal model, let data guide refinements
- All distributions support mixtures - k=1 for simple, k>1 when extremely multimodal
- Prior elicitation through visual tools, not parameter guessing
- Model selection automated through capabilities, not user choice

### Stable Insights Over Temporal Noise
We find patterns that marketing can act on next quarter:
- "Mobile weekend shoppers respond 15% better"
- NOT: "Users who clicked ad #47 on Tuesday between 2-3pm"

### Constraints Enable Clarity
Our causal trees are intentionally limited:
- Max depth 3 (interpretable)
- Min segment 10% of population (targetable)
- Min effect 2% (meaningful)
- Bootstrap validation required (stable)

## Core Principles

1. **Distributions of belief are fundamental** - Full posteriors, proper uncertainty propagation, honest communication of what we don't know

2. **Probabilistic language over jargon** - "95% probability of improvement" not "p < 0.05"

3. **Progressive disclosure** - Simple cases in one click, complexity available when needed

4. **Transparency over magic** - Every method documented, every computation inspectable

5. **Negative results matter** - Upper bounds and ruling out effects are insights

6. **Capability-based design** - Models declare what they can handle, routing is automatic

7. **Interactive exploration builds intuition** - Direct manipulation of distributions helps users think probabilistically

8. **Clean foundations over compatibility** - When architecture is fundamentally wrong, replace incrementally rather than adapt

9. **Composition over proliferation** - Build complex models from simple parts, not endless type variations

## Technical Approach

### Statistical Methods
- **Inference**: Conjugate (exact) → EM (mixtures) → VI (future, when necessary)
- **Model Selection**: Capability-based (90%) → WAIC/BIC (10% when valuable)
- **HTE Discovery**: Hypothesis-driven causal trees with honest splitting
- **Validation**: Bootstrap stability, held-out validation sets
- **Comparisons**: Full posterior comparisons, not point estimates

### Simplified Architecture
Core insights that drive our design:

**Two Data Types (That's All!)**
- **Binomial**: Aggregate data (just successes and trials)
- **User-level**: Everything else (including what others call "continuous")

**Unified Distribution Philosophy**
All distributions are potentially mixtures:
- k=1: Use exact/conjugate methods when available
- k>1: Use EM (current) or VI/MCMC algorithms for efficient mixture fitting
- No separate "mixture" types - just a components parameter

**Model Structure vs Type**
- **Structure**: `simple` (direct) or `compound` (zero-inflated, freq x severity)
- **Type**: `beta`, `lognormal`, `normal`, `gamma`
- Compound models compose any value distribution with Beta for conversion

*Technical interfaces for these concepts are defined in InterfaceStandards.md*

This eliminates redundancy and makes the mental model clearer.

### Performance Strategy  
- Capability checking: Instant routing for 90% of cases
- Conjugate updates: Near-instant (<1ms)
- EM algorithms: Interactive speeds (<100ms for k≤4)
- Causal trees: Background processing (10-60s)
- Everything else: background workers

### Browser-Native Benefits
- **Privacy**: Your data stays yours - no transmission, no analytics on user data
- **Speed**: No network latency
- **Sharing**: Send results via URL
- **Cost**: No cloud bills

## What Makes Tyche Different

### vs. Cloud A/B Testing Platforms
They give you averages. We find the segments where effects differ, with full uncertainty quantification and stable patterns that persist.

### vs. Statistical Software (R/Python)
They require programming and statistical knowledge. We provide the same rigor through an intuitive interface that prevents common mistakes.

### vs. Black-Box ML
They find fleeting patterns requiring constant retraining. We discover interpretable segments that remain true months later.

## Success Metrics

### For Users
- Time to first insight: <5 minutes
- Segment stability: 80%+ patterns persist after 3 months  
- Actionability: Every segment has a clear targeting strategy

### For the Field
- Making Bayesian analysis accessible beyond statisticians
- Demonstrating that constraints improve insights
- Proving browser-native statistics is viable

## The Path Forward

**Phase 1** ✓: Core inference engine with unified distributions

**Phase 2** →: Business-focused analyzers & power analysis

**Phase 3**: HTE discovery & validation framework

**Phase 4**: Natural language insights & embeddable visualizations

Each phase delivers standalone value while building toward the complete vision of making sophisticated causal inference accessible to anyone who needs to understand their experiments better.

## Summary

Tyche transforms experiment analysis from binary "significant/not significant" decisions to rich probabilistic understanding. We find stable, actionable segments with proper uncertainty quantification, all in your browser with zero setup.

Our constraints are features - they ensure insights are interpretable, targetable, and persistent. By making simple cases simple and complex cases possible, we democratize advanced statistical methods for everyone who runs experiments.