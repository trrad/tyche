# Tyche

Browser-based inference engine for A/B testing and business experiments. Runs entirely client-side using WebWorkers for responsive UIs during heavy computation.

## Quick Start

```bash
# Install dependencies
npm install

# Run the inference explorer
npm run dev

# Run tests
npm test
```

## Where Things Live

```
src/
├── core/               # Distributions, posteriors, and numerical utilities
├── inference/          # Inference algorithms (conjugate, EM, VI)
├── models/             # Business-level models (conversion, revenue, compound)
├── workers/            # WebWorker infrastructure for parallel computation
├── hooks/              # React hooks (useInferenceWorker)
├── ui/                 # UI components and visualizations
│   ├── components/     # React components
│   └── visualizations/ # Distribution plots, diagnostics
├── tests/              # Test suite with business scenarios
└── analysis/           # Power analysis and decision tools (coming soon)
```

## Example Usage

```typescript
import { useInferenceWorker } from './src/hooks/useInferenceWorker';

// Run inference in a worker, get reactive updates
const { runInference, isRunning, progress } = useInferenceWorker();

const result = await runInference(
  'compound-beta-lognormal',  // Model type
  { data: userData },          // Your data
  { priorParams: myPriors }    // Optional config
);

// Access results (cached stats are instant, sampling is async)
const conversionRate = result.posterior.frequency.mean()[0];
const samples = await result.posterior.frequency.sample(10000);
```

## Learn More

- **[Roadmap](Tyche%20Roadmap%202.4)** - Project vision and upcoming features
- **[Workers README](src/workers/README.md)** - WebWorker architecture and proxy pattern
- **[Inference README](src/inference/README.md)** - Available algorithms and how they work
- **[Visualizations README](src/ui/visualizations/README.md)** - Plotting distributions and results

## Contributing

Check the README in each directory for specifics about that module. The codebase uses TypeScript throughout for type safety.