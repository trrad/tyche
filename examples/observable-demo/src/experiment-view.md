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
// Load experiment data (all comparisons vs control)
const experiment = await FileAttachment('data/experiment-results.json').json();
```

Comparing **${experiment.variants ? Object.keys(experiment.variants).length : 0} variants** in marketplace recommendation test.

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
});
```

### Probabilistic Statements

These probabilities update **continuously** as you adjust the threshold:

```js
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
</div>`;
```

## Effect Decomposition with Uncertainty

For compound models, we can decompose the revenue effect into:

- **Conversion rate improvement** (frequency)
- **Revenue-per-converter improvement** (value/severity)

**Select a variant to analyze:**

```js
const selectedForDecomp = view(
  Inputs.select(selectedVariants, {
    label: 'Analyze decomposition for:',
    format: (v) => experiment.variants[v].displayName,
  })
);
```

```js
const ciLevel = view(
  Inputs.range([0.5, 0.99], {
    label: 'Credible interval level',
    step: 0.01,
    value: 0.8,
    format: (d) => `${(d * 100).toFixed(0)}%`,
  })
);
```

```js
// Get decomposition for selected variant
const decomp = experiment.comparisons[selectedForDecomp].decomposition;
const freqContrib = decomp.combined.frequencyContribution;
const valueContrib = decomp.combined.valueContribution;

// Compute CIs (reactive to ciLevel!)
const freqCI = credibleInterval(freqContrib, ciLevel);
const valueCI = credibleInterval(valueContrib, ciLevel);

// Medians for point estimates
const freqMedian = freqContrib.slice().sort((a, b) => a - b)[Math.floor(freqContrib.length / 2)];
const valueMedian = valueContrib.slice().sort((a, b) => a - b)[Math.floor(valueContrib.length / 2)];
```

```js
html`<h3>${experiment.variants[selectedForDecomp].displayName} Attribution</h3>

  <div class="grid grid-cols-2">
    <div class="card">
      <h4>Conversion Rate Improvement</h4>
      <div class="metric">${(freqMedian * 100).toFixed(1)}%</div>
      <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
        of total revenue lift
      </div>
      <div style="font-size: 0.875rem; color: #374151; margin-top: 1rem;">
        <strong>${(ciLevel * 100).toFixed(0)}% confident:</strong> ${(freqCI[0] * 100).toFixed(1)}%
        – ${(freqCI[1] * 100).toFixed(1)}%
      </div>
    </div>

    <div class="card">
      <h4>Revenue-per-Converter Improvement</h4>
      <div class="metric">${(valueMedian * 100).toFixed(1)}%</div>
      <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
        of total revenue lift
      </div>
      <div style="font-size: 0.875rem; color: #374151; margin-top: 1rem;">
        <strong>${(ciLevel * 100).toFixed(0)}% confident:</strong> ${(valueCI[0] * 100).toFixed(1)}%
        – ${(valueCI[1] * 100).toFixed(1)}%
      </div>
    </div>
  </div>`;
```

**Drag the CI level slider** to see how uncertainty changes. At 50%, intervals are narrow. At 99%, they're wide.

### Contribution Distribution

This shows the **full distribution** of attribution, not just a point estimate:

```js
Plot.plot({
  height: 300,
  marginLeft: 60,
  marks: [
    Plot.areaY(
      freqContrib.map((v) => ({ value: v })),
      Plot.binX(
        { y: 'count' },
        {
          x: 'value',
          fill: '#3b82f6',
          fillOpacity: 0.3,
          thresholds: 30,
        }
      )
    ),
    Plot.lineY(
      freqContrib.map((v) => ({ value: v })),
      Plot.binX(
        { y: 'count' },
        {
          x: 'value',
          stroke: '#3b82f6',
          strokeWidth: 2,
          thresholds: 30,
        }
      )
    ),
    Plot.ruleX([freqCI[0], freqCI[1]], {
      stroke: '#ef4444',
      strokeDasharray: '4,2',
      strokeWidth: 2,
    }),
    Plot.ruleX([freqMedian], {
      stroke: '#10b981',
      strokeWidth: 3,
    }),
  ],
  x: {
    label: 'Conversion improvement contribution (%)',
    percent: true,
    domain: [0, 100],
    grid: true,
  },
  y: {
    label: 'Count',
    grid: true,
  },
});
```

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
</div>`;
```

---

**Key insight**: By making thresholds **continuous** and uncertainty **adjustable**, you can explore the evidence at different decision points rather than relying on a single binary test.
