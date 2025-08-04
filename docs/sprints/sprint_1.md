# Sprint 1: Math & Basic Analysis (Week 2)

## Sprint Goal

Consolidate all distribution implementations into pure mathematical objects and build the first working analyzer for simple A/B tests. This sprint delivers both the mathematical foundation and basic analysis capabilities.

## Context

- Address technical debt from having 3 different distribution patterns
- Implement both distributions and their posterior classes
- Deliver immediate value with basic A/B test comparison
- All work prepares the foundation for Sprint 2's routing and engine work

---

# Part A: Pure Mathematical Distributions

## Issue 32: Audit existing distribution implementations

**Priority**: P0: Critical  
**Labels**: `sprint-1`, `math`, `foundation`, `investigation`  
**Size**: S (Small)  
**Blocks**: All other Track A work

### Description

Document all existing distribution implementations to plan consolidation strategy. We currently have distributions scattered across 3+ locations with different patterns.

### Acceptance Criteria

- [ ] Document all Beta implementations and their differences
- [ ] Document all LogNormal implementations
- [ ] Document all Normal implementations
- [ ] Document all Gamma implementations
- [ ] Identify shared patterns and differences
- [ ] Create consolidation plan
- [ ] Identify what to keep/merge/discard

### Investigation Areas

```
Locations to check:
- src/core/distributions/ (current "pure" ones?)
- src/inference/posteriors/ (coupled with inference?)
- src/inference/approximate/vi-engine.ts (inline implementations)
- Any other inline implementations

For each distribution, document:
- Methods available (pdf, logPdf, cdf, sample, etc.)
- Dependencies (what else does it import/use?)
- Inference coupling (does it have fit() or data handling?)
- Numerical stability approaches
- Test coverage
```

### Output

Comment on this issue with consolidation plan before starting implementation.

### Files to Review

- `src/core/distributions/*.ts`
- `src/inference/posteriors/*.ts`
- `src/inference/approximate/vi-engine.ts`
- Search for inline implementations

---

## Issue 33: Create pure Distribution interface and base implementations

**Priority**: P0: Critical  
**Labels**: `sprint-1`, `math`, `foundation`  
**Size**: L (Large)  
**Depends on**: Issue A1  
**Blocks**: All inference engine work

### Context

We currently have distribution implementations scattered across three different locations with inconsistent patterns. Some have inference logic mixed with math, some are missing required methods like logPdf (breaking model comparison), and the coupling is blocking clean VI integration.

### What This Consolidation Achieves

Creates canonical distribution implementations as pure mathematical objects. Distributions handle only math (pdf, cdf, sampling), while separate Posterior classes handle the statistical interface. This separation enables clean inference engine architecture and future VI integration.

### Why Separation Matters

Mixing inference logic with mathematical primitives creates coupling that makes the system fragile. Pure distributions can be reused across different inference algorithms, tested independently, and composed cleanly. The roadmap's VI integration depends on this separation.

### Implementation Requirements

- [ ] Pure Distribution interface with complete mathematical methods (pdf, logPdf, cdf, sampling)
- [ ] Canonical implementations: Beta, LogNormal, Normal, Gamma
- [ ] Separate Posterior classes implementing the Posterior interface
- [ ] NO inference logic in distributions (no fit(), no data validation)
- [ ] All methods are pure functions
- [ ] Full compliance with InterfaceStandards.md

### Technical Implementation

