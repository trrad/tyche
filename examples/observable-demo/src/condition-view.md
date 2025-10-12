# Condition Analysis: Deep Dive

Analyzing a single variant in **outcome space** with interactive threshold exploration.

```js
import * as Plot from 'npm:@observablehq/plot';
import * as d3 from 'npm:d3';
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
// Import utility functions
import {
  credibleInterval,
  probabilityAbove,
  probabilityBelow,
  formatPercent,
  formatCurrency,
  ksStatistic,
  calibration,
} from './components/utils.js';
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
// Get list of all variant names for the selector
const variantNames = analysisResult.getVariantNames();
```

```js
const selectedVariant = view(
  Inputs.select(variantNames, {
    label: 'Select variant to analyze:',
    format: (v) => rawData[Object.keys(rawData).find((k) => rawData[k].name === v)].displayName,
  })
);
```

```js
// Build condition object from selected variant's VariantResult
const condition = await (async () => {
  const variantResult = analysisResult.getVariantResult(selectedVariant);

  if (!variantResult) {
    throw new Error(`Variant ${selectedVariant} not found in results`);
  }

  // Get the raw data for this variant
  const variantKey = Object.keys(rawData).find((k) => rawData[k].name === selectedVariant);
  const variantRawData = rawData[variantKey];

  // Extract posterior samples (for overall revenue per user)
  const posteriorSamples = variantResult.getPosteriorSamples(10000);

  // Extract observed data (actual revenue values from users)
  const observedData = variantRawData.users.map((u) => u.value);

  // Debug: Check data quality
  const hasZeros = observedData.some((v) => v === 0);
  const zeroCount = observedData.filter((v) => v === 0).length;
  console.log(`Variant ${selectedVariant}:`, {
    totalUsers: observedData.length,
    hasZeros,
    zeroCount,
    convertedCount: variantRawData.users.filter((u) => u.converted).length,
  });

  // Check if this is a compound model with decomposition
  const isCompound = variantResult.isCompoundModel();
  const decomposition = variantResult.getDecomposition();

  console.log(`Model type:`, {
    isCompound,
    hasDecomposition: decomposition !== null,
  });

  // Build condition object
  const cond = {
    name: variantRawData.displayName,
    description: `Analysis of ${variantRawData.displayName} showing revenue per customer distribution and uncertainty.`,
    posteriorSamples: posteriorSamples,
    observedData: observedData,
    metadata: {
      isCompound: isCompound,
      sampleSize: variantRawData.users.length,
      convertedCount: variantRawData.users.filter((u) => u.converted).length,
    },
  };

  // Add decomposition if available (compound model)
  if (isCompound && decomposition) {
    cond.decomposition = {
      frequency: {
        samples: decomposition.frequency.sample(10000),
      },
      severity: {
        samples: decomposition.severity.sample(10000),
      },
    };
  }

  return cond;
})();
```

## ${condition.name}

${condition.description}

## Interactive Outcome Exploration

**Ask probabilistic questions in outcome space:**

### Revenue per Customer

```js
const revenueThreshold = view(
  Inputs.range([0, 150], {
    label: 'Revenue threshold ($)',
    step: 5,
    value: 50,
  })
);
```

```js
const probAboveRevenue = probabilityAbove(condition.posteriorSamples, revenueThreshold);
const probBelowRevenue = probabilityBelow(condition.posteriorSamples, revenueThreshold);
```

<div class="card">
  <div class="grid grid-cols-2">
    <div>
      <div class="metric">${formatPercent(probAboveRevenue)}</div>
      <div style="font-size: 0.875rem; color: #6b7280;">
        probability revenue per customer <strong>exceeds ${formatCurrency(revenueThreshold, 0)}</strong>
      </div>
    </div>
    <div>
      <div class="metric">${formatPercent(probBelowRevenue)}</div>
      <div style="font-size: 0.875rem; color: #6b7280;">
        probability revenue per customer is <strong>below ${formatCurrency(revenueThreshold, 0)}</strong>
      </div>
    </div>
  </div>
</div>

**Drag the slider** to explore different thresholds. Watch the probabilities update continuously.

### Credible Intervals (Adjustable Uncertainty)

```js
const ciLevel = view(
  Inputs.range([0.5, 0.99], {
    label: 'Credible interval level',
    step: 0.01,
    value: 0.8,
  })
);
```

```js
const ci = credibleInterval(condition.posteriorSamples, ciLevel);
const median = d3.median(condition.posteriorSamples);
```

