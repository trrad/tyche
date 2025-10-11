# Tyche: Distributional Thought Primitives

An interactive demonstration of **distributional thinking** in Bayesian A/B testing.

## Core Principles

This demo showcases three key ideas:

1. **Outcome space, not parameter space** - "There's a 92% probability revenue per customer exceeds $50" vs "α=5.2"
2. **Continuous probability** - Thresholds are sliders, not binary significance tests
3. **Uncertainty as choice** - Credible interval level is adjustable, showing uncertainty is a decision

## Demo Scenario

**E-commerce Marketplace** testing 3 new recommendation algorithms against a control.

**Data structure**:

- **Compound model**: Conversion rate × Revenue per converter
- **Mixture**: Budget sellers (~$25) + Premium sellers (~$95)
- **4 variants**: Control + 3 Treatments

## Explore the Demo

<div class="grid grid-cols-2">
  <div class="card">
    <h3>Condition Analysis</h3>
    <p>Deep dive into a single variant with interactive threshold exploration and PPC diagnostics.</p>
    <a href="./condition-view">View Condition Analysis →</a>
  </div>

  <div class="card">
    <h3>Experiment Comparison</h3>
    <p>Compare all variants with continuous lift thresholds and decomposition uncertainty.</p>
    <a href="./experiment-view">View Experiment Comparison →</a>
  </div>
</div>

## What Makes This Different?

Traditional A/B testing:

- ✗ Binary "significant/not significant"
- ✗ Fixed 95% confidence intervals
- ✗ Point estimates for attribution

**Distributional approach:**

- ✓ Continuous probability of exceeding any threshold
- ✓ Adjustable credible intervals (50% → 99%)
- ✓ Attribution with full uncertainty quantification

## Built With

- **Tyche** - Browser-based Bayesian inference engine
- **Observable Framework** - Reactive notebooks for data apps
- **Observable Plot** - Declarative visualization grammar

---

<div style="text-align: center; color: #6b7280; font-size: 0.875rem; margin-top: 2rem;">
  Powered by <a href="https://github.com/tradcliffe/tyche">Tyche</a> - An opinionated Bayesian inference library
</div>
