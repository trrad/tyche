# Variant Deep Dive

```js
import * as d3 from 'npm:d3';
import * as Tyche from './dist/tyche.js';
import { loadExperimentData, getDataSummary } from './data/loader.js';
import {
  runAnalysis,
  formatResults,
  getVariantPosterior,
  getDecomposition,
  computeSummaryStats,
} from './lib/analysis.js';
import {
  formatPercent,
  formatCurrency,
  probabilityAbove,
  credibleInterval,
} from './components/utils.js';
```

```js
// Load experiment data
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
// Get variant name from URL params
const urlParams = new URLSearchParams(window.location.search);
const variantParam = urlParams.get('variant');
```

```js
// Run analysis
const analysis = await runAnalysis(experimentData);
const variantNames = analysis.result.getVariantNames();
```

```js
// Variant selector
viewof selectedVariant = Inputs.select(variantNames, {
  label: 'Variant:',
  value: variantParam && variantNames.includes(variantParam) ? variantParam : variantNames[0]
});
```

```js
// Get summary info (reactive to selectedVariant)
summary = getDataSummary(experimentData);
```

```js
variantInfo = summary.variants[selectedVariant];
```

```js
// Display variant header (reactive)
html`<h2>${variantInfo.displayName}</h2>`;
```

```js
// Display variant summary (reactive)
html`<p>
  <strong>${variantInfo.totalUsers.toLocaleString()} sessions</strong> •
  <strong>${formatPercent(variantInfo.conversionRate, 1)} conversion rate</strong>
</p>`;
```

```js
// Extract posterior samples for this variant (reactive)
posterior = getVariantPosterior(analysis, selectedVariant, 10000);
```

```js
// Compute summary statistics (reactive)
posteriorStats = computeSummaryStats(posterior.samples, 0.8);
```

## Posterior Distribution

Full posterior with **100 quantile dots** showing the complete distribution of revenue per user.

```js
viewof ciLevel = Inputs.range([0.5, 0.99], {
  label: 'Credible Interval:',
  step: 0.01,
  value: 0.80,
  format: v => `${(v * 100).toFixed(0)}%`
});
```

```js
// Compute CI bounds
const ciLower = (1 - ciLevel) / 2;
const ciUpper = 1 - ciLower;
```

```js
// Render QuantileDots visualization
function renderQuantileDots(samples, ciLower, ciUpper) {
  const container = html`<div style="width: 100%; max-width: 800px; margin: 2rem auto;"></div>`;

  const data = {
    samples: samples,
    name: variantInfo.displayName,
  };

  const viz = Tyche.QuantileDots()
    .ciLower(ciLower)
    .ciUpper(ciUpper)
    .numDots(100)
    .showCIBounds(true)
    .showTooltip(true);

  d3.select(container).datum(data).call(viz);

  return container;
}

renderQuantileDots(posterior.samples, ciLower, ciUpper);
```

## Summary Statistics

```js
display(html`
  <div
    style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin: 2rem 0;"
  >
    <div
      class="card"
      style="padding: 1.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem;"
    >
      <div
        style="font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 0.5rem;"
      >
        Mean
      </div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #111827;">
        ${formatCurrency(posteriorStats.mean)}
      </div>
    </div>

    <div
      class="card"
      style="padding: 1.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem;"
    >
      <div
        style="font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 0.5rem;"
      >
        Median
      </div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #111827;">
        ${formatCurrency(posteriorStats.median)}
      </div>
    </div>

    <div
      class="card"
      style="padding: 1.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem;"
    >
      <div
        style="font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 0.5rem;"
      >
        Std Dev
      </div>
      <div style="font-size: 1.5rem; font-weight: 700; color: #111827;">
        ${formatCurrency(posteriorStats.std)}
      </div>
    </div>

    <div
      class="card"
      style="padding: 1.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem;"
    >
      <div
        style="font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; margin-bottom: 0.5rem;"
      >
        ${(ciLevel * 100).toFixed(0)}% Credible Interval
      </div>
      <div style="font-size: 1.125rem; font-weight: 600; color: #111827;">
        ${formatCurrency(posteriorStats.ci[0])} to ${formatCurrency(posteriorStats.ci[1])}
      </div>
    </div>
  </div>
`);
```

## Percentiles