<div class="card">
  <h3>Revenue per Customer</h3>
  <div class="metric">${formatCurrency(median)}</div>
  <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
    median estimate
  </div>
  <div style="font-size: 1.125rem; color: #374151; margin-top: 1.5rem;">
    <strong>We are ${(ciLevel * 100).toFixed(0)}% confident</strong> revenue per customer is between
  </div>
  <div style="font-size: 1.25rem; font-weight: 600; color: #1f2937; margin-top: 0.5rem;">
    ${formatCurrency(ci[0])} – ${formatCurrency(ci[1])}
  </div>
</div>

**Drag the CI level slider** from 50% → 99%. Watch the interval widen. This teaches that **uncertainty quantification is a choice**, not a fixed "95%" magic number.

## Posterior Predictive Check (PPC)

Comparing observed data (what we actually saw) vs posterior predictive (what the model expects).

```js
Plot.plot({
  height: 400,
  marks: [
    // Observed data (coral histogram)
    Plot.rectY(
      condition.observedData,
      Plot.binX(
        { y: 'count' },
        {
          x: (d) => d,
          fill: 'coral',
          fillOpacity: 0.6,
          thresholds: 30,
        }
      )
    ),
    // Posterior predictive (purple density)
    Plot.density(condition.posteriorSamples, {
      stroke: 'purple',
      strokeWidth: 2,
      fill: 'purple',
      fillOpacity: 0.2,
    }),
    // Credible interval bands (reactive to ciLevel!)
    Plot.ruleX([ci[0], ci[1]], {
      stroke: 'purple',
      strokeWidth: 2,
      strokeDasharray: '4,2',
    }),
  ],
  x: {
    label: 'Revenue per customer ($)',
  },
  y: {
    label: 'Frequency / Density',
  },
});
```

<div style="font-size: 0.875rem; color: #6b7280; margin-top: 1rem;">
  <span style="color: coral; font-weight: 600;">▬</span> Observed data
  &nbsp;&nbsp;
  <span style="color: purple; font-weight: 600;">▬</span> Posterior predictive
  &nbsp;&nbsp;
  <span style="color: purple; font-weight: 600;">┊┊</span> ${(ciLevel * 100).toFixed(0)}% credible interval
</div>

### PPC Diagnostics

```js
const observedMean = d3.mean(condition.observedData);
const predictedMean = d3.mean(condition.posteriorSamples);
const observedStd = d3.deviation(condition.observedData);
const predictedStd = d3.deviation(condition.posteriorSamples);
const ks = ksStatistic(condition.observedData, condition.posteriorSamples);
const cal = calibration(condition.observedData, condition.posteriorSamples, ciLevel);
```

<div class="grid grid-cols-2">
  <div class="card">
    <div class="metric-label">Observed Mean</div>
    <div class="metric" style="font-size: 1.5rem;">${formatCurrency(observedMean)}</div>
  </div>
  <div class="card">
    <div class="metric-label">Predicted Mean</div>
    <div class="metric" style="font-size: 1.5rem;">${formatCurrency(predictedMean)}</div>
  </div>
  <div class="card">
    <div class="metric-label">Observed Std Dev</div>
    <div class="metric" style="font-size: 1.5rem;">${formatCurrency(observedStd)}</div>
  </div>
  <div class="card">
    <div class="metric-label">Predicted Std Dev</div>
    <div class="metric" style="font-size: 1.5rem;">${formatCurrency(predictedStd)}</div>
  </div>
</div>

<div class="card">
  <div class="grid grid-cols-2">
    <div>
      <div class="metric-label">KS Statistic</div>
      <div class="metric" style="font-size: 1.5rem;">${ks.toFixed(3)}</div>
      <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
        ${ks < 0.05 ? '✓ Good fit' : ks < 0.1 ? '⚠ Moderate fit' : '✗ Poor fit'}
      </div>
    </div>
    <div>
      <div class="metric-label">Calibration</div>
      <div class="metric" style="font-size: 1.5rem;">${cal.toFixed(1)}%</div>
      <div style="font-size: 0.875rem; color: #6b7280; margin-top: 0.5rem;">
        of observed data in ${(ciLevel * 100).toFixed(0)}% CI<br/>
        (should be close to ${(ciLevel * 100).toFixed(0)}%)
      </div>
    </div>
  </div>
</div>

## Decomposition: Conversion × Revenue-per-Converter

```js
// Only show decomposition if compound model
if (condition.metadata.isCompound && condition.decomposition) {
  display(html`<p>For compound models, we can decompose revenue into two components:</p>`);
} else {
  display(
    html`<div class="card">
      <p style="color: #6b7280;">
        This variant does not use a compound model (no decomposition available).
      </p>
    </div>`
  );
}
```

