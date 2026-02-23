# Experiment Results

```js
import * as d3 from 'npm:d3';
import * as Tyche from './dist/tyche.js';
import { loadExperimentData, getDataSummary } from './data/loader.js';
import { runAnalysis, formatResults, getWinner } from './lib/analysis.js';
import { prepareRidgePlotData, prepareAbsoluteData } from './components/wrappers.js';
import { formatPercent, formatCurrency, probabilityAbove } from './components/utils.js';
```

```js
// Load experiment data from previous page
const experimentData = loadExperimentData();

if (!experimentData) {
  display(html`
    <div
      style="background: #f8d7da; border: 2px solid #dc3545; border-radius: 0.5rem; padding: 2rem; margin: 2rem 0;"
    >
      <h2 style="margin-top: 0; color: #721c24;">No Data Loaded</h2>
      <p>Please <a href="./">return to the home page</a> and load experiment data.</p>
    </div>
  `);
}
```

```js
// Get summary statistics
const summary = getDataSummary(experimentData);
```

```js
// Display experiment title
display(html`<h2>${experimentData?.name || 'Experiment Analysis'}</h2>`);
```

```js
// Display summary
display(
  html`<p>
    Analyzing <strong>${summary.totalUsers.toLocaleString()} sessions</strong> across
    <strong>${Object.keys(summary.variants).length} variants</strong>.
  </p>`
);
```

```js
// Run Tyche analysis
const analysis = await runAnalysis(experimentData);
```

## Analysis Controls

```js
viewof ciLevel = Inputs.range([0.5, 0.99], {
  label: 'Credible Interval:',
  step: 0.01,
  value: 0.80,
  format: v => `${(v * 100).toFixed(0)}%`
});
```

```js
viewof threshold = Inputs.range([0, 0.5], {
  label: 'Decision Threshold:',
  step: 0.01,
  value: 0.10,
  format: v => `${(v * 100).toFixed(0)}%`
});
```

```js
viewof viewMode = Inputs.radio(['lift', 'absolute'], {
  label: 'View:',
  value: 'lift'
});
```

## Lift Distributions

```js
// Format results with current settings
const results = formatResults(analysis, ciLevel, threshold);
```

```js
// Prepare data for visualization
const vizData =
  viewMode === 'lift'
    ? prepareRidgePlotData(analysis.result, analysis.comparison, analysis.baseline, threshold)
    : prepareAbsoluteData(
        analysis.result,
        Object.keys(summary.variants),
        analysis.baseline,
        threshold
      );
```

```js
// Render RidgeDotplot
function renderChart(data, ciLower, ciUpper) {
  const container = html`<div style="width: 100%; max-width: 1000px; margin: 2rem auto;"></div>`;

  const viz = Tyche.RidgeDotplot()
    .ciLower(ciLower)
    .ciUpper(ciUpper)
    .numDots(20)
    .showViolin(true)
    .showCIBounds(true)
    .showStatistics(true);

  d3.select(container).datum(data).call(viz);

  return container;
}

renderChart(vizData, results.ciLower, results.ciUpper);
```

## Variant Statistics

```js
display(html`
  <div
    style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin: 2rem 0;"
  >
    ${results.variants.map((v) => {
      const s = summary.variants[v.name];
      return html`
        <div
          class="card"
          style="padding: 1.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem;"
        >
          <h3 style="margin-top: 0; color: #111827;">${s.displayName}</h3>

          <div style="margin: 1rem 0;">
            <div
              style="font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em;"
            >
              Median Lift
            </div>
            <div
              style="font-size: 1.75rem; font-weight: 700; color: ${v.median > 0
                ? '#10b981'
                : '#ef4444'};"
            >
              ${formatPercent(v.median, 1)}
            </div>
          </div>

          <div style="margin: 1rem 0; padding: 1rem; background: #f9fafb; border-radius: 0.25rem;">
            <div style="font-size: 0.875rem; color: #4b5563;">
              ${(ciLevel * 100).toFixed(0)}% Credible Interval
            </div>
            <div style="font-size: 1rem; font-weight: 600; color: #111827;">
              ${formatPercent(v.ci[0], 1)} to ${formatPercent(v.ci[1], 1)}
            </div>
          </div>

          <div style="border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-top: 1rem;">
            <div style="font-size: 0.875rem; color: #374151; margin: 0.5rem 0;">
              <strong>${formatPercent(v.probPositive, 0)}</strong> probability of ANY increase
            </div>
            <div style="font-size: 0.875rem; color: #374151; margin: 0.5rem 0;">
              <strong>${formatPercent(v.probMeaningful, 0)}</strong> probability of
              >${(threshold * 100).toFixed(0)}% increase
            </div>
          </div>

          <div
            style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #6b7280;"
          >
            ${s.totalUsers.toLocaleString()} sessions • ${formatPercent(s.conversionRate, 1)}
            conversion
          </div>
        </div>
      `;
    })}
  </div>
`);
```

## Recommendation

```js
const winner = getWinner(results, {
  requiredProbability: 0.75,
  minimumEffectSize: 0.05,
});
```

```js
display(html`
  <div
    style="padding: 2rem; border-radius: 0.5rem; margin: 2rem 0; background: ${winner.shouldShip
      ? '#d1fae5'
      : '#fef3c7'}; border: 2px solid ${winner.shouldShip ? '#10b981' : '#f59e0b'};"
  >
    <div style="display: flex; align-items: center; gap: 1rem;">
      <div style="font-size: 2rem;">${winner.shouldShip ? '✓' : '⚠️'}</div>
      <div style="flex: 1;">
        <h3 style="margin: 0; color: ${winner.shouldShip ? '#065f46' : '#92400e'};">
          ${winner.shouldShip ? 'Recommendation: Ship' : 'Proceed with Caution'}
        </h3>
        <p style="margin: 0.5rem 0 0 0; color: ${winner.shouldShip ? '#047857' : '#b45309'};">
          ${winner.variant
            ? `${summary.variants[winner.variant.name].displayName} shows ${formatPercent(winner.probability, 0)} probability of exceeding ${(threshold * 100).toFixed(0)}% lift`
            : 'No variant meets decision criteria'}
        </p>
        <p
          style="margin: 0.5rem 0 0 0; font-size: 0.875rem; color: ${winner.shouldShip
            ? '#059669'
            : '#d97706'};"
        >
          Confidence: ${winner.confidence.toUpperCase()}
        </p>
      </div>
    </div>
  </div>
`);
```

---

<div style="text-align: center; margin: 2rem 0;">
  <a href="./" style="color: #3b82f6; text-decoration: none;">← Load Different Data</a>
</div>
