# Sprint 3: Business Analysis Layer (Week 4)

## Sprint Goal

Add business-focused analysis capabilities including revenue experiments, compound models, and the beginnings of the fluent API. This sprint delivers the core value proposition: understanding business metrics beyond simple conversion rates.

## Context

- We now have working routing and basic inference engines
- Time to add compound models for zero-inflated data
- Revenue = Conversion × Value decomposition
- Start building toward the natural API users will love

## Dependencies

- ✅ Sprint 0: Data structures
- ✅ Sprint 1: Distributions and result objects
- ✅ Sprint 2: Routing and inference engines

---

## Issue 45: Implement CompoundPosterior

**Priority**: P0: Critical  
**Labels**: `sprint-3`, `compound`, `models`  
**Size**: M (Medium)  
**Blocks**: CompoundInferenceEngine, RevenueAnalyzer

### Context

Business metrics like revenue are fundamentally zero-inflated: most users don't convert, but those who do have a separate value distribution. Analyzing this as a single distribution loses the crucial decomposition into "how many convert" vs "how much they spend."

### What This Enables

CompoundPosterior represents the joint distribution of frequency × severity, enabling revenue analysis that can decompose effects. When a treatment increases revenue, we can separate whether it's because more people convert, or because converters spend more, or both.

### Key Behavior

Unlike simple posteriors, CompoundPosterior.sample() returns samples from the joint distribution (revenue per user), while still providing access to the underlying frequency and severity components. This preserves the business interpretation while enabling full distributional analysis.

### Implementation Requirements

- [ ] Implements Posterior interface from InterfaceStandards.md
- [ ] Combines frequency (Beta) and severity posteriors
- [ ] sample() returns joint distribution samples (frequency × severity)
- [ ] mean() returns E[frequency × severity], not components
- [ ] Independence assumption for now
- [ ] getSeverityComponents() for mixture support
- [ ] Async sampling and Monte Carlo credible intervals
- [ ] logPdf() for compound distribution

### Technical Implementation

```typescript
// From InterfaceStandards.md
interface CompoundPosterior extends Posterior {
  frequency: Posterior; // Beta posterior for conversion
  severity: Posterior; // Value distribution posterior (when converted)

  // The key behavior: sample() returns samples from the joint distribution
  sample(n?: number): Promise<number[]>; // Returns revenue per user

  // mean() returns E[frequency × severity]
  mean(): number[]; // Combined effect

  // Optional method to get severity components if it's a mixture
  getSeverityComponents?(): Array<{
    mean: number;
    variance: number;
    weight: number;
  }> | null;
}

class CompoundPosteriorImpl implements CompoundPosterior {
  constructor(
    public readonly frequency: Posterior,
    public readonly severity: Posterior
  ) {}

  async sample(n: number = 1): Promise<number[]> {
    // Sample from joint distribution
    const freqSamples = await this.frequency.sample(n);
    const severitySamples = await this.severity.sample(n);

    // Revenue = frequency × severity (independence assumption)
    return freqSamples.map((f, i) => f * severitySamples[i]);
  }

  mean(): number[] {
    // E[X × Y] = E[X] × E[Y] under independence
    const freqMean = this.frequency.mean()[0];
    const severityMeans = this.severity.mean();
    return severityMeans.map((s) => freqMean * s);
  }

  variance(): number[] {
    // Var(XY) = E[X]²Var(Y) + E[Y]²Var(X) + Var(X)Var(Y)
    // Under independence assumption
    const fx = this.frequency.mean()[0];
    const vx = this.frequency.variance()[0];
    const fy = this.severity.mean();
    const vy = this.severity.variance();

    return fy.map((meanY, i) => {
      const varY = vy[i];
      return fx * fx * varY + meanY * meanY * vx + vx * varY;
    });
  }

  async credibleInterval(level: number = 0.95): Promise<Array<[number, number]>> {
    // Use Monte Carlo for accurate intervals
    const samples = await this.sample(10000);
    const sorted = samples.sort((a, b) => a - b);

    const alpha = (1 - level) / 2;
    const lowerIndex = Math.floor(alpha * samples.length);
    const upperIndex = Math.floor((1 - alpha) * samples.length);

    return [[sorted[lowerIndex], sorted[upperIndex]]];
  }

  logPdf(x: number): number {
    // For compound distribution with Beta frequency:
    // P(X = 0) = P(not converted) = 1 - E[frequency]
    // P(X = x | x > 0) = P(converted) × P(severity = x)

    if (x === 0) {
      // Probability of zero is 1 - conversion rate
      const conversionRate = this.frequency.mean()[0];
      return Math.log(1 - conversionRate);
    } else if (x > 0) {
      // Probability is conversion rate × severity PDF
      const conversionRate = this.frequency.mean()[0];
      const severityLogPdf = this.severity.logPdf(x);
      return Math.log(conversionRate) + severityLogPdf;
    } else {
      return -Infinity; // Negative values impossible
    }
  }

  getSeverityComponents?(): Array<{
    mean: number;
    variance: number;
    weight: number;
  }> | null {
    // If severity is a mixture, return its components
    if ('getComponents' in this.severity && typeof this.severity.getComponents === 'function') {
      return this.severity.getComponents();
    }
    return null;
  }
}
```

