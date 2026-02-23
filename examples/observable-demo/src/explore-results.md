# Multi-Variant Experiment Comparison

```js
import * as d3 from 'npm:d3';
import {
  createRidgePlot,
  prepareRidgePlotData,
  prepareAbsoluteData,
} from './components/wrappers.js';
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
// Run Tyche inference
const analysisResult = await (async () => {
  try {
    const analyzer = new Tyche.RevenueAnalyzer();
    return await analyzer.analyze(experimentData);
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

```js
// Get variant names for selectors
const variantNames = analysisResult.getVariantNames();
```

```js
// Build experiment object for summary cards
const experiment = await (async () => {
  const exp = {
    variants: {},
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

  return exp;
})();
```

Comparing **${variantNames.length} variants** in marketplace recommendation test.

## Analysis Configuration

```js
// Baseline selector
viewof baseline = Inputs.select(variantNames, {
  label: 'Baseline:',
  value: variantNames.find(v => v.includes('control')) || variantNames[0],
});
```

```js
// View mode toggle
viewof viewMode = Inputs.radio(['lift', 'absolute'], {
  label: 'View:',
  value: 'lift',
});
```

```js
// Credible interval level
viewof ciLevel = Inputs.range([0.5, 0.99], {
  label: 'Credible Interval Width:',
  step: 0.01,
  value: 0.80,
  format: (v) => `${(v * 100).toFixed(0)}%`,
});
```

```js
// Decision threshold
const liftThreshold = view(
  Inputs.range([0, 0.5], {
    label: 'Decision Threshold (minimum meaningful lift):',
    step: 0.01,
    value: 0.1,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  })
);
```

```js
// Compute CI bounds from level
ciLower = (1 - ciLevel) / 2;
ciUpper = 1 - (1 - ciLevel) / 2;
```

## Variants

```js
html`<div class="grid grid-cols-4" style="gap: 1rem; margin-bottom: 2rem;">
  ${variantNames.map((name) => {
    const variant = experiment.variants[name];
    return html`
      <div class="card" style="padding: 1rem; background: #f9fafb; border-radius: 0.5rem;">
        <h4 style="margin-top: 0;">${variant.displayName}</h4>
        <p style="font-size: 0.875rem; color: #6b7280; margin: 0;">
          ${variant.totalUsers} users • ${(variant.conversionRate * 100).toFixed(1)}% conversion
        </p>
      </div>
    `;
  })}
</div>`;
```

## Interactive Lift Analysis

```js
// Run variant comparison
const variantComparison = await analysisResult.compareVariants({ baseline });
```

```js
// Get list of non-baseline variants for display
const selectedVariants = variantNames.filter((v) => v !== baseline);
```

```js
// Prepare visualization data based on view mode
vizData =
  viewMode === 'lift'
    ? prepareRidgePlotData(analysisResult, variantComparison, baseline, liftThreshold)
    : prepareAbsoluteData(analysisResult, selectedVariants, baseline, liftThreshold);
```

### Lift Distributions

Each ridge shows posterior distribution. **Drag the CI bounds or threshold line** to explore.

```js
chart = {
  const container = html`<div class="ridge-container"></div>`;

  createRidgePlot(
    container,
    vizData,
    {
      ciLower: ciLower,
      ciUpper: ciUpper,
      numDots: 20,
      showViolin: true,
      width: null, // Use container width
      showCIBounds: true,
      showStatistics: true,
      showThresholdLine: liftThreshold > 0,
    },
    {
      // For now, no mutable cells - will add interactivity in next iteration
    }
  );

  return container;
}
```

### Probabilistic Statements

These probabilities update **continuously** as you adjust controls:

```js
display(
  html`<div class="grid grid-cols-3" style="gap: 1.5rem; margin-top: 2rem;">
    ${selectedVariants.map((variantName) => {
      const comparison = variantComparison.comparisons.get(variantName);
      const variant = experiment.variants[variantName];

      if (!comparison) return '';

      const liftSamples = Array.from(comparison.liftSamples);
      const probMeaningful = probabilityAbove(liftSamples, liftThreshold);
      const ci = [d3.quantile(liftSamples, ciLower), d3.quantile(liftSamples, ciUpper)];
      const median = d3.median(liftSamples);

      return html`
        <div
          class="card"
          style="padding: 1.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem;"
        >
          <div style="font-weight: 600; font-size: 1rem; color: #111827; margin-bottom: 0.5rem;">
            ${variant.displayName}
          </div>

          <div style="font-size: 2rem; font-weight: 700; color: #3b82f6; margin: 0.5rem 0;">
            ${formatPercent(comparison.probabilityPositive, 1)}
          </div>
          <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem;">
            probability of ANY revenue increase
          </div>

          <div
            style="font-size: 1.5rem; font-weight: 600; color: ${probMeaningful > 0.75
              ? '#10b981'
              : '#6b7280'}; margin: 0.5rem 0;"
          >
            ${formatPercent(probMeaningful, 1)}
          </div>
          <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 1rem;">
            probability of >${(liftThreshold * 100).toFixed(0)}% revenue increase
          </div>

          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
            <div style="font-size: 0.875rem; color: #4b5563;">
              Median lift: <strong>${formatPercent(median, 1)}</strong>
            </div>
            <div style="font-size: 0.875rem; color: #4b5563;">
              ${(ciLevel * 100).toFixed(0)}% CI:
              <strong>${formatPercent(ci[0], 1)} to ${formatPercent(ci[1], 1)}</strong>
            </div>
          </div>
        </div>
      `;
    })}
  </div>`
);
```

## Recommendation

```js
// Find the variant with highest probability of exceeding threshold
const winnerEntry = Array.from(variantComparison.comparisons.entries()).reduce(
  (best, [key, comp]) => {
    const probMeaningful = probabilityAbove(Array.from(comp.liftSamples), liftThreshold);
    return !best || probMeaningful > best.probMeaningful ? { key, comp, probMeaningful } : best;
  },
  null
);

const recommendation =
  winnerEntry && winnerEntry.probMeaningful > 0.75
    ? `Recommend ${experiment.variants[winnerEntry.key].displayName} (${formatPercent(winnerEntry.probMeaningful)} probability of >${(liftThreshold * 100).toFixed(0)}% lift)`
    : `No clear winner (highest probability: ${winnerEntry ? formatPercent(winnerEntry.probMeaningful) : 'N/A'})`;
```

```js
display(
  html`<div
    class="card"
    style="padding: 1.5rem; margin-top: 2rem; background: ${winnerEntry &&
    winnerEntry.probMeaningful > 0.75
      ? 'rgba(16, 185, 129, 0.1)'
      : 'rgba(245, 158, 11, 0.1)'}; border: 2px solid ${winnerEntry &&
    winnerEntry.probMeaningful > 0.75
      ? '#10b981'
      : '#f59e0b'}; border-radius: 0.5rem;"
  >
    <h3
      style="margin-top: 0; color: ${winnerEntry && winnerEntry.probMeaningful > 0.75
        ? '#10b981'
        : '#f59e0b'};"
    >
      ${winnerEntry && winnerEntry.probMeaningful > 0.75 ? '✓ Recommendation' : '⚠ Caution'}
    </h3>
    <p style="font-size: 1.125rem; margin-bottom: 0;">${recommendation}</p>
  </div>`
);
```

---

**Key insight**: By making thresholds **continuous** and uncertainty **adjustable**, you can explore the evidence at different decision points rather than relying on a single binary test.
