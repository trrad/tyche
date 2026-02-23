# Tyche Experiment Analyzer

A browser-based tool for rigorous Bayesian A/B test analysis. Upload your experiment data and get full posterior distributions with interactive visualizations.

## Features

- **CSV Upload** - Simple drag-and-drop or file selection
- **Example Datasets** - Pre-loaded scenarios to explore
- **Interactive Visualizations** - D3-powered ridge plots with draggable controls
- **Baseline Selection** - Compare any variant to any other
- **View Modes**:
  - Lift % (default) - Treatment effects relative to baseline
  - Absolute $ - Raw revenue per user distributions
- **Credible Intervals** - Adjustable symmetric CIs (50%, 80%, 90%, 95%)
- **Control Uncertainty** - Toggle to show baseline estimation uncertainty in lift view
- **Plain English Stats** - Probability statements, not p-values

## Quick Start

### Run Locally

```bash
# From the tyche root directory
npm run dev

# Navigate to http://localhost:3000/examples/experiment-analyzer/
```

### CSV Format

Your data should have these columns:

- `variant` - Variant name (e.g., "control", "treatment_a")
- `converted` - 0 or 1
- `revenue` - Dollar amount (can be 0 for non-converters)

**Requirements:**

- At least 2 variants
- At least 30 users per variant
- Valid conversion (0/1) and revenue (non-negative) values

**Example:**

```csv
variant,converted,revenue
control,1,45.23
control,0,0.00
treatment,1,52.10
treatment,0,0.00
```

## Example Datasets

Four pre-generated examples are included:

1. **Small Lift (5%)** - Subtle revenue improvement requiring careful analysis
2. **Medium Lift (15%)** - Clear revenue improvement, easy to detect
3. **Multi-Variant Test** - 4 variants with varying effects (0%, 5%, 15%, 20%)
4. **Low Conversion** - 2% conversion rate with larger sample size

Generate fresh examples:

```bash
cd examples/experiment-analyzer
node generate-examples.js
```

## Architecture

### Pages

- **[index.html](index.html)** - Landing page with CSV upload and example selection
- **[results.html](results.html)** - Main results view with ridge plot and controls
- **deep-dive.html** - (Coming soon) Detailed single-variant view

### Data Flow

```
CSV Upload → Validation → StandardData → RevenueAnalyzer →
ExperimentResult → compareVariants() → RidgeDotplot → Interactive Viz
```

### Key Components Used

- **StandardDataFactory** - Converts CSV to Tyche's data format
- **RevenueAnalyzer** - Bayesian compound model (Beta × LogNormal)
- **RidgeDotplot** - D3 visualization component with quantile dots
- **DraggableCIBounds** - Interactive credible interval handles
- **ThresholdLine** - Draggable decision threshold

## Design Principles

Following the [demo-app-design-spec](../../docs/demo-app-design-spec.md):

1. **Lift is Primary** - Default to treatment effects (lift %), toggle to absolute
2. **Always Show Uncertainty** - Full posterior distributions, never naked point estimates
3. **Direct Manipulation** - Drag CI bounds and thresholds on the plot
4. **Plain English** - Probability statements, technical terms only in tooltips
5. **Progressive Disclosure** - Simple overview, reveal complexity on demand

## Browser Compatibility

- Modern browsers (Chrome, Firefox, Safari, Edge)
- JavaScript ES6+ modules required
- D3 v7 via CDN

## Privacy

All analysis runs in your browser. Your data never leaves your machine.

## Future Enhancements

- Deep-dive page with detailed variant view
- Export results (CSV, JSON, PNG)
- Segment analysis
- Model diagnostics panel (for power users)
- Pairwise variant comparisons
- Custom threshold input
- Historical comparison tracking
