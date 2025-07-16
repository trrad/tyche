# Tyche (τύχη)

*Greek goddess of fortune, chance, and probability*

A TypeScript library for Bayesian inference and experimental design, running entirely in the browser with automatic differentiation and GPU acceleration (coming soon).

## Core Features

- 🎯 **Experimental Design Focus**: Built specifically for A/B testing, power analysis, and business experiments
- 🧮 **Automatic Differentiation**: Reverse-mode AD for gradient-based inference
- 🚀 **Browser-Native**: Zero installation, instant startup
- 📊 **Progressive Disclosure**: Simple API for beginners, full control for experts
- 🔬 **Rigorous**: Diagnostics and best practices built in from the start

## Project Structure

```
src/
├── core/
│   ├── RandomVariable.ts      # Core abstraction with AD
│   ├── ComputationGraph.ts    # Automatic differentiation engine
│   └── distributions/
│       ├── index.ts          # Distribution exports
│       ├── Beta.ts           # Beta distribution
│       ├── Binomial.ts       # Binomial/Bernoulli distributions
│       └── Normal.ts         # Normal/Half-Normal distributions
├── samplers/
│   └── Metropolis.ts         # Metropolis-Hastings sampler
├── api/
│   └── (coming) ABTest.ts    # High-level API for A/B tests
└── index.ts                  # Main exports

tests/
├── RandomVariable.test.ts     # AD system tests
└── distributions.test.ts      # Distribution tests

examples/
└── basic-examples.ts         # Usage examples
```

## Quick Start

```typescript
import { beta, binomial, normal } from 'tyche';

// A/B test with Beta-Binomial model
const prior = beta(1, 1);  // Uniform prior
const posterior = beta(1 + 45, 1 + 455);  // After 45/500 conversions

// Parameter estimation with Normal distribution
const mu = RandomVariable.parameter(0, 'mu');
const sigma = RandomVariable.parameter(1, 'sigma');
const likelihood = normal(mu, sigma);

// Gradient-based optimization
const nll = data.map(x => likelihood.logProb(x)).reduce((a, b) => a.add(b));
graph.gradientStep(nll.getNode(), learningRate);
```

## Development Status

### ✅ Phase 1 Core (Complete)
- [x] RandomVariable abstraction with operator overloading
- [x] Automatic differentiation (forward & reverse mode)
- [x] Beta distribution implementation
- [x] Binomial distribution (includes Bernoulli)
- [x] Normal distribution (includes Half-Normal)
- [x] Basic Metropolis-Hastings sampler
- [x] Test infrastructure with Vitest
- [x] TypeScript configuration with strict mode
- [x] Comprehensive examples

### 🚧 Phase 1 Remaining
- [ ] High-level ABTest API
- [ ] Basic visualizations
- [ ] WebWorker parallelization setup
- [ ] Gamma/Poisson distributions (for revenue models)

### 🔮 Future Phases
- [ ] WebGL compute shaders for GPU acceleration
- [ ] NUTS sampler implementation
- [ ] Power analysis tools
- [ ] Interactive visualization framework
- [ ] More distributions (Gamma, Poisson, etc.)

## Design Principles

1. **Correctness First**: All operations are differentiable and numerically stable
2. **Developer Experience**: Full TypeScript support with intuitive APIs
3. **Performance When Needed**: Start simple, optimize with GPU when necessary
4. **Diagnostics Built-In**: Every result includes convergence diagnostics

## Getting Started

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with UI
npm run test:ui

# Build
npm run build

# Type checking
npm run type-check
```

## Example: Gradient Descent

```typescript
import { RandomVariable, ComputationGraph } from 'tyche';

// Create a simple quadratic loss: (x - 3)²
const x = RandomVariable.parameter(0, 'x');
const loss = x.subtract(3).pow(2);

// Optimize using gradient descent
const graph = ComputationGraph.current();
for (let i = 0; i < 20; i++) {
  console.log(`x = ${x.forward()}, loss = ${loss.forward()}`);
  graph.gradientStep(loss.getNode(), 0.1);  // learning rate = 0.1
}
// x converges to 3
```

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
The core abstraction that tracks computational dependencies for automatic differentiation. Supports operator overloading for natural mathematical syntax:

```typescript
const z = x.multiply(2).add(y.pow(2)).log();
```

### ComputationGraph
Manages the DAG of operations and computes gradients efficiently via reverse-mode AD. Each operation knows how to compute both forward values and backward gradients.

### Distributions
Each distribution implements:
- **Sampling**: Efficient algorithms (Box-Muller for Normal, ratio of Gammas for Beta)
- **Log probability**: Numerically stable computation with AD support
- **Moments**: Mean, variance, and other properties
- **Gradients**: Full integration with the AD system

Currently implemented:
- **Beta**: Conjugate prior for binomial data
- **Binomial/Bernoulli**: Discrete outcomes modeling
- **Normal/Half-Normal**: Continuous data and scale parameters

## Next Steps

1. Implement remaining distributions (Binomial, Normal)
2. Build high-level ABTest API wrapper
3. Set up WebWorker infrastructure for parallel chains
4. Create basic D3-based visualizations
5. Add more comprehensive tests

## Contributing

The project is in early development. Key areas where help is needed:

- Distribution implementations
- Numerical stability improvements
- WebGL compute shader expertise
- API design feedback
- Testing and benchmarking

## License

MIT