### Files to Create

- `src/statistical/posteriors/CompoundPosterior.ts`
- `src/tests/posteriors/compound.test.ts`

---

## Issue 46: Create CompoundInferenceEngine

**Priority**: P0: Critical  
**Labels**: `sprint-3`, `inference`, `engine`, `compound`  
**Size**: L (Large)  
**Depends on**: Issue 1

### Context

Zero-inflated data requires fitting two separate models: frequency (who converts) and severity (how much they spend when they do). The challenge is orchestrating this correctly - splitting the data, routing each part to appropriate engines, then combining the results.

### What This Orchestrates

CompoundInferenceEngine splits user-level data into conversion events (for frequency model) and positive values (for severity model), fits each using existing engines, then combines into a CompoundPosterior. This reuses all existing inference logic rather than reimplementing it.

### Why This Design

Rather than creating monolithic compound engines, this delegates to existing engines and focuses on the orchestration logic. The frequency model always uses Beta-Binomial, while the severity model routes normally (lognormal, gamma, etc.) based on the data characteristics.

### Implementation Requirements

- [ ] Extends InferenceEngine abstract class
- [ ] Handles compound model structure declarations
- [ ] Splits data and routes to sub-engines for frequency/severity
- [ ] Supports all severity types (lognormal, gamma, normal)
- [ ] Returns CompoundPosterior from constituent parts
- [ ] Proper data splitting (zeros vs non-zeros)

### Technical Implementation

