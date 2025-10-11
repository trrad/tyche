# Condition Analysis: Deep Dive

Analyzing a single variant in **outcome space** with interactive threshold exploration.

```js
import * as Plot from 'npm:@observablehq/plot';
import * as d3 from 'npm:d3';
import { analyzeCondition } from '../data/analyze-condition.js';
import {
  credibleInterval,
  probabilityAbove,
  probabilityBelow,
  formatPercent,
  formatCurrency,
  ksStatistic,
  calibration,
} from '../components/utils.js';
```

```js
const selectedCondition = view(
  Inputs.select(['control', 'treatmentA', 'treatmentB', 'treatmentC'], {
    label: 'Select variant to analyze:',
    format: (v) =>
      ({
        control: 'Control (Current Algorithm)',
        treatmentA: 'Treatment A (Collaborative Filtering)',
        treatmentB: 'Treatment B (Content-Based)',
        treatmentC: 'Treatment C (Hybrid)',
      })[v],
  })
);
```

```js
// Load condition data
const condition = await analyzeCondition(selectedCondition);
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
    format: (d) => `${(d * 100).toFixed(0)}%`,
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

${condition.metadata.isCompound ? `
For compound models, we can decompose revenue into two components:

### Conversion Rate

\`\`\`js
const convThreshold = view(Inputs.range([0, 0.2], {
label: "Conversion rate threshold",
step: 0.005,
value: 0.08,
format: d => formatPercent(d, 1)
}));
\`\`\`

\`\`\`js
const probConvAbove = probabilityAbove(condition.decomposition.frequency.samples, convThreshold);
const convCI = credibleInterval(condition.decomposition.frequency.samples, ciLevel);
const convMedian = d3.median(condition.decomposition.frequency.samples);
\`\`\`

<div class="card">
  <div class="metric">${formatPercent(probConvAbove)}</div>
  <div style="font-size: 0.875rem; color: #6b7280;">
    probability conversion rate <strong>exceeds ${formatPercent(convThreshold, 1)}</strong>
  </div>
  <div style="font-size: 1.125rem; color: #374151; margin-top: 1.5rem;">
    <strong>${(ciLevel * 100).toFixed(0)}% confident</strong> conversion rate is between
    <strong>${formatPercent(convCI[0], 1)} – ${formatPercent(convCI[1], 1)}</strong>
  </div>
</div>

### Revenue per Converter

\`\`\`js
const aovThreshold = view(Inputs.range([0, 150], {
label: "Revenue per converter threshold ($)",
step: 5,
value: 60
}));
\`\`\`

\`\`\`js
const probAOVAbove = probabilityAbove(condition.decomposition.severity.samples, aovThreshold);
const aovCI = credibleInterval(condition.decomposition.severity.samples, ciLevel);
const aovMedian = d3.median(condition.decomposition.severity.samples);
\`\`\`

<div class="card">
  <div class="metric">${formatPercent(probAOVAbove)}</div>
  <div style="font-size: 0.875rem; color: #6b7280;">
    probability revenue per converter <strong>exceeds ${formatCurrency(aovThreshold, 0)}</strong>
  </div>
  <div style="font-size: 1.125rem; color: #374151; margin-top: 1.5rem;">
    <strong>${(ciLevel * 100).toFixed(0)}% confident</strong> revenue per converter is between
    <strong>${formatCurrency(aovCI[0])} – ${formatCurrency(aovCI[1])}</strong>
  </div>
</div>

### Decomposition Visualization

\`\`\`js
Plot.plot({
height: 300,
marks: [
Plot.density(condition.decomposition.frequency.samples, {
stroke: "steelblue",
strokeWidth: 2,
fill: "steelblue",
fillOpacity: 0.2
}),
Plot.ruleX([convCI[0], convCI[1]], {
stroke: "steelblue",
strokeDasharray: "4,2"
})
],
x: {
label: "Conversion rate",
percent: true
},
y: {
label: "Density"
}
})
\`\`\`

\`\`\`js
Plot.plot({
height: 300,
marks: [
Plot.density(condition.decomposition.severity.samples, {
stroke: "green",
strokeWidth: 2,
fill: "green",
fillOpacity: 0.2
}),
Plot.ruleX([aovCI[0], aovCI[1]], {
stroke: "green",
strokeDasharray: "4,2"
})
],
x: {
label: "Revenue per converter ($)"
},
y: {
label: "Density"
}
})
\`\`\`

`:`

<div class="card">
  <p style="color: #6b7280;">This variant does not use a compound model (no decomposition available).</p>
</div>
`}

---

**Key insight**: Every statement is **probabilistic** and **in outcome space**. No Greek letters, no p-values, just continuous probability of business-relevant outcomes.
