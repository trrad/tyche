# TycheJS

A Bayesian A/B testing tool that actually makes sense. Built because I was tired of the frequentist calculators all over the web that make you jump through logical hoops to answer simple questions.

**This is very much a work in progress**, but there's a working proof of concept you can try. The core interactive inference engine is functional, and you can see it in action in our live demo.

[Documentation](docs/CoreVision.md) | [Roadmap](docs/ImplementationRoadmap.md) | [Architecture](docs/TechnicalArchitecture.md)

## Why this exists

Instead of asking "In how many hypothetical worlds would we see an effect this large if there were no real difference?" (and then making decisions based on that backward question), Tyche asks: *"Given what we know about the world and what this experiment teaches us, what can we say about the effect?"*

Genuine probabilistic understanding comes through interaction—not just reading about Bayes' theorem, but *feeling* how evidence updates beliefs as you change assumptions and watch the distribution dance in real time. Most web A/B test and power calculators force you into the frequentist straightjacket of "significant or not." Tyche shows you the full distribution of plausible effects, lets you explore what happens under different priors, and helps you understand what your data is actually telling you.

- **Bayesian throughout**: Full posterior distributions, not point estimates and p-values
- **Automatic model selection**: Handles conversion, revenue, and compound metrics intelligently
- **Progressive complexity**: Start simple, reveal advanced features as you explore  
- **Browser-native**: Zero server setup, works offline, respects privacy
- **Segment discovery**: Find who responds differently (HTE analysis, Causal Trees)
- **Extensible**: Clean interfaces for custom models and priors, inspired by a mix of PyMC3, WebPPL and Edward

*Stop throwing away the rich detail in your data to make a largely meaningless statment like p=0.03. Start asking what your data can teach you about the world you actually live in, and learn to reason correctly by accepting uncertainty as a fundemental part of belief*

## Quick Start

```bash
# Install dependencies
npm install

# Run the inference explorer
npm run dev:explorer

# Run tests
npm test
```

## Example Usage

```typescript
// Modern fluent API for experiment analysis
const result = await tyche
  .experiment(data)
  .forMetric('revenue')
  .withPrior(customPrior)
  .analyze();

// Rich result exploration
const summary = result.summary();                    // Immediate insights
const comparison = await result.compareVariants();   // Cross-variant analysis  
const segments = await result.discoverSegments();    // HTE discovery
const effect = result.getVariantResult('treatment')
  .getDecomposition();                               // Compound model breakdown
```

```typescript
// Or use the worker infrastructure directly
import { useInferenceWorker } from './src/hooks/useInferenceWorker';

const { runInference, isRunning, progress } = useInferenceWorker();

const result = await runInference(
  'compound-beta-lognormal',  // 'auto' for automatic model selection
  { data: userData },         // Your experiment data
  { priorParams: myPriors }   // Optional Bayesian priors
);

// Access rich posteriors (cached stats are instant, sampling is async)
const conversionRate = result.posterior.frequency.mean()[0];
const revenuePerUser = result.posterior.mean()[0];
const samples = await result.posterior.sample(10000);
```

## Project Structure

```
📦 tyche/
├── 📚 docs/                    # Comprehensive documentation
│   ├── CoreVision.md           # Project philosophy & vision
│   ├── TechnicalArchitecture.md # System design & data flow  
│   ├── InterfaceStandards.md   # Complete interface definitions
│   └── ImplementationRoadmap.md # Development roadmap
├── 🔬 src/
│   ├── core/                   # Mathematical foundations & distributions
│   ├── inference/              # Bayesian inference engines (conjugate, EM, VI)
│   ├── models/                 # Business model patterns (conversion, revenue, compound)
│   ├── ui/                     # React components & visualizations
│   │   ├── components/         # Reusable UI components
│   │   └── visualizations/     # Distribution plots & diagnostics
│   ├── workers/                # WebWorker infrastructure for parallel computation
│   ├── hooks/                  # React hooks (useInferenceWorker)
│   ├── tests/                  # Comprehensive test suite with business scenarios
│   └── analysis/               # Power analysis and decision tools
└── 🧪 examples/                # Interactive demos & tutorials
```

## Documentation

| Document | Purpose |
|----------|---------|
| [**Core Vision**](docs/CoreVision.md) | Project philosophy and what makes Tyche different |
| [**Technical Architecture**](docs/TechnicalArchitecture.md) | System design, data flow, and architectural decisions |
| [**Interface Standards**](docs/InterfaceStandards.md) | Complete API reference and interface definitions |
| [**Implementation Roadmap**](docs/ImplementationRoadmap.md) | Development phases and detailed implementation plan |

**Additional Technical Docs:**
- [**Data Generator**](src/tests/utilities/synthetic/Readme.md) - Synthetic data generation for testing
- [**Workers Architecture**](src/workers/Readme.md) - WebWorker infrastructure and proxy patterns
- [**Inference Engines**](src/inference/Readme.md) - Available algorithms and implementations
- [**Visualizations**](src/ui/visualizations/Readme.md) - Distribution plotting and diagnostics

*Start with [Core Vision](docs/CoreVision.md) for the big picture, then explore [Technical Architecture](docs/TechnicalArchitecture.md) to understand how it works.*

## Development Status

- ✅ **Phase 1**: Core inference engine with unified distributions  
- 🔄 **Phase 2**: Business-focused analyzers & power analysis
- 🗓️ **Phase 3**: HTE discovery & validation framework
- 📋 **Phase 4**: Natural language insights & embeddable visualizations

Each phase builds on the previous one, but should be useful on its own.

[View detailed roadmap](docs/ImplementationRoadmap.md)

## What it does (so far)

### Automatic Model Selection
- **Binomial data**: Exact Beta-Binomial conjugate updates
- **User-level data**: Smart routing between simple and compound models
- **Zero-inflated metrics**: Automatic compound model detection (frequency × severity)
- **Mixture detection**: EM algorithms for extremely multi-modal data (ie: B2B vs. B2C in same data)

### Rich Analysis Results
- **Probabilistic comparisons**: Full posterior distributions, not just point estimates
- **Effect decomposition**: Separate conversion and value effects in compound models
- **Segment discovery**: Find meaningful user groups with differential treatment effects
- **Progressive disclosure**: Simple summaries that reveal complexity when needed

### Browser-First Architecture
- **WebWorker computation**: Responsive UI during heavy inference
- **Memory efficient**: Handles large datasets without blocking
- **Offline capable**: No server dependencies, runs 100% locally.
- **Privacy preserving**: Your data never leaves your browser

## Technical Approach

**Two Data Input Types**
- **Binomial**: Aggregate conversion data (successes/trials)
- **User-level**: Everything else requiring row-level user data to enable full Bayesian updating

**Model Structure vs Type**
- **Structure**: `simple` (direct) or `compound` (zero-inflated, frequency × severity)  
- **Type**: `beta`, `lognormal`, `normal`, `gamma`, more soon...
- **Automatic routing**: Data compatability drives initial model selection, with optional advanced comparison metrics (WAIC/BIC)

**Bayesian Throughout**
- **Conjugate updates** when possible (sub-millisecond)
- **EM algorithms** for mixtures and complex models -- MCMC/VI fitting for mixtures coming soon for weight posteriors.
- **Proper uncertainty** quantification at every step

*Technical interfaces detailed in [InterfaceStandards.md](docs/InterfaceStandards.md)*

---

*The goal is to make Bayesian analysis feel as natural as using a calculator, while still being statistically rigorous. Constraints are features—they ensure the insights you get are interpretable and actionable.*