```typescript
class CompoundInferenceEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['compound'] as ModelStructure[],
    types: [] as ModelType[], // Compound is structure, not type
    dataTypes: ['user-level'] as DataType[],
    components: 'any' as const, // Depends on sub-engines
    exact: false, // Depends on sub-engines
    fast: true,
    stable: true,
  };

  readonly algorithm = 'compound' as const;

  // Need access to other engines
  constructor(private engines: InferenceEngine[]) {
    super();
  }

  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    if (config.structure !== 'compound') {
      throw new TycheError(
        ErrorCode.MODEL_MISMATCH,
        'CompoundInferenceEngine requires compound structure'
      );
    }

    // Split data
    const { frequencyData, severityData } = this.splitData(data);

    // Fit frequency model (always Beta)
    const freqConfig: ModelConfig = {
      structure: 'simple',
      type: 'beta',
    };
    const freqEngine = this.findEngine(freqConfig, frequencyData);
    const freqResult = await freqEngine.fit(frequencyData, freqConfig, options);

    // Fit severity model (positive values only)
    const severityConfig: ModelConfig = {
      structure: 'simple',
      type: config.valueType,
      components: config.valueComponents || 1,
    };
    const severityEngine = this.findEngine(severityConfig, severityData);
    const severityResult = await severityEngine.fit(severityData, severityConfig, options);

    // Combine into compound posterior
    const posterior = new CompoundPosteriorImpl(freqResult.posterior, severityResult.posterior);

    return {
      posterior,
      diagnostics: {
        converged: freqResult.diagnostics.converged && severityResult.diagnostics.converged,
        logLikelihood: undefined, // Complex for compound
      },
      metadata: {
        algorithm: 'compound',
        computeTime: freqResult.metadata.computeTime + severityResult.metadata.computeTime,
        subModels: {
          frequency: freqResult,
          severity: severityResult,
        },
      },
    };
  }

  private splitData(data: StandardData): {
    frequencyData: StandardData;
    severityData: StandardData;
  } {
    const users = data.userLevel!.users;

    // Frequency: binomial data (converted or not)
    const conversions = users.filter((u) => u.converted).length;
    const frequencyData: StandardData = {
      type: 'binomial',
      n: users.length,
      binomial: {
        successes: conversions,
        trials: users.length,
      },
      quality: {
        hasZeros: false,
        hasNegatives: false,
        hasOutliers: false,
        missingData: 0,
      },
    };

    // Severity: positive values only
    const positiveUsers = users.filter((u) => u.converted && u.value > 0);
    const severityData: StandardData = {
      type: 'user-level',
      n: positiveUsers.length,
      userLevel: {
        users: positiveUsers,
      },
      quality: {
        hasZeros: false, // Filtered out
        hasNegatives: data.quality.hasNegatives,
        hasOutliers: data.quality.hasOutliers,
        missingData: 0,
      },
    };

    return { frequencyData, severityData };
  }
}
```

### Files to Create

- `src/statistical/engines/CompoundInferenceEngine.ts`
- `src/tests/engines/compound.test.ts`

---

## Issue 47: Implement RevenueAnalyzer

**Priority**: P0: Critical  
**Labels**: `sprint-3`, `analyzer`, `business`  
**Size**: L (Large)  
**Depends on**: Issue 1, Issue 2

### Description

Create the flagship analyzer for revenue experiments that automatically handles zero-inflation and provides conversion × value decomposition.

### Acceptance Criteria

- [ ] Implements ExperimentAnalyzer interface
- [ ] Automatically detects need for compound models
- [ ] Provides effect decomposition (frequency vs severity)
- [ ] Handles both simple and compound cases
- [ ] Routes once on combined data for consistency
- [ ] Returns rich ExperimentResult
- [ ] Clear business interpretation in results
- [ ] Supports prior configuration

### Technical Implementation

