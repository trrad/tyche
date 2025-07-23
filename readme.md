# Tyche

A browser-based Bayesian inference engine for A/B testing and business experimentation.

## Current State

**What exists:**
- Monolithic `vi-engine.ts` containing Beta-Binomial, Normal Mixture EM, and Zero-Inflated LogNormal inference
- Working `ConversionValueModelVI.ts` that uses the VI engine
- Solid VI framework with numerical stability (keeping this!)
- Basic test coverage for the VI engine
- Outdated `ConversionValueModel.ts` using computation graph approach (to be deleted)

**Architecture issues:**
- All inference logic crammed into one 1000+ line file
- No clear separation between distributions, inference algorithms, and posteriors
- Mixed responsibilities throughout

## Desired State

**Clean modular architecture:**
```
src/
├── core/               # Statistical primitives
│   ├── distributions/  # Probability distributions
│   ├── posteriors/     # Posterior distribution interfaces
│   └── utils/          # Numerical stability utilities
├── inference/          # Inference algorithms
│   ├── exact/          # Conjugate & closed-form
│   └── approximate/    # VI & EM algorithms
├── models/             # Business-level models
├── analysis/           # Power analysis & decisions
├── ui/                 # Visual interface layer
│   ├── components/     # React components
│   └── visualizations/ # D3/Plot components
└── optimizers/         # Optimization algorithms
```

**Key principles:**
- Single responsibility per file
- Clear interfaces between layers
- Extensible for new distributions/algorithms
- Browser-first performance

## Development Status

### ✅ Phase 1: Core Inference (Weeks 1-3)
- [ ] Extract and refactor existing distributions
- [ ] Implement Normal, Gamma, Exponential, LogNormal, Negative Binomial
- [ ] Extract LogNormal from ZILN, remove zero-inflation wrapper
- [ ] Keep VI framework infrastructure (valuable numerical work)
- [ ] Clean up monolithic vi-engine.ts
- [ ] Implement synthetic data generators
- [ ] Comprehensive test suite

### 📅 Phase 2: Visual Interface & Power (Weeks 4-8)
- [ ] Visual model builder with drag-drop
- [ ] Prior elicitation UI
- [ ] Power analysis with importance sampling
- [ ] Web Worker parallelization
- [ ] Experiment metadata layer

### 📅 Phase 3: Decisions & HTE (Weeks 9-16)
- [ ] Decision framework with loss integration
- [ ] Hypothesis-driven causal trees
- [ ] Manual segmentation UI
- [ ] Segment-specific power analysis

### 📅 Phase 4: Natural Language (Weeks 17-20)
- [ ] Plain English insights
- [ ] Automated recommendations
- [ ] Advanced visualizations
- [ ] Platform integrations

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run development build
npm run dev

# Run specific demo
DEMO=combined npm run dev
```

## Architecture Decisions

1. **Compound models over zero-inflation**: Clearer business insights by separating frequency × severity
2. **Conjugate-first inference**: Use exact math when possible, approximate only when necessary  
3. **Keep VI framework**: Valuable numerical stability work for future GPU acceleration
4. **Browser-native**: No server dependencies, runs entirely client-side
5. **TypeScript throughout**: Full type safety for statistical operations

## Not Building

- General-purpose PPL (focused on business experiments)
- MCMC samplers (too slow for browser)
- Server-side components (browser-native only)
- Complex hierarchical models (beyond scope)
- Black-box deep learning approaches (interpretability first)
- Real-time personalization/bandits (different problem)
- Micro-segment targeting (stable insights instead)
- 2000-tree random forests (constrained trees only)

## Contributing

See individual directory READMEs for specific guidelines on working with each module.