```typescript
// From InterfaceStandards.md
interface Distribution {
  // Pure mathematical methods
  pdf(x: number): number;
  logPdf(x: number): number;
  cdf(x: number): number;
  mean(): number;
  variance(): number;
  support(): { min: number; max: number };

  sample(n?: number, rng?: RNG): number;

  // No fit() method - fitting is done by inference engines
}

// Example implementation pattern
class LogNormalDistribution implements Distribution {
  constructor(
    private mu: number,
    private sigma: number
  ) {}

  pdf(x: number): number {
    if (x <= 0) return 0;
    const logX = Math.log(x);
    return (
      Math.exp(-0.5 * ((logX - this.mu) / this.sigma) ** 2) /
      (x * this.sigma * Math.sqrt(2 * Math.PI))
    );
  }

  logPdf(x: number): number {
    if (x <= 0) return -Infinity;
    const logX = Math.log(x);
    return (
      -0.5 * ((logX - this.mu) / this.sigma) ** 2 -
      Math.log(x * this.sigma * Math.sqrt(2 * Math.PI))
    );
  }

  // ... other pure math methods
}

// Posterior implementation
class BetaPosterior implements Posterior {
  constructor(
    private alpha: number,
    private beta: number
  ) {}

  mean(): number[] {
    return [this.alpha / (this.alpha + this.beta)];
  }

  variance(): number[] {
    const n = this.alpha + this.beta;
    return [(this.alpha * this.beta) / (n * n * (n + 1))];
  }

  async sample(n: number = 1): Promise<number[]> {
    // Beta sampling implementation
    // Can use worker for large n
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      samples.push(this.sampleBeta());
    }
    return samples;
  }

  credibleInterval(level: number = 0.95): Array<[number, number]> {
    // Use beta quantile function
    const alpha = (1 - level) / 2;
    return [[this.betaQuantile(alpha), this.betaQuantile(1 - alpha)]];
  }

  logPdf(x: number): number {
    // Log beta PDF for model comparison
    return (
      (this.alpha - 1) * Math.log(x) +
      (this.beta - 1) * Math.log(1 - x) -
      this.logBetaFunction(this.alpha, this.beta)
    );
  }

  private sampleBeta(): number {
    // Implement beta sampling (e.g., using gamma method)
    const g1 = this.sampleGamma(this.alpha);
    const g2 = this.sampleGamma(this.beta);
    return g1 / (g1 + g2);
  }

  // ... other helper methods
}
```

### Migration Notes

- Keep the best math from each existing implementation
- Ensure numerical stability (use log-space where appropriate)
- Remove all inference-related code
- Remove all data validation/parsing
- Posteriors are separate classes, not mixed with distributions

### Files to Create/Modify

- `src/core/distributions/Distribution.ts` (interface)
- `src/core/distributions/Beta.ts`
- `src/core/distributions/LogNormal.ts`
- `src/core/distributions/Normal.ts`
- `src/core/distributions/Gamma.ts`
- `src/statistical/posteriors/BetaPosterior.ts`
- `src/statistical/posteriors/LogNormalPosterior.ts`
- `src/statistical/posteriors/NormalPosterior.ts`
- `src/statistical/posteriors/GammaPosterior.ts`
- `src/tests/distributions/*.test.ts`
- `src/tests/posteriors/*.test.ts`

---

## Issue 34: Add missing distribution methods

**Priority**: P1: High  
**Labels**: `sprint-1`, `math`, `enhancement`  
**Size**: M (Medium)  
**Depends on**: Issue A2

### Description

Some posteriors are missing logPdf which breaks model comparison. Ensure all distributions have complete interfaces.

### Acceptance Criteria

- [ ] Every distribution has logPdf implemented
- [ ] Add quantile methods where missing
- [ ] Add support() method returning valid range
- [ ] Add mode() for all distributions
- [ ] Ensure numerical stability:
  - Use log-space computations where appropriate
  - Handle edge cases (0, negative, infinity)
  - Avoid numerical overflow/underflow
- [ ] Comprehensive tests for edge cases

### Technical Notes

```typescript
// Numerical stability example
logPdf(x: number): number {
  // BAD: Math.log(this.pdf(x)) - loses precision

  // GOOD: Direct log-space computation
  if (x <= 0) return -Infinity;
  // ... compute in log space
}

// Edge case handling
support(): { min: number; max: number } {
  // Beta: [0, 1]
  // LogNormal: (0, ∞)
  // Normal: (-∞, ∞)
  // Gamma: (0, ∞)
}
```