```js
display(html`
  <div style="margin: 2rem 0;">
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb;">
          <th style="text-align: left; padding: 0.75rem; font-weight: 600; color: #374151;">
            Percentile
          </th>
          <th style="text-align: right; padding: 0.75rem; font-weight: 600; color: #374151;">
            Value
          </th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(posteriorStats.percentiles).map(
          ([key, value]) => html`
            <tr style="border-bottom: 1px solid #f3f4f6;">
              <td style="padding: 0.75rem; color: #6b7280;">${key.toUpperCase()}</td>
              <td style="text-align: right; padding: 0.75rem; font-weight: 500; color: #111827;">
                ${formatCurrency(value)}
              </td>
            </tr>
          `
        )}
      </tbody>
    </table>
  </div>
`);
```

```js
// Get decomposition if compound model (reactive)
decomposition = posterior.isCompound ? getDecomposition(posterior, 10000) : null;
```

```js
// Display decomposition section if compound model (reactive)
posterior.isCompound && decomposition
  ? html`
      <div>
        <h2>Decomposition</h2>
        <p>
          This variant uses a <strong>compound model</strong> (Beta × LogNormal) to separately
          estimate conversion rate and revenue per converter.
        </p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 2rem 0;">
          <div>
            <h3 style="margin-top: 0;">Conversion Rate (Frequency)</h3>
            <p style="color: #6b7280; font-size: 0.875rem;">Probability that a user converts</p>
            ${(() => {
              const freqStats = computeSummaryStats(decomposition.frequency.samples, ciLevel);
              return html`
                <div
                  style="background: #f9fafb; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;"
                >
                  <div style="font-size: 0.875rem; color: #6b7280;">
                    Mean:
                    <strong style="color: #111827;">${formatPercent(freqStats.mean, 2)}</strong>
                  </div>
                  <div style="font-size: 0.875rem; color: #6b7280;">
                    Median:
                    <strong style="color: #111827;">${formatPercent(freqStats.median, 2)}</strong>
                  </div>
                  <div style="font-size: 0.875rem; color: #6b7280;">
                    ${(ciLevel * 100).toFixed(0)}% CI:
                    <strong style="color: #111827;"
                      >${formatPercent(freqStats.ci[0], 2)} to
                      ${formatPercent(freqStats.ci[1], 2)}</strong
                    >
                  </div>
                </div>
              `;
            })()}
          </div>

          <div>
            <h3 style="margin-top: 0;">Revenue per Converter (Severity)</h3>
            <p style="color: #6b7280; font-size: 0.875rem;">
              Average order value among those who convert
            </p>
            ${(() => {
              const sevStats = computeSummaryStats(decomposition.severity.samples, ciLevel);
              return html`
                <div
                  style="background: #f9fafb; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;"
                >
                  <div style="font-size: 0.875rem; color: #6b7280;">
                    Mean: <strong style="color: #111827;">${formatCurrency(sevStats.mean)}</strong>
                  </div>
                  <div style="font-size: 0.875rem; color: #6b7280;">
                    Median:
                    <strong style="color: #111827;">${formatCurrency(sevStats.median)}</strong>
                  </div>
                  <div style="font-size: 0.875rem; color: #6b7280;">
                    ${(ciLevel * 100).toFixed(0)}% CI:
                    <strong style="color: #111827;"
                      >${formatCurrency(sevStats.ci[0])} to
                      ${formatCurrency(sevStats.ci[1])}</strong
                    >
                  </div>
                </div>
              `;
            })()}
          </div>
        </div>
      </div>
    `
  : html``;
```

## Raw Data

```js
display(html`
  <div style="margin: 2rem 0;">
    <h3 style="margin-bottom: 1rem;">Session-Level Data</h3>
    <div style="background: #f9fafb; padding: 1rem; border-radius: 0.5rem;">
      <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
        <strong>${variantInfo.totalUsers.toLocaleString()}</strong> total sessions
      </div>
      <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
        <strong>${variantInfo.convertedUsers.toLocaleString()}</strong> conversions
        (${formatPercent(variantInfo.conversionRate, 1)})
      </div>
      <div style="font-size: 0.875rem; color: #6b7280; margin-bottom: 0.5rem;">
        <strong>${formatCurrency(variantInfo.totalRevenue)}</strong> total revenue
      </div>
      <div style="font-size: 0.875rem; color: #6b7280;">
        <strong>${formatCurrency(variantInfo.averageRevenuePerUser)}</strong> average revenue per
        user
      </div>
    </div>
  </div>
`);
```

---

<div style="text-align: center; margin: 2rem 0;">
  <a href="./results" style="color: #3b82f6; text-decoration: none;">← Back to Results</a>
</div>
