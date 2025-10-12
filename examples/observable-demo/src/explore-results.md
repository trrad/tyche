# Multi-Variant Experiment Comparison

```js
import * as Plot from 'npm:@observablehq/plot';
import {
  credibleInterval,
  probabilityAbove,
  formatPercent,
  formatCurrency,
} from './components/utils.js';
```

```js
// Import Tyche library
import * as Tyche from './dist/tyche.js';
```

```js
// Import data generation utilities
import { generateMarketplace } from './lib/generate-data.js';
```

```js
// Generate synthetic marketplace data
const rawData = generateMarketplace({ seed: 42, usersPerVariant: 1000 });
```

```js
// Build treatments Map (all non-control variants)
const treatments = new Map();
for (const [key, variantData] of Object.entries(rawData)) {
  if (key !== 'control') {
    treatments.set(variantData.name, {
      name: variantData.name,
      data: Tyche.StandardDataFactory.fromUserLevel(variantData.users),
    });
  }
}

// Create properly structured ExperimentData for Tyche
const experimentData = {
  id: 'marketplace-experiment-001',
  name: 'Marketplace Revenue Optimization',
  variants: {
    control: {
      name: rawData.control.name,
      data: Tyche.StandardDataFactory.fromUserLevel(rawData.control.users),
    },
    treatments,
  },
  metadata: {
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-31'),
    hypothesis: 'New checkout flow and personalized recommendations will increase revenue per user',
  },
};
```

```js
// Run Tyche inference and build experiment object
const experiment = await (async () => {
  try {
    // Run Tyche inference in-browser
    const analyzer = new Tyche.RevenueAnalyzer();
    const analysisResult = await analyzer.analyze(experimentData);
    const variantComparison = await analysisResult.compareVariants();

    // Build experiment object for visualizations
    const exp = {
      variants: {},
      comparisons: {},
    };

    // Add variant summary information
    for (const [key, variantData] of Object.entries(rawData)) {
      const users = variantData.users;
      const convertedUsers = users.filter((u) => u.converted);
      const totalRevenue = users.reduce((sum, u) => sum + u.value, 0);

      exp.variants[variantData.name] = {
        displayName: variantData.displayName,
        totalUsers: users.length,
        convertedUsers: convertedUsers.length,
        conversionRate: convertedUsers.length / users.length,
        totalRevenue,
        averageRevenuePerUser: totalRevenue / users.length,
        averageOrderValue:
          convertedUsers.length > 0
            ? convertedUsers.reduce((sum, u) => sum + u.value, 0) / convertedUsers.length
            : 0,
      };
    }

    // Add comparison results (from Tyche inference)
    // Convert typed arrays to regular arrays for Plot.js compatibility
    for (const [key, comparison] of variantComparison.comparisons.entries()) {
      exp.comparisons[key] = {
        liftSamples: Array.from(comparison.liftSamples),
        effectSamples: Array.from(comparison.effectSamples),
        probabilityPositive: comparison.probabilityPositive,
        probabilityMeaningful: comparison.probabilityMeaningful,
        metadata: {
          variants: comparison.metadata.variants,
          threshold: comparison.metadata.threshold,
          sampleSize: comparison.metadata.sampleSize,
        },
      };
    }

    return exp;
  } catch (error) {
    console.error('Error running Tyche inference:', error);
    display(
      html`<div style="color: red; padding: 1rem; border: 2px solid red;">
        <strong>Error:</strong> ${error.message || String(error)}
        <pre>${error.stack || ''}</pre>
      </div>`
    );
    throw error;
  }
})();
```

Comparing **${Object.keys(experiment.variants).length} variants** in marketplace recommendation test.

## Variants

```js
html`<div class="grid grid-cols-4">
  ${Object.entries(experiment.variants).map(
    ([key, variant]) => html`
      <div class="card">
        <h4>${variant.displayName}</h4>
        <p style="font-size: 0.875rem; color: #6b7280;">
          ${variant.totalUsers} users • ${(variant.conversionRate * 100).toFixed(1)}% conversion
        </p>
      </div>
    `
  )}
</div>`;
```

## Interactive Lift Exploration

**Adjust the threshold to explore what counts as "meaningful":**

```js
const liftThreshold = view(
  Inputs.range([0, 0.5], {
    label: 'Meaningful lift threshold (%)',
    step: 0.01,
    value: 0.1,
    format: (d) => `${(d * 100).toFixed(0)}%`,
  })
);
```