```js
// Conversion rate threshold (only if compound model)
const convThreshold = condition.metadata.isCompound
  ? view(
      Inputs.range([0, 0.2], {
        label: 'Conversion rate threshold',
        step: 0.005,
        value: 0.08,
      })
    )
  : null;
```

```js
// Conversion rate calculations (only if compound model)
const conversionAnalysis =
  condition.metadata.isCompound && condition.decomposition
    ? {
        probConvAbove: probabilityAbove(condition.decomposition.frequency.samples, convThreshold),
        convCI: credibleInterval(condition.decomposition.frequency.samples, ciLevel),
        convMedian: d3.median(condition.decomposition.frequency.samples),
      }
    : null;
```

```js
// Display conversion rate section
if (condition.metadata.isCompound && conversionAnalysis) {
  display(html`
    <h3>Conversion Rate</h3>
    <div class="card">
      <div class="metric">${formatPercent(conversionAnalysis.probConvAbove)}</div>
      <div style="font-size: 0.875rem; color: #6b7280;">
        probability conversion rate <strong>exceeds ${formatPercent(convThreshold, 1)}</strong>
      </div>
      <div style="font-size: 1.125rem; color: #374151; margin-top: 1.5rem;">
        <strong>${(ciLevel * 100).toFixed(0)}% confident</strong> conversion rate is between
        <strong
          >${formatPercent(conversionAnalysis.convCI[0], 1)} –
          ${formatPercent(conversionAnalysis.convCI[1], 1)}</strong
        >
      </div>
    </div>
  `);
}
```

```js
// Revenue per converter threshold (only if compound model)
const aovThreshold = condition.metadata.isCompound
  ? view(
      Inputs.range([0, 150], {
        label: 'Revenue per converter threshold ($)',
        step: 5,
        value: 60,
      })
    )
  : null;
```

```js
// Revenue per converter calculations (only if compound model)
const aovAnalysis =
  condition.metadata.isCompound && condition.decomposition
    ? {
        probAOVAbove: probabilityAbove(condition.decomposition.severity.samples, aovThreshold),
        aovCI: credibleInterval(condition.decomposition.severity.samples, ciLevel),
        aovMedian: d3.median(condition.decomposition.severity.samples),
      }
    : null;
```

```js
// Display revenue per converter section
if (condition.metadata.isCompound && aovAnalysis) {
  display(html`
    <h3>Revenue per Converter</h3>
    <div class="card">
      <div class="metric">${formatPercent(aovAnalysis.probAOVAbove)}</div>
      <div style="font-size: 0.875rem; color: #6b7280;">
        probability revenue per converter
        <strong>exceeds ${formatCurrency(aovThreshold, 0)}</strong>
      </div>
      <div style="font-size: 1.125rem; color: #374151; margin-top: 1.5rem;">
        <strong>${(ciLevel * 100).toFixed(0)}% confident</strong> revenue per converter is between
        <strong
          >${formatCurrency(aovAnalysis.aovCI[0])} – ${formatCurrency(aovAnalysis.aovCI[1])}</strong
        >
      </div>
    </div>
  `);
}
```

```js
// Display decomposition visualizations
if (condition.metadata.isCompound && condition.decomposition && conversionAnalysis) {
  display(html`<h3>Decomposition Visualization</h3>`);

  display(
    Plot.plot({
      height: 300,
      marks: [
        Plot.density(condition.decomposition.frequency.samples, {
          stroke: 'steelblue',
          strokeWidth: 2,
          fill: 'steelblue',
          fillOpacity: 0.2,
        }),
        Plot.ruleX([conversionAnalysis.convCI[0], conversionAnalysis.convCI[1]], {
          stroke: 'steelblue',
          strokeDasharray: '4,2',
        }),
      ],
      x: {
        label: 'Conversion rate',
        percent: true,
      },
      y: {
        label: 'Density',
      },
    })
  );

  display(
    Plot.plot({
      height: 300,
      marks: [
        Plot.density(condition.decomposition.severity.samples, {
          stroke: 'green',
          strokeWidth: 2,
          fill: 'green',
          fillOpacity: 0.2,
        }),
        Plot.ruleX([aovAnalysis.aovCI[0], aovAnalysis.aovCI[1]], {
          stroke: 'green',
          strokeDasharray: '4,2',
        }),
      ],
      x: {
        label: 'Revenue per converter ($)',
      },
      y: {
        label: 'Density',
      },
    })
  );
}
```

---

**Key insight**: Every statement is **probabilistic** and **in outcome space**. No Greek letters, no p-values, just continuous probability of business-relevant outcomes.
