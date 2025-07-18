# Tyche (τύχη)

*Greek goddess of fortune, chance, and probability*

A TypeScript library for Bayesian inference and experimental design, running entirely in the browser with automatic differentiation and (future) GPU acceleration.

## Core Features

- 🎯 **Experimental Design Focus**: Built for A/B testing, power analysis, and business experiments
- 🧮 **Automatic Differentiation**: Reverse-mode AD for gradient-based inference
- 🚀 **Browser-Native**: Zero installation, instant startup
- 📊 **Progressive Disclosure**: Simple API for beginners, full control for experts
- 🔬 **Rigorous**: Diagnostics and best practices built in from the start
- 🧩 **Composable Models**: Graph-based relationships between distributions
- 🧠 **Tool for Thinking**: Designed for interactive, visual model building (future)

## Project Structure (Current)

```
src/
├── core/
│   ├── RandomVariable.ts      # Core abstraction with AD
│   ├── ComputationGraph.ts    # Automatic differentiation engine
│   ├── math/
│   │   ├── random.ts         # RNG and sampling utilities
│   │   └── special.ts        # Special math functions
│   └── distributions/
│       ├── index.ts          # Distribution exports
│       ├── Beta.ts           # Beta distribution
│       ├── Binomial.ts       # Binomial/Bernoulli distributions
│       ├── Normal.ts         # Normal/Half-Normal distributions
│       ├── Gamma.ts          # Gamma distribution
│       ├── Exponential.ts    # Exponential distribution
│       └── LogNormal.ts      # LogNormal distribution
├── samplers/
│   └── Metropolis.ts         # Metropolis-Hastings sampler
├── models/
│   └── ConversionValueModel.ts # Conversion + value modeling
├── types/
│   └── *.d.ts                # Type declarations
├── tests/
│   ├── distributions.test.ts # Distribution tests
│   └── random-variable.test.ts # AD system tests
├── examples/
│   ├── basic-example.ts      # Usage examples
│   └── combined-demo.tsx     # Interactive demo (React)
└── index.ts                  # Main exports
```

## Quick Start

```typescript
import { beta, RNG, MetropolisSampler } from 'tyche';

// Create a reproducible RNG
const rng = new RNG(12345);

// Define a prior
const prior = beta(1, 1, rng);

// Run inference
const sampler = new MetropolisSampler();
const results = sampler.sample(prior, 1000);
```

## Example: Conversion Value Modeling

```typescript
import { ConversionValueModel, beta } from 'tyche';

const model = new ConversionValueModel(beta(1, 1), 'auto', 'revenue');
model.addVariant({ name: 'Control', users: [
  { converted: true, value: 100 },
  { converted: false, value: 0 },
  // ...
] });
const results = await model.analyze({ iterations: 3000 });
```

## Development Status

### ✅ Core (Complete)
- [x] RandomVariable abstraction with operator overloading
- [x] Automatic differentiation (forward & reverse mode)
- [x] Beta, Binomial, Normal, Gamma, Exponential, LogNormal distributions
- [x] Metropolis-Hastings sampler
- [x] ConversionValueModel for conversion + value analysis
- [x] Test infrastructure with Vitest
- [x] TypeScript configuration with strict mode
- [x] Interactive React demo

### 🚧 In Progress
- [ ] High-level ABTest API
- [ ] Basic visualizations (D3/React)
- [ ] WebWorker parallelization setup
- [ ] More diagnostics and user guidance

### 🔮 Future Phases
- [ ] WebGL compute shaders for GPU acceleration
- [ ] NUTS sampler implementation
- [ ] Power analysis tools
- [ ] Interactive node-based model builder
- [ ] More distributions (Poisson, Mixture, etc.)
- [ ] Automatic experiment design optimization
- [ ] Heterogeneous treatment effect discovery (CATE)

## Design Principles

1. **Correctness First**: All operations are differentiable and numerically stable
2. **Developer Experience**: Full TypeScript support with intuitive APIs
3. **Performance When Needed**: Start simple, optimize with GPU when necessary
4. **Diagnostics Built-In**: Every result includes convergence diagnostics
5. **Compositional Models**: Graph-based, node-driven model specification
6. **Tool for Thinking**: Visual, interactive, and exploratory modeling (future)

## Example: Maximum Likelihood Estimation

```typescript
import { normal, RandomVariable } from 'tyche';

// Data
const data = [3.2, 5.1, 4.8, 6.2, 5.5];

// Parameters to estimate
const mu = RandomVariable.parameter(0, 'mu');
const sigma = RandomVariable.parameter(1, 'sigma');

// Negative log likelihood
const dist = normal(mu, sigma);
let nll = RandomVariable.constant(0);
for (const x of data) {
  nll = nll.subtract(dist.logProb(x));
}

// Optimize
for (let i = 0; i < 50; i++) {
  graph.gradientStep(nll.getNode(), 0.01);
}
// mu and sigma converge to MLE estimates
```

## Architecture Notes

### RandomVariable<T>
Tracks computational dependencies for automatic differentiation. Supports operator overloading for natural mathematical syntax:

```typescript
const z = x.multiply(2).add(y.pow(2)).log();
```

### ComputationGraph
Manages the DAG of operations and computes gradients efficiently via reverse-mode AD. Each operation knows how to compute both forward values and backward gradients.

### Distributions
Each distribution implements:
- **Sampling**: Efficient algorithms (Box-Muller for Normal, ratio of Gammas for Beta, etc.)
- **Log probability**: Numerically stable computation with AD support
- **Moments**: Mean, variance, and other properties
- **Gradients**: Full integration with the AD system

Currently implemented:
- **Beta**: Conjugate prior for binomial data
- **Binomial/Bernoulli**: Discrete outcomes modeling
- **Normal/Half-Normal**: Continuous data and scale parameters
- **Gamma, Exponential, LogNormal**: For value modeling and flexible likelihoods

## Next Steps

1. Implement remaining high-level APIs (ABTest, power analysis)
2. Build node-based visual model builder
3. Set up WebWorker infrastructure for parallel chains
4. Create D3/React-based visualizations
5. Add more comprehensive tests and diagnostics

## Future Vision

Tyche aims to be a "tool for thinking"—enabling users to visually construct, explore, and optimize Bayesian models as interactive computation graphs. The goal is to make advanced inference, diagnostics, and experiment design accessible and intuitive for everyone, from business users to statisticians.