```typescript
class RevenueAnalyzer implements ExperimentAnalyzer {
  private priors?: Record<string, Distribution>;
  private minimumPracticalEffect?: Record<string, number>;

  configure(options: {
    priors?: Record<string, Distribution>;
    minimumPracticalEffect?: Record<string, number>;
  }): void {
    this.priors = options.priors;
    this.minimumPracticalEffect = options.minimumPracticalEffect;
  }

  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    // Combine all variant data for routing decision
    const allUsers = this.combineAllUsers(data);
    const combinedData = this.toStandardData(allUsers);

    // Route once on combined data
    const { config, engine } = await ModelRouter.route(combinedData);

    // Fit each variant with same config
    const variantResults = new Map<string, VariantResult>();

    for (const [name, variant] of this.getAllVariants(data)) {
      const variantData = this.toStandardData(variant);
      const result = await engine.fit(variantData, config, {
        prior: this.priors?.[config.type || 'default'],
      });

      variantResults.set(
        name,
        new VariantResult(result.posterior, {
          ...result.metadata,
          sampleSize: variant.n,
          modelStructure: config.structure,
        })
      );
    }

    return new ExperimentResult(variantResults, {
      experimentId: data.id,
      modelConfig: config,
      totalSamples: this.calculateTotalSamples(data),
      analyzer: 'revenue',
    });
  }

  private toStandardData(data: VariantData | UserLevelData[]): StandardData {
    let users: UserLevelData[];

    if (Array.isArray(data)) {
      users = data;
    } else {
      if (!data.users) {
        throw new TycheError(ErrorCode.INVALID_DATA, 'RevenueAnalyzer requires user-level data');
      }
      users = data.users;
    }

    const values = users.map((u) => u.value);
    const quality = {
      hasZeros: values.some((v) => v === 0),
      hasNegatives: values.some((v) => v < 0),
      hasOutliers: this.detectOutliers(values),
      missingData: users.filter((u) => u.value == null).length,
    };

    return {
      type: 'user-level',
      n: users.length,
      userLevel: { users },
      quality,
    };
  }
}

// Usage will show decomposition when compound model used
const result = await revenueAnalyzer.analyze(data);
const control = result.getVariantResult('control');

if (control?.getDecomposition()) {
  // Compound model was used
  const decomp = control.getDecomposition();
  console.log(`Conversion effect: ${decomp.frequency.effect}`);
  console.log(`Value effect: ${decomp.value.effect}`);
  console.log(`Combined effect: ${decomp.combined.effect}`);
}
```

### Files to Create

- `src/domain/analyzers/RevenueAnalyzer.ts`
- `src/tests/analyzers/revenue.test.ts`

---

## Issue 48: Add EffectDecomposition to VariantResult

**Priority**: P1: High  
**Labels**: `sprint-3`, `results`, `enhancement`  
**Size**: M (Medium)  
**Depends on**: Issue 1

### Description

Update VariantResult to properly handle compound posteriors and return effect decomposition when available.

### Acceptance Criteria

- [ ] getDecomposition() returns data for compound posteriors
- [ ] Returns null for simple posteriors
- [ ] Calculates frequency, value, and combined effects
- [ ] Includes uncertainty bounds for each component
- [ ] Runtime detection of CompoundPosterior
- [ ] Update tests to verify behavior
- [ ] Add getComponents() for mixture models

### Technical Implementation

```typescript
class VariantResult extends AnalysisResult {
  getDecomposition(): EffectDecomposition | null {
    if (!this.isCompoundPosterior(this.posterior)) {
      return null;
    }

    const compound = this.posterior as CompoundPosterior;

    return {
      frequency: {
        effect: compound.frequency.mean()[0],
        ci95: compound.frequency.credibleInterval(0.95)[0],
        posterior: compound.frequency, // Optional
      },
      value: {
        effect: compound.severity.mean()[0],
        ci95: compound.severity.credibleInterval(0.95)[0],
        posterior: compound.severity, // Optional
      },
      combined: {
        effect: compound.mean()[0],
        ci95: this.computeCombinedCI(compound),
      },
    };
  }

  getComponents(): ComponentInfo[] | null {
    // For simple posteriors with mixture components
    if ('getComponents' in this.posterior && typeof this.posterior.getComponents === 'function') {
      return this.posterior.getComponents();
    }

    // For compound posteriors, check severity distribution
    if (this.isCompoundPosterior(this.posterior)) {
      const compound = this.posterior as CompoundPosterior;
      if (compound.getSeverityComponents) {
        return compound.getSeverityComponents();
      }
    }

    return null;
  }

  private isCompoundPosterior(posterior: Posterior): posterior is CompoundPosterior {
    return 'frequency' in posterior && 'severity' in posterior;
  }

  private async computeCombinedCI(compound: CompoundPosterior): Promise<[number, number]> {
    // Use the compound's own credibleInterval method
    const intervals = await compound.credibleInterval(0.95);
    return intervals[0];
  }
}
```

### Files to Modify