### Files to Modify

- All distribution files from Issue A2
- Add comprehensive edge case tests

---

# Part B: Basic A/B Test Analysis

## Issue 35: Implement VariantResult and ExperimentResult

**Priority**: P0: Critical  
**Labels**: `sprint-1`, `analysis`, `results`  
**Size**: L (Large)  
**Depends on**: Sprint 0 completion (StandardData, ExperimentData)  
**Blocks**: All analyzer work

### Context

The current approach requires users to know upfront what type of analysis they want to run. This breaks the vision of progressive disclosure where simple cases stay simple but complex analyses become available as needed.

### What "Fit Once, Analyze Many Ways" Enables

After fitting a model once, users can explore different aspects without refitting: basic summaries, effect decomposition (if compound), mixture components (if multimodal), segment analysis, etc. The result object reveals capabilities dynamically based on what was actually fitted.

### Why Runtime Capability Detection

We can't know at analysis time whether data will require compound models or mixtures. VariantResult.getDecomposition() returns null for simple models but rich decomposition for compound models. This lets the UI progressively reveal features without breaking simple workflows.

### Implementation Requirements

- [ ] VariantResult with runtime capability detection (getDecomposition(), getComponents())
- [ ] ExperimentResult managing multiple variants
- [ ] Methods return null for unsupported capabilities (not errors)
- [ ] Rich metadata tracking (algorithm, timing, convergence)
- [ ] JSON serialization for sharing results
- [ ] User-friendly summary methods
- [ ] Progressive disclosure through capability detection

### Technical Implementation

```typescript
// From InterfaceStandards.md (simplified for Phase 1)
class VariantResult extends AnalysisResult {
  constructor(
    private posterior: Posterior,
    metadata: ResultMetadata
  ) {
    super(metadata);
  }

  getPosterior(): Posterior {
    return this.posterior;
  }

  // Phase 1: These return null (no compound models yet)
  getDecomposition(): EffectDecomposition | null {
    return null; // Phase 2 will add compound support
  }

  getComponents(): ComponentInfo[] | null {
    return null; // Phase 2 will add mixture support
  }

  summary(): VariantSummary {
    return {
      mean: this.posterior.mean(),
      credibleInterval: this.posterior.credibleInterval(),
      sampleSize: this.metadata.sampleSize,
    };
  }
}

class ExperimentResult extends AnalysisResult {
  constructor(
    private variants: Map<string, VariantResult>,
    metadata: ResultMetadata
  ) {
    super(metadata);
  }

  getVariantResult(name: string): VariantResult | undefined {
    return this.variants.get(name);
  }

  // Phase 1: Simple comparison only
  async compareVariants(): Promise<Comparison> {
    // Just control vs treatment lift for now
  }

  // Phase 3 feature
  async discoverSegments(): Promise<HTEResult> {
    throw new Error('Segment discovery not yet implemented');
  }
}
```

### Files to Create

- `src/domain/results/AnalysisResult.ts` (base class)
- `src/domain/results/VariantResult.ts`
- `src/domain/results/ExperimentResult.ts`
- `src/domain/results/types.ts` (interfaces)
- `src/tests/results/*.test.ts`

---

## Issue 36: Create simple ConversionAnalyzer

**Priority**: P0: Critical  
**Labels**: `sprint-1`, `analysis`, `analyzer`  
**Size**: M (Medium)  
**Depends on**: Issue B1  
**Blocks**: Sprint 2 analyzer work

### Description

Implement the simplest possible analyzer for conversion rate comparison using Beta-Binomial conjugate updates.

### Acceptance Criteria

- [ ] ConversionAnalyzer implements ExperimentAnalyzer interface
- [ ] Handles binomial data only (throws clear error for other types)
- [ ] Uses hardcoded Beta-Binomial conjugate updates
- [ ] Returns proper ExperimentResult structure
- [ ] Calculates lift with credible intervals
- [ ] Performance under 10ms for typical data
- [ ] Clear error messages for invalid data

