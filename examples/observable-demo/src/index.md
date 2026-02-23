# Tyche: Bayesian A/B Test Analysis

A browser-based tool for analyzing experiment results using Bayesian inference. Explore distributional thinking with interactive visualizations.

---

## Load Experiment Data

Choose your data source to begin analysis:

```js
viewof dataSource = Inputs.radio(['example', 'upload'], {
  label: 'Data Source:',
  value: 'example',
  format: x => x === 'example' ? 'Example Data' : 'Upload CSV'
});
```

```js
import {
  generateExampleData,
  parseCSVFile,
  saveExperimentData,
  validateExperimentData,
} from './data/loader.js';
```

```js
// Display appropriate card based on data source
display(
  dataSource === 'example'
    ? html`
        <div
          class="card"
          style="padding: 1.5rem; background: #f9fafb; border-radius: 0.5rem; margin: 1rem 0;"
        >
          <h3 style="margin-top: 0;">Example Scenarios</h3>
          <p style="color: #6b7280; font-size: 0.875rem;">
            Pre-generated experiment data to explore the tool's capabilities.
          </p>
        </div>
      `
    : html`
        <div
          class="card"
          style="padding: 1.5rem; background: #fff3cd; border-radius: 0.5rem; margin: 1rem 0;"
        >
          <h3 style="margin-top: 0;">CSV Upload</h3>
          <p style="color: #856404; font-size: 0.875rem;">
            <strong>Required columns:</strong> user_id, variant, converted, revenue
          </p>
          <p style="color: #856404; font-size: 0.875rem;">
            • <code>user_id</code>: Unique identifier for each user<br />
            • <code>variant</code>: Experiment variant name (e.g., "control", "treatment_a")<br />
            • <code>converted</code>: Boolean (true/false or 1/0)<br />
            • <code>revenue</code>: Numeric value (0 for non-converters)
          </p>
        </div>
      `
);
```

```js
// Example data scenario selector
viewof scenario = dataSource === 'example' ? Inputs.select(
  ['marketplace', 'saas', 'ecommerce'],
  {
    label: 'Scenario:',
    value: 'marketplace',
    format: x => ({
      marketplace: 'E-commerce Marketplace',
      saas: 'SaaS Subscription',
      ecommerce: 'E-commerce Store'
    })[x]
  }
) : null;
```

```js
// CSV file upload
viewof csvFile = dataSource === 'upload' ? Inputs.file({
  label: 'Upload CSV:',
  accept: '.csv',
  required: true
}) : null;
```

```js
// Load data based on source
experimentData = await (async () => {
  if (dataSource === 'example') {
    return generateExampleData(scenario, { seed: 42, usersPerVariant: 1000 });
  } else if (csvFile) {
    try {
      const data = await parseCSVFile(csvFile);
      const validation = validateExperimentData(data);

      if (!validation.valid) {
        throw new Error(`Invalid data: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        display(html`
          <div
            style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 0.25rem; padding: 1rem; margin: 1rem 0;"
          >
            <strong>⚠️ Warnings:</strong>
            <ul style="margin: 0.5rem 0 0 0;">
              ${validation.warnings.map((w) => html`<li>${w}</li>`)}
            </ul>
          </div>
        `);
      }

      return data;
    } catch (error) {
      display(html`
        <div
          style="background: #f8d7da; border: 1px solid #dc3545; border-radius: 0.25rem; padding: 1rem; margin: 1rem 0; color: #721c24;"
        >
          <strong>❌ Error:</strong> ${error.message}
        </div>
      `);
      throw error;
    }
  }

  return null;
})();
```

${experimentData ? html`

  <div class="card" style="background: #d1fae5; border: 2px solid #10b981; border-radius: 0.5rem; padding: 1.5rem; margin: 2rem 0;">
    <h3 style="margin-top: 0; color: #065f46;">✓ Data Loaded Successfully</h3>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin: 1rem 0;">
      <div>
        <div style="font-size: 2rem; font-weight: 700; color: #059669;">
          ${experimentData.variants.treatments.size + 1}
        </div>
        <div style="font-size: 0.875rem; color: #065f46;">Variants</div>
      </div>
      <div>
        <div style="font-size: 2rem; font-weight: 700; color: #059669;">
          ${experimentData.metadata.totalRows || 'Generated'}
        </div>
        <div style="font-size: 0.875rem; color: #065f46;">Sessions</div>
      </div>
      <div>
        <div style="font-size: 2rem; font-weight: 700; color: #059669;">
          ${experimentData.metadata.source === 'csv' ? 'CSV' : 'Example'}
        </div>
        <div style="font-size: 0.875rem; color: #065f46;">Source</div>
      </div>
    </div>

    <button
      onclick=${() => {
        saveExperimentData(experimentData);
        window.location.href = './results';
      }}
      style="background: #10b981; color: white; border: none; padding: 0.75rem 2rem; border-radius: 0.375rem; font-size: 1rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 1rem;"
    >
      Analyze Experiment →
    </button>

  </div>
` : ''}

---

## About This Tool

This tool uses **Tyche**, a browser-based Bayesian inference engine, to analyze A/B test results. All computation happens in your browser - no data is sent to any server.

**Features:**

- **Distributional thinking:** See full posterior distributions, not just point estimates
- **Interactive exploration:** Drag CI bounds and thresholds to explore uncertainty
- **Automatic model selection:** Compound models for zero-inflated revenue data
- **Plain English:** Probability statements in business language

**Example use cases:**

- Revenue optimization experiments (conversion × revenue)
- Pricing tests
- Feature launches
- Marketing campaign comparisons

Built with modern web standards: WebAssembly for computation, D3 for visualization, Observable for reactivity.

---

<div style="text-align: center; padding: 2rem 0; color: #6b7280; font-size: 0.875rem;">
  <p>
    <a href="https://github.com/yourusername/tyche" target="_blank" style="color: #3b82f6;">View Source Code</a>
    •
    <a href="./docs" style="color: #3b82f6;">Documentation</a>
    •
    <a href="./about" style="color: #3b82f6;">About</a>
  </p>
  <p style="margin-top: 0.5rem;">
    Tyche v0.1.0 • Built with Observable Framework
  </p>
</div>