- `src/domain/results/VariantResult.ts`
- `src/tests/results/variant-result.test.ts`

---

## Issue 49: Start fluent API design

**Priority**: P2: Medium  
**Labels**: `sprint-3`, `api`, `design`  
**Size**: M (Medium)

### Description

Begin implementing the fluent API pattern shown in the docs. Start with basic structure, full implementation in later sprints.

### Acceptance Criteria

- [ ] Create Tyche root object with experiment() method
- [ ] Basic ExperimentBuilder with metric()
- [ ] withControl() and withTreatment() for data
- [ ] analyze() method that routes to appropriate analyzer
- [ ] Type-safe throughout
- [ ] Tests demonstrating usage

### Technical Implementation

```typescript
// Root API object
class Tyche {
  experiment(data: any): ExperimentBuilder {
    return new ExperimentBuilder(data);
  }
}

class ExperimentBuilder {
  private data: Partial<ExperimentData> = {};
  private config: BuilderConfig = {};

  constructor(initialData?: any) {
    if (initialData) {
      // Data should already be in ExperimentData format
      this.data = initialData;
    }
  }

  forMetric(metric: 'conversion' | 'revenue' | 'retention'): this {
    this.config.metric = metric;
    return this;
  }

  withControl(data: VariantData): this {
    this.data.variants = this.data.variants || {};
    this.data.variants.control = data;
    return this;
  }

  withTreatment(nameOrData: string | VariantData, data?: VariantData): this {
    this.data.variants = this.data.variants || {};
    this.data.variants.treatments = this.data.variants.treatments || new Map();

    if (typeof nameOrData === 'string') {
      this.data.variants.treatments.set(nameOrData, data!);
    } else {
      this.data.variants.treatments.set('treatment', nameOrData);
    }
    return this;
  }

  async analyze(): Promise<ExperimentResult> {
    // Select analyzer based on metric
    const analyzer = this.selectAnalyzer();

    // Validate and build ExperimentData
    const experimentData = this.buildExperimentData();

    return analyzer.analyze(experimentData);
  }

  private selectAnalyzer(): ExperimentAnalyzer {
    switch (this.config.metric) {
      case 'conversion':
        return new ConversionAnalyzer();
      case 'revenue':
        return new RevenueAnalyzer();
      default:
        throw new Error(`Unknown metric: ${this.config.metric}`);
    }
  }

  private buildExperimentData(): ExperimentData {
    if (!this.data.variants?.control) {
      throw new Error('Control variant required');
    }

    if (!this.data.variants.treatments || this.data.variants.treatments.size === 0) {
      throw new Error('At least one treatment variant required');
    }

    return {
      id: this.data.id || `exp-${Date.now()}`,
      name: this.data.name || 'Untitled Experiment',
      variants: this.data.variants,
      metadata: this.data.metadata || {},
    } as ExperimentData;
  }
}

// Export singleton
export const tyche = new Tyche();

// Usage matches docs
const result = await tyche.experiment(data).forMetric('revenue').analyze();
```

### Files to Create

- `src/api/Tyche.ts`
- `src/api/ExperimentBuilder.ts`
- `src/tests/api/fluent.test.ts`

---

## Sprint Success Criteria

- [ ] Compound models working for zero-inflated data
- [ ] Revenue analyzer with decomposition
- [ ] Effect breakdown into frequency × severity
- [ ] Basic fluent API structure in place
- [ ] All tests passing
- [ ] Performance targets met
- [ ] Compound posteriors have working credibleInterval and logPdf

## Note on Phase 2.5 (Dependence Research)

The implementation roadmap includes research on dependence between frequency and severity. This is intentionally deferred - we're using independence assumption for now, which should be fine for most use cases.

## Next Sprint Preview

Sprint 4+ will add:

- HTE/Segment discovery (Phase 3)
- Power analysis framework
- Export functionality
- Natural language insights
- Complete fluent API with priors
