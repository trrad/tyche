# docs/phase-1-context.md

# Phase 1: Statistical Layer Context

## Phase Goal

Standardize the statistical machinery - inference engines, data validation, and result objects. This creates the statistical "backend" that business logic will orchestrate.

## Key Architectural Decisions

### Inference Engines (1.1, 1.1b)

- **Pattern**: All engines extend InferenceEngine base class
- **Why**: Enables capability-based routing from Phase 0
- **Key method**: `canHandle()` declares what each engine can do
- **Migration order**: Beta → LogNormal → Normal → Mixtures (revenue-critical first)

### Naming Convention (1.1b)

- **Pattern**: XYConjugate for all conjugate engines
- **Current**: LogNormalBayesian → LogNormalConjugate
- **Current**: NormalNormal → NormalConjugate
- **Why**: Consistency and clarity

### Mixture Models (1.1c)

- **Pattern**: Full VBEM with Dirichlet priors on weights
- **Why**: Proper uncertainty quantification (not just point estimates)
- **Trade-off**: More complex but maintains Bayesian principles
- **Key change**: `weight = Nj/n` → `alpha[j] = alpha_prior[j] + Nj`

### Data Validation (1.2)

- **Pattern**: Use TycheError from Phase 0
- **Why**: Consistent error handling throughout
- **Key validations**: Sample size (n≥30), control exists, treatments exist

### Result Objects (1.3)

- **Pattern**: Abstract AnalysisResult base class
- **Why**: Consistent interface for all results
- **Extensibility**: Metadata can have arbitrary fields

## Common Pitfalls

1. **Don't mix inference with distributions** - Engines use distributions, not extend them
2. **Don't forget capabilities** - Every engine must declare what it can handle
3. **Don't use point estimates in mixtures** - Maintain uncertainty over weights
4. **Don't skip validation** - Better to fail early with clear error

## Testing Strategy

- Test each engine's `canHandle()` method thoroughly
- Verify conjugate updates with known results
- Test VBEM convergence and weight uncertainty
- Validate error messages are helpful

## Dependencies

- Depends on Phase 0: Uses TycheError, StandardData, pure distributions
- Provides to Phase 2: Inference engines, result base classes

## Code Locations

- `/inference/engines/` - Existing engines to migrate
- `BetaBinomialConjugate` - Already close to pattern
- `LogNormalBayesian` - Needs renaming
- `*MixtureEM.ts` - Need VBEM upgrade

## Success Metrics

- [ ] All engines extend InferenceEngine
- [ ] Consistent XYConjugate naming
- [ ] Mixture models track weight uncertainty
- [ ] Data validation with helpful errors
- [ ] Result objects with metadata