### Technical Implementation

```typescript
class ConversionAnalyzer implements ExperimentAnalyzer {
  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    // Validate all variants have binomial data
    this.validateBinomialData(data);

    // For now: hardcoded Beta(1,1) prior
    const prior = { alpha: 1, beta: 1 };

    // Analyze each variant
    const variantResults = new Map<string, VariantResult>();

    // Control
    const controlData = data.variants.control.binary!;
    const controlPosterior = this.conjugateUpdate(prior, controlData);
    variantResults.set(
      'control',
      new VariantResult(controlPosterior, {
        algorithm: 'conjugate',
        sampleSize: controlData.trials,
      })
    );

    // Treatments
    for (const [name, variant] of data.variants.treatments) {
      const variantData = variant.binary!;
      const posterior = this.conjugateUpdate(prior, variantData);
      variantResults.set(
        name,
        new VariantResult(posterior, { algorithm: 'conjugate', sampleSize: variantData.trials })
      );
    }

    return new ExperimentResult(variantResults, {
      experimentId: data.id,
      totalSamples: this.calculateTotalSamples(data),
    });
  }

  private conjugateUpdate(prior: { alpha: number; beta: number }, data: BinomialData): Posterior {
    // Beta-Binomial conjugate update
    const posteriorAlpha = prior.alpha + data.successes;
    const posteriorBeta = prior.beta + (data.trials - data.successes);

    // Use BetaPosterior from Part A
    return new BetaPosterior(posteriorAlpha, posteriorBeta);
  }

  // Lift calculation from roadmap
  private async calculateLift(control: Posterior, treatment: Posterior): Promise<LiftEstimate> {
    // Monte Carlo estimation
    const samples = 10000;
    const controlSamples = await control.sample(samples);
    const treatmentSamples = await treatment.sample(samples);

    // Calculate lifts
    const absoluteLifts = treatmentSamples.map((t, i) => t - controlSamples[i]);
    const relativeLifts = treatmentSamples.map((t, i) =>
      controlSamples[i] > 0 ? (t - controlSamples[i]) / controlSamples[i] : 0
    );

    return {
      absolute: {
        mean: mean(absoluteLifts),
        ci95: quantiles(absoluteLifts, [0.025, 0.975]),
      },
      relative: {
        mean: mean(relativeLifts),
        ci95: quantiles(relativeLifts, [0.025, 0.975]),
      },
      probPositive: mean(absoluteLifts.map((l) => l > 0)),
    };
  }
}

// Helper functions (would be imported from utils)
function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function quantiles(values: number[], probs: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return probs.map((p) => {
    const index = Math.floor(p * (sorted.length - 1));
    return sorted[index];
  });
}
```

### Notes

- This is intentionally simple - no routing, no model selection
- Sprint 2 will generalize this pattern
- Hardcoded prior is fine for Phase 1

### Files to Create

- `src/domain/analyzers/ConversionAnalyzer.ts`
- `src/domain/analyzers/types.ts` (ExperimentAnalyzer interface)
- `src/tests/analyzers/conversion.test.ts`

---

## Sprint Success Criteria

- [ ] All distribution math consolidated into single location
- [ ] No inference logic in distribution classes
- [ ] All distributions have complete interfaces including logPdf
- [ ] Posterior classes implemented for each distribution type
- [ ] Numerical stability improved with proper edge case handling
- [ ] Basic A/B test works end-to-end using BetaPosterior
- [ ] Can compare conversion rates between variants
- [ ] Lift calculation with credible intervals via Monte Carlo
- [ ] Result objects support future capabilities (getDecomposition, getComponents return null for now)
- [ ] Under 10ms performance for typical tests
- [ ] All tests passing

## Next Sprint Preview

Sprint 2 will build on this foundation:

- ModelRouter using quality indicators + capabilities
- InferenceEngine base class with multiple implementations
- Generalize ConversionAnalyzer pattern to other metrics
- Connect pure distributions to inference engines through standardized pattern