```js
// Get treatment variant keys (all except control)
const treatmentKeys = Object.keys(experiment.comparisons);

const selectedVariants = view(
  Inputs.checkbox(treatmentKeys, {
    value: treatmentKeys,
    label: 'Show variants:',
    format: (k) => experiment.variants[k].displayName,
  })
);
```

### Lift Distributions

Each histogram shows revenue lift vs control. **Drag the threshold slider above** to see probabilities update.

```js
// Prepare data for plotting
const liftData = selectedVariants.flatMap((variantName) => {
  const comp = experiment.comparisons[variantName];
  return comp.liftSamples.map((lift) => ({
    variant: experiment.variants[variantName].displayName,
    lift: lift,
    aboveThreshold: lift > liftThreshold,
  }));
});
```

```js
display(
  Plot.plot({
    marginLeft: 50,
    height: 400,
    facet: {
      data: liftData,
      y: 'variant',
      marginRight: 60,
    },
    marks: [
      Plot.rectY(
        liftData,
        Plot.binX(
          { y: 'count' },
          {
            x: 'lift',
            fill: (d) => (d.aboveThreshold ? '#3b82f6' : '#94a3b8'),
            facet: 'exclude',
            thresholds: 50,
          }
        )
      ),
      Plot.ruleX([liftThreshold], { stroke: '#ef4444', strokeWidth: 2 }),
      Plot.ruleX([0], { stroke: '#cbd5e1', strokeDasharray: '4,2', strokeWidth: 1.5 }),
    ],
    x: {
      label: 'Revenue lift (%)',
      percent: true,
      type: 'sqrt',
      nice: true,
      grid: true,
    },
    y: {
      label: null,
    },
  })
);
```

### Probabilistic Statements

These probabilities update **continuously** as you adjust the threshold:

```js
display(
  html`<div class="grid grid-cols-3">
    ${selectedVariants.map((variantName) => {
      const comp = experiment.comparisons[variantName];
      const probMeaningful = probabilityAbove(comp.liftSamples, liftThreshold);
      return html`
        <div class="card">
          <div class="metric-label">${experiment.variants[variantName].displayName}</div>
          <div class="metric">${formatPercent(comp.probabilityPositive, 1)}</div>
          <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
            probability of ANY revenue increase
          </div>
          <div class="metric" style="font-size: 1.5rem; margin-top: 1rem;">
            ${formatPercent(probMeaningful, 1)}
          </div>
          <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
            probability of >${(liftThreshold * 100).toFixed(0)}% revenue increase
          </div>
        </div>
      `;
    })}
  </div>`
);
```

<!--
## Effect Decomposition with Uncertainty

TODO: Add decomposition visualization once we implement proper mapping from Tyche's EffectDecomposition structure.

For compound models, we can decompose the revenue effect into:
- **Conversion rate improvement** (frequency)
- **Revenue-per-converter improvement** (value/severity)
-->

## Recommendation

```js
// Find the variant with highest probability of positive effect
const winnerEntry = Object.entries(experiment.comparisons).reduce(
  (best, [key, comp]) =>
    !best || comp.probabilityPositive > best.comp.probabilityPositive ? { key, comp } : best,
  null
);

const recommendation =
  winnerEntry && winnerEntry.comp.probabilityPositive > 0.75
    ? `Recommend ${experiment.variants[winnerEntry.key].displayName} (${formatPercent(winnerEntry.comp.probabilityPositive)} probability of positive effect)`
    : `No clear winner (highest probability: ${winnerEntry ? formatPercent(winnerEntry.comp.probabilityPositive) : 'N/A'})`;
```

```js
display(
  html`<div
    class="card"
    style="background: ${winnerEntry && winnerEntry.comp.probabilityPositive > 0.75
      ? 'rgba(16, 185, 129, 0.1)'
      : 'rgba(245, 158, 11, 0.1)'}; border: 2px solid ${winnerEntry &&
    winnerEntry.comp.probabilityPositive > 0.75
      ? '#10b981'
      : '#f59e0b'};"
  >
    <h3
      style="margin-top: 0; color: ${winnerEntry && winnerEntry.comp.probabilityPositive > 0.75
        ? '#10b981'
        : '#f59e0b'};"
    >
      ${winnerEntry && winnerEntry.comp.probabilityPositive > 0.75
        ? '✓ Recommendation'
        : '⚠ Caution'}
    </h3>
    <p style="font-size: 1.125rem; color: #e2e8f0;">${recommendation}</p>
  </div>`
);
```

---

**Key insight**: By making thresholds **continuous** and uncertainty **adjustable**, you can explore the evidence at different decision points rather than relying on a single binary test.
