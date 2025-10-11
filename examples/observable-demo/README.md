# Tyche Observable Framework Demo

Interactive demonstration of **distributional thought primitives** for Bayesian A/B testing.

## What This Demonstrates

1. **Outcome-space thinking**: "92% probability revenue exceeds $50" vs "α=5.2"
2. **Continuous probability**: Thresholds are sliders, not binary tests
3. **Adjustable uncertainty**: CI level is a choice (50% → 99%), not fixed at 95%
4. **Multi-variant native**: Supports 1 control + N treatments
5. **Decomposition with uncertainty**: Attribution shows full distributions

## Prerequisites

1. **Build Tyche library** (from repo root):

   ```bash
   cd ../..  # Go to tyche root
   npm install
   npm run build
   ```

2. **Install Observable Framework**:
   ```bash
   cd examples/observable-demo
   npm install
   ```

## Running the Demo

```bash
npm run dev
```

Then open http://localhost:3001 in your browser.

**Note**: Observable demo runs on port 3001 to avoid conflicts with Vite's dev server (port 3000) used by inference-explorer.

## Demo Structure

### Condition View (`/condition-view`)

Deep dive into a single variant with:

- **Interactive revenue thresholds**: "What's the probability revenue > $X?"
- **Adjustable credible intervals**: Drag from 50% → 99%, watch uncertainty change
- **PPC diagnostics**: Observed vs predicted with reactive CI bands
- **Decomposition**: Conversion rate × Revenue-per-converter with thresholds

### Experiment View (`/experiment-view`)

Multi-variant comparison with:

- **Lift distribution per variant**: All treatments vs control
- **Continuous lift thresholds**: "Probability of >X% improvement"
- **Effect decomposition with uncertainty**: Attribution as distributions
- **Probabilistic recommendations**: Based on adjustable evidence thresholds

## Key Interactions

### Continuous Thresholds

Drag any threshold slider → watch probabilities update in real-time. This teaches that significance is continuous, not binary.

### Adjustable Credible Intervals

Drag the CI level slider:

- At 50%: Narrow intervals (less confident)
- At 99%: Wide intervals (more confident)

Shows that uncertainty quantification is a **choice**, not a fixed 95%.

### Outcome Space

Every statement is about **observable outcomes**:

- ✓ "92% probability revenue per customer exceeds $50"
- ✗ "Posterior mean of α parameter is 5.2"

## Data

**Scenario**: E-commerce marketplace testing 3 recommendation algorithms

**Structure**:

- Compound model: `conversion_rate × revenue_per_converter`
- Mixture: k=2 (budget sellers ~$25, premium sellers ~$95)
- 4 variants: Control + 3 treatments

Generated using Tyche's `DataGenerator` with configurable:

- Conversion rates (8% → 10%)
- Seller mix (35% budget → 25% budget)
- Premium seller values ($95 → $104)

## Technical Details

**Uses existing Tyche APIs**:

- `RevenueAnalyzer` for compound model analysis
- `ComparisonResult` for multi-variant comparisons
- `StandardDataFactory` for data loading

**No library changes needed** - demonstrates the existing API's capability for distributional thinking when exposed through Observable's reactive model.

## Philosophy

Traditional A/B testing asks: "Is this significant?"

Distributional thinking asks: "What can we say about outcomes at different decision thresholds?"

By making thresholds **continuous** and uncertainty **adjustable**, we enable exploration rather than binary judgment.

## Built With

- **Tyche**: Browser-based Bayesian inference (existing analyzers)
- **Observable Framework**: Reactive notebooks for data apps
- **Observable Plot**: Declarative visualization

## Next Steps

To integrate CSV upload and column selection (mentioned in planning):

1. Add file upload input in Observable
2. Parse CSV with d3.csvParse
3. Map columns to StandardData format
4. Pass to analyzers

This demo focuses on the **core distributional primitives**, leaving data ingestion for later.
