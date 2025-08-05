# Tyche Implementation Roadmap

This roadmap guides the transformation of Tyche from a working proof-of-concept into a well-architected system that matches the vision in CoreVision.md. The transformation preserves all working mathematical algorithms while reorganizing the codebase to follow the clean architecture defined in TechnicalArchitecture.md and InterfaceStandards.md.

The key insight driving this transformation: proper separation of concerns enables both simple A/B tests and complex HTE analysis through the same unified interfaces, while keeping the codebase maintainable and extensible.

## Current State Assessment

### What's Working ✅

- Core mathematical algorithms (conjugate updates, EM, distributions)
- WebWorker infrastructure exists (needs standardization)
- Test suite with comprehensive scenarios
- Basic visualization components

### Critical Gaps 🚧

- **No StandardData model** - Various data formats scattered
- **Distributions coupled with inference** - Not pure mathematical objects
- **No capability-based routing** - Hardcoded model selection
- **Missing domain layer** - No ExperimentAnalyzer pattern
- **No segment framework** - Can't do HTE analysis

## Transformation Roadmap

### Phase 0: Foundation Alignment (Important - Sets up clean architecture)

**Goal**: Align codebase with InterfaceStandards.md interfaces

#### 0.1 Core Error Handling

**Files**: `src/core/errors/TycheError.ts`

Implement consistent error handling from the start:

```typescript
// From InterfaceStandards.md
enum ErrorCode {
  // Data errors
  INVALID_DATA = 'INVALID_DATA',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  DATA_QUALITY = 'DATA_QUALITY',

  // Model errors
  MODEL_MISMATCH = 'MODEL_MISMATCH',
  CONVERGENCE_FAILED = 'CONVERGENCE_FAILED',
  INVALID_PRIOR = 'INVALID_PRIOR',

  // Worker errors
  WORKER_TIMEOUT = 'WORKER_TIMEOUT',
  WORKER_ERROR = 'WORKER_ERROR',

  // User errors
  INVALID_INPUT = 'INVALID_INPUT',
  CANCELLED = 'CANCELLED',

  // System errors
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

class TycheError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'TycheError';

    // Ensure stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TycheError);
    }
  }
}
```

**Tasks**:

- [ ] Create TycheError class extending Error
- [ ] Define ErrorCode enum with all error types
- [ ] Support error context for debugging
- [ ] Ensure stack trace preservation

#### 0.2 Standardize Data Model

**Files**: `src/core/data/StandardData.ts`

```typescript
// BEFORE: Multiple data formats scattered
// AFTER: Just two types as defined in InterfaceStandards.md
interface StandardData {
  type: 'binomial' | 'user-level';
  n: number;
  binomial?: { successes: number; trials: number };
  userLevel?: { users: UserLevelData[]; empiricalStats?: EmpiricalStats };
  quality: DataQuality; // Routing indicators
}

interface DataQuality {
  hasZeros: boolean; // Key for compound model selection
  hasNegatives: boolean; // Determines distribution family
  hasOutliers: boolean; // Suggests mixture models
  missingData: number; // Count of null/undefined values
}
```

**Tasks**:

- [ ] Create StandardData and DataQuality interfaces
- [ ] Add quality indicator computation (hasZeros, hasNegatives, hasOutliers)
- [ ] Implement multimodality detection for mixture model routing
- [ ] Convert all code to use StandardData
- [ ] Add UserLevelData feature support for future HTE
- [ ] Remove redundant data type definitions

#### 0.3a Distribution Implementation Audit

**Files**: Document in `docs/distribution-audit.md`

Audit existing implementations BEFORE consolidation:

**Tasks**:

- [ ] Audit Beta implementations across `/inference/`, `/core/`, `vi-engine.ts`
- [ ] Audit Normal implementations and identify gaps
- [ ] Audit LogNormal implementations (Bayesian vs simple)
- [ ] Audit Gamma implementations (not integrated yet)
- [ ] Document which have logPdf, which don't
- [ ] Identify coupling patterns (inference logic mixed with math)
- [ ] Create consolidation plan before implementing 0.3b

#### 0.3b Pure Distribution Objects

**Files**: `src/core/distributions/*.ts`

```typescript
// BEFORE: Distributions have inference logic mixed in
// AFTER: Pure mathematical objects per InterfaceStandards.md
interface Distribution {
  pdf(x: number): number;
  logPdf(x: number): number; // Currently missing in some
  cdf(x: number): number;
  mean(): number;
  variance(): number;
  support(): { min: number; max: number };
  sample(n?: number, rng?: RNG): number | number[];
  // No fit() method - fitting is done by inference engines!
}
```

**Tasks**:

- [ ] Merge implementations from `/inference/`, `/core/distributions/`, `vi-engine.ts`
- [ ] Add missing logPdf implementations (technical debt from roadmap)
- [ ] Remove all inference logic from distributions
- [ ] Ensure consistent interface across all distributions
- [ ] Create Beta, LogNormal, Normal, Gamma as pure math

#### 0.4 Model Configuration & Routing

**Files**: `src/inference/ModelRouter.ts`

```typescript
// Clear separation of structure vs type per InterfaceStandards.md
interface ModelConfig {
  structure: 'simple' | 'compound';

  // For simple models
  type?: 'beta' | 'lognormal' | 'normal' | 'gamma';
  components?: number; // 1 for single, 2+ for mixture

  // For compound models (zero-inflated)
  frequencyType?: 'beta'; // Always beta for frequency
  valueType?: ModelType; // Distribution for positive values
  valueComponents?: number; // Components in value distribution
}

class ModelRouter {
  // Reference implementation in TechnicalArchitecture.md
  static async route(
    data: StandardData,
    fitOptions?: FitOptions
  ): Promise<{ config: ModelConfig; engine: InferenceEngine }> {
    // Uses data quality indicators for routing decisions
  }
}
```

**Tasks**:

- [ ] Implement capability-based routing using DataQuality
- [ ] Remove hardcoded model selection logic
- [ ] Create ModelSelection module for WAIC/BIC/DIC (contain complexity)
- [ ] Ensure <10ms routing decisions

### Phase 1: Statistical Layer

**Goal**: Implement architecture from TechnicalArchitecture.md

**Depends on**: Phase 0

#### 1.1 Standardize Inference Engines

**Files**: `src/inference/engines/*.ts`

```typescript
abstract class InferenceEngine {
  abstract capabilities: EngineCapabilities;

  canHandle(config: ModelConfig, data: StandardData, options?: FitOptions): boolean;

  abstract fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult>;
}

interface InferenceResult {
  posterior: Posterior;
  diagnostics: { converged: boolean; iterations?: number; logLikelihood?: number };
  metadata: { algorithm: string; computeTime: number; warnings?: string[] };
}
```

**Tasks**:

- [ ] Create abstract InferenceEngine class
- [ ] Update all engines to extend InferenceEngine
- [ ] Implement canHandle() for each engine
- [ ] Standardize InferenceResult format
- [ ] Ensure all engines declare capabilities

#### 1.1b Migrate Existing Engines to New Architecture

**Files**: `src/inference/engines/*.ts`

Priority order (revenue-focused):

**Tasks**:

- [ ] Migrate BetaBinomialConjugate to new pattern
- [ ] Rename LogNormalBayesian → LogNormalConjugate for consistency
- [ ] Rename/complete NormalNormal → NormalConjugate for consistency
- [ ] Migrate Normal and LogNormal Mixture EM engines
- [ ] Defer: GammaExponentialConjugate (exists but not integrated)
- [ ] Defer: VI engine wrapper (future phase)

For each engine:

- [ ] Extend InferenceEngine base class
- [ ] Declare capabilities properly
- [ ] Implement canHandle() method
- [ ] Standardize fit() return format
- [ ] Update to use StandardData
- [ ] Add proper error handling with TycheError
- [ ] Ensure consistent naming (XYConjugate for all conjugate pairs)

#### 1.1c Upgrade Mixture Models to Full VBEM

**Files**: `src/inference/engines/*MixtureEM.ts`

Replace point estimate mixture weights with proper Bayesian treatment:

**Tasks**:

- [ ] Add Dirichlet prior parameters to mixture engines
- [ ] Replace weight point estimates with posterior distributions
- [ ] Update NormalMixtureEM to track weight uncertainty via Dirichlet
- [ ] Update LogNormalMixtureEM to track weight uncertainty via Dirichlet
- [ ] Modify `getComponents()` to include weight credible intervals
- [ ] Update ComponentInfo interface to support weight uncertainty
- [ ] Add tests for weight uncertainty propagation
- [ ] Document VBEM approach vs standard EM

**Implementation approach**:

- Use Dirichlet-Multinomial conjugacy for weight updates
- Replace `weight = Nj/n` with `alpha[j] = alpha_prior[j] + Nj`
- Expected weights: `E[w_j] = alpha[j] / sum(alpha)`
- Weight uncertainty: Beta marginals from Dirichlet

#### 1.2 Data Structures and Validation

**Files**: `src/domain/types/*.ts`

```typescript
// Experiment structure per InterfaceStandards.md
interface ExperimentData {
  id: string;
  name: string;
  variants: {
    control: VariantData;
    treatments: Map<string, VariantData>;
  };
  metadata: {
    startDate: Date;
    endDate?: Date;
    hypothesis: string;
    minimumPracticalEffect?: Record<string, number>;
  };
}

// Variant data structure
interface VariantData {
  name: string;
  n: number; // Always track sample size
  binary?: BinomialData; // For conversion data
  users?: UserLevelData[]; // For user-level data
}

// Data validation using TycheError
class DataValidator {
  static validateExperiment(data: ExperimentData): void {
    if (!data.variants.control) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Experiment must have a control variant', {
        experimentId: data.id,
      });
    }

    if (data.variants.treatments.size === 0) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'Experiment must have at least one treatment variant',
        { experimentId: data.id }
      );
    }

    // Check sample sizes
    for (const [name, variant] of Object.entries(data.variants)) {
      if (variant.n < 30) {
        throw new TycheError(
          ErrorCode.INSUFFICIENT_DATA,
          `Need at least 30 samples for variant ${name}, but only have ${variant.n}`,
          { variant: name, actual: variant.n, required: 30 }
        );
      }
    }
  }
}
```

#### 1.3 Result Objects Foundation

**Files**: `src/domain/results/*.ts`

```typescript
// Base class for all results per InterfaceStandards.md
abstract class AnalysisResult {
  constructor(protected metadata: ResultMetadata) {}
  abstract toJSON(): object;
  export(format: 'json' | 'csv'): Promise<Blob>;
}

// Metadata structure
interface ResultMetadata {
  timestamp: Date;
  algorithm?: string;
  computeTime?: number;
  converged?: boolean;
  sampleSize?: number;
  warnings?: string[];
  [key: string]: any; // Extensible
}
```

### Phase 2: Domain Layer & Business Analysis

**Goal**: Handle real business metrics with proper decomposition

**Depends on**: Phase 1

#### 2.1 Analyzer Framework

**Files**: `src/domain/analyzers/*.ts`

Two types of analyzers per InterfaceStandards.md:

```typescript
// For comparing variants in experiments
interface ExperimentAnalyzer {
  analyze(data: ExperimentData): Promise<ExperimentResult>;
  configure?(options: AnalyzerOptions): void;
}

// For single dataset analysis (e.g., prior learning)
interface DatasetAnalyzer {
  analyze(data: StandardData): Promise<VariantResult>;
  configure?(options: AnalyzerOptions): void;
}

interface AnalyzerOptions {
  priors?: Map<string, Distribution>;
  minimumPracticalEffect?: number;
  progressCallback?: (progress: number) => void;
}
```

**Concrete Analyzers**:

- `ConversionAnalyzer` - Beta-Binomial for conversion rates
- `RevenueAnalyzer` - Handles compound models, decomposition
- `PriorLearner` - DatasetAnalyzer for learning from historical data

**Compound Model Pattern**:

```typescript
class CompoundInferenceEngine extends InferenceEngine {
  async fit(data: StandardData, config: ModelConfig): Promise<InferenceResult> {
    // Data is from a single variant
    // Config was already determined by ExperimentAnalyzer routing on combined data

    // Separate zero and non-zero data
    const convertedData = this.filterConverted(data);
    const positiveData = this.filterPositive(data);

    // Fit frequency model (always Beta for conversion)
    const freqEngine = new BetaBinomialConjugateEngine();
    const freqResult = await freqEngine.fit(convertedData, { type: 'beta' });

    // Fit value model based on config
    const valueEngine = this.routeValueEngine(config.valueType);
    const valueResult = await valueEngine.fit(positiveData, {
      type: config.valueType,
      components: config.valueComponents,
    });

    // Combine into CompoundPosterior
    return {
      posterior: new CompoundPosterior(freqResult.posterior, valueResult.posterior),
      diagnostics: {
        converged: freqResult.diagnostics.converged && valueResult.diagnostics.converged,
      },
    };
  }

  private routeValueEngine(valueType: ModelType): InferenceEngine {
    // Select appropriate engine for value distribution
    // Not limited to LogNormal - Gamma, Normal, etc. based on data characteristics
    switch (valueType) {
      case 'lognormal':
        return new LogNormalConjugateEngine();
      case 'gamma':
        return new GammaConjugateEngine();
      case 'normal':
        return new NormalConjugateEngine();
      // Mixture models for multimodal value distributions (NOT user segmentation)
      case 'lognormal-mixture':
        return new LogNormalMixtureEngine();
      case 'normal-mixture':
        return new NormalMixtureEngine();
    }
  }
}
```

#### 2.2 Result Objects Implementation

**Files**: `src/domain/results/*.ts`

```typescript
// Single variant/dataset result
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

  // Runtime capability detection
  getDecomposition(): EffectDecomposition | null {
    // Returns null for simple models, decomposition for compound
    if (this.posterior instanceof CompoundPosterior) {
      return this.computeDecomposition();
    }
    return null;
  }

  getComponents(): ComponentInfo[] | null {
    // For mixture models: returns value distribution components
    // NOT user segments - those come from HTE analysis
    return this.posterior.getComponents();
  }
}

// Multi-variant experiment result
class ExperimentResult extends AnalysisResult {
  constructor(
    private variants: Map<string, VariantResult>,
    metadata: ResultMetadata
  ) {
    super(metadata);
  }

  getVariantResult(name: string): VariantResult | undefined;
  async compareVariants(): Promise<Comparison>;
  async discoverSegments(): Promise<Segment[]>; // Phase 3
}
```

#### 2.3 Business Decomposition

**Files**: `src/domain/results/EffectDecomposition.ts`

For compound models (revenue = conversion × value):

```typescript
interface EffectDecomposition {
  frequency: {
    control: number;
    treatment: number;
    effect: number;
    relativeEffect: number;
  };
  value: {
    control: number;
    treatment: number;
    effect: number;
    relativeEffect: number;
  };
  combined: {
    effect: number;
    relativeEffect: number;
    frequencyContribution: number; // % of effect from conversion
    valueContribution: number; // % of effect from value
  };
}
```

**Note**: Value distributions aren't limited to LogNormal. The system selects the appropriate distribution (LogNormal, Gamma, Normal, or mixtures) based on data characteristics like skewness, support, and modality.

#### 2.4 Prior Elicitation

**Files**: `src/domain/priors/PriorElicitor.ts`

Visual tools for non-statisticians:

```typescript
class PriorElicitor {
  /**
   * Elicit Beta prior from conversion rate estimates
   * @param input.likely - Most likely conversion rate
   * @param input.lower - 5th percentile (optional)
   * @param input.upper - 95th percentile (optional)
   * @param input.confidence - How sure the user is about their estimates
   */
  static elicitBeta(input: {
    likely: number;
    lower?: number;
    upper?: number;
    confidence?: 'low' | 'medium' | 'high';
  }): BetaDistribution {
    // Adjust effective sample size based on confidence
    const effectiveSampleSize = {
      low: 10, // Very weak prior
      medium: 50, // Moderate prior
      high: 200, // Strong prior
    }[input.confidence || 'medium'];

    // Calculate alpha and beta from likely value and ESS
    const alpha = input.likely * effectiveSampleSize;
    const beta = (1 - input.likely) * effectiveSampleSize;

    return new BetaDistribution(alpha, beta);
  }

  /**
   * Elicit from percentiles - more flexible approach
   */
  static fromPercentiles(
    type: 'beta' | 'lognormal' | 'normal',
    percentiles: Array<[number, number]> // [probability, value]
  ): Distribution {
    // Use optimization to find parameters that match percentiles
    // Implementation details in original roadmap
  }

  /**
   * Industry-specific helpers
   */
  static ecommerceConversionPrior(): BetaDistribution {
    // Based on empirical data: 2-3% typical
    return this.elicitBeta({
      likely: 0.025,
      lower: 0.01,
      upper: 0.05,
      confidence: 'high',
    });
  }

  static saasTrialConversionPrior(): BetaDistribution {
    // Based on empirical data: 15-20% typical
    return this.elicitBeta({
      likely: 0.175,
      lower: 0.1,
      upper: 0.3,
      confidence: 'medium',
    });
  }
}
```

**Implementation Notes**:

- Prior elicitation returns Distribution objects directly
- No separate Prior interface needed (per InterfaceStandards.md)
- Engines check prior compatibility via instanceof
- Visual feedback shows resulting distribution in real-time

#### 2.5 Industry Presets

**Files**: `src/domain/presets/*.ts`

```typescript
interface IndustryPreset {
  name: string;
  description: string;

  metrics: {
    primary: MetricDefinition;
    secondary: MetricDefinition[];
    guardrails: MetricDefinition[];
  };

  priors: {
    [metric: string]: Distribution; // Direct Distribution objects
  };

  minimumEffects: {
    [metric: string]: number;
  };

  segmentation?: {
    recommended: string[];
    avoid: string[];
  };
}

// Example preset
const ECOMMERCE_PRESET: IndustryPreset = {
  name: 'E-commerce',
  priors: {
    conversion: new BetaDistribution(100, 900), // ~10% baseline
    revenue: new LogNormalDistribution(3.5, 1.2), // ~$30 AOV
    add_to_cart: new BetaDistribution(200, 800), // ~20% baseline
  },
  minimumEffects: {
    conversion: 0.02, // 2% absolute
    revenue: 5, // $5
  },
};
```

#### 2.6 Worker Pool Infrastructure (Issue #42)

**Files**: `src/infrastructure/workers/WorkerPool.ts`

```typescript
interface WorkerPool {
  execute<T, R>(task: WorkerTask<T, R>): Promise<R>;
  executeMany<T, R>(tasks: T[], options?: BatchOptions): Promise<R[]>;

  // Progress and cancellation
  onProgress(callback: (progress: WorkerProgress) => void): void;
  cancel(taskId: string): void;
  cancelAll(): void;
}

interface WorkerTask<TParams, TResult> {
  id: string;
  operation: string;
  params: TParams;
  timeout?: number;
  priority?: number;
  onProgress?: (progress: WorkerProgress) => void;
}
```

**Required for**:

- EM algorithms (50-100ms tasks)
- Power analysis (Phase 2)
- Bootstrap validation (Phase 3)
- HTE discovery (Phase 3)

#### 2.7 Dependence Research Spike (Phase 2.5)

**Goal**: Validate independence assumption in compound models

**Research Questions**:

- How often is frequency-severity independence violated in practice?
- What's the business impact of assuming independence when it's false?
- Is the added complexity of copula modeling worth it?

**Tasks**:

- [ ] Test with simulated correlated data
- [ ] Prototype simple copula approach if needed
- [ ] Measure business impact vs statistical fit
- [ ] Decision: Keep simple or add dependence modeling

### Phase 3: Segmentation & HTE

**Goal**: Find who responds differently (per CoreVision.md)

**Depends on**: Phase 2 + Worker Pool

**Important**: HTE analysis uses causal trees to discover user segments based on observable features (device, behavior, etc.). This is distinct from mixture models which identify statistical patterns in value distributions (e.g., budget vs premium spending patterns) within a single population.

#### 3.1 Unified Segment Interface

**Files**: `src/domain/hte/Segment.ts`

```typescript
interface Segment {
  id: string;
  name: string;
  source: 'manual' | 'causal_tree'; // NOT mixture components!

  definition: {
    selector: (user: UserLevelData) => boolean;
    description: string;
    features?: string[]; // Which features define this segment
  };

  population: {
    size: number;
    percentage: number;
  };

  // Only after analysis
  effect?: {
    estimate: number;
    ci95: [number, number];
    posterior: Posterior;
  };
}
```

**Critical distinction**: Segments are user groupings (e.g., "mobile users"), NOT mixture components (e.g., "high-value distribution"). Mixture models capture multimodal value distributions within a single population, while segments analyze treatment effects across different user groups.

#### 3.2 HTEAnalyzer

**Files**: `src/domain/hte/HTEAnalyzer.ts`

```typescript
class HTEAnalyzer {
  async analyze(
    result: ExperimentResult,
    data: ExperimentData,
    segments?: Segment[] // Optional pre-defined segments
  ): Promise<HTEResult> {
    // If no segments provided, discover them
    if (!segments) {
      segments = await this.discoverSegments(result, data);
    }

    // Analyze each segment through unified pipeline
    const segmentResults = await this.analyzeSegments(segments, data);

    // Validate stability
    const validation = await this.validateSegments(segmentResults, data);

    return {
      segments: segmentResults,
      validation,
      crossSegmentComparison: this.compareSegments(segmentResults),
    };
  }
}

interface HTEResult {
  segments: Segment[];
  validation: {
    stability: number; // Bootstrap stability score
    probabilityMeaningful: number; // P(effect > threshold)
    practicalImpact: number; // Business impact score
  };
  crossSegmentComparison: SegmentComparison[];
}
```

#### 3.3 Manual Segmentation

**Files**: `src/domain/hte/SegmentBuilder.ts`

```typescript
class SegmentBuilder {
  // Common patterns
  static device(type: 'mobile' | 'desktop' | 'tablet'): Segment;
  static timeOfWeek(days: string[]): Segment;
  static valueRange(min: number, max: number): Segment;
  static newVsReturning(): Segment;

  // Combine segments
  static and(...segments: Segment[]): Segment;
  static or(...segments: Segment[]): Segment;
}
```

#### 3.4 Constrained Causal Trees

**Files**: `src/domain/hte/CausalTree.ts`

Per CoreVision.md constraints:

```typescript
interface CausalTreeConfig {
  // Constrained for interpretability
  maxDepth: 3; // Human-readable paths
  minSegmentSize: 0.1; // 10% minimum (targetable)
  minEffectSize: 0.02; // 2% minimum (meaningful)

  // Hypothesis-driven features only
  allowedFeatures: string[];

  // Validation required
  bootstrapIterations: 100;
  stabilityThreshold: 0.7;
}

class CausalTreeBuilder {
  async build(data: ExperimentData, config: CausalTreeConfig): Promise<CausalTree> {
    // Constrained tree building with honest splitting
    // Bootstrap validation built-in
  }
}
```

**Tasks**:

- [ ] Implement constrained tree building
- [ ] Add honest splitting
- [ ] Integrate bootstrap validation
- [ ] Ensure interpretable segments

#### 3.5 Power Analysis Framework

**Files**: `src/domain/analysis/PowerAnalysis.ts`

From InterfaceStandards.md:

```typescript
interface PowerAnalysis {
  // Calculate power for given parameters
  async calculatePower(config: {
    baseline: Distribution;  // Prior as Distribution
    effect: EffectSize;
    sampleSize: number;
    alpha?: number;
  }): Promise<PowerResult>;

  // Find required sample size
  async calculateSampleSize(config: {
    baseline: Distribution;
    effect: EffectSize;
    power: number;          // Target power (e.g., 0.8)
    alpha?: number;
  }): Promise<SampleSizeResult>;

  // Power curve across sample sizes
  async calculatePowerCurve(config: {
    baseline: Distribution;
    effect: EffectSize;
    sampleSizes: number[];
    alpha?: number;
  }): Promise<PowerCurve>;
}

class PowerAnalysisEngine {
  constructor(private workerPool: WorkerPool) {}

  // Implementation will use importance sampling for efficiency
  // and distribute simulations across workers
}
```

**Tasks**:

- [ ] Implement importance sampling approach
- [ ] Create worker tasks for parallel simulation
- [ ] Build power curve visualization
- [ ] Add sample size optimization

### Phase 4: Application Layer & Polish

**Goal**: Make it accessible per CoreVision.md

**Depends on**: Phase 3

#### 4.1 Fluent API

**Files**: `src/api/Tyche.ts`

```typescript
class Tyche {
  // Main entry point
  experiment(data: ExperimentData | any): ExperimentBuilder {
    return new ExperimentBuilder(data);
  }

  // Single dataset analysis
  analyze(data: StandardData | any): DatasetBuilder {
    return new DatasetBuilder(data);
  }

  // Planning tools
  plan(): ExperimentPlanner {
    return new ExperimentPlanner();
  }
}

// Fluent builder pattern
class ExperimentBuilder {
  forMetric(metric: 'conversion' | 'revenue' | string): this;
  withPrior(prior: Distribution | string): this;
  withSegments(segments: Segment[] | string[]): this;
  withPreset(preset: string): this;

  async analyze(): Promise<ExperimentResult>;
}

// Usage
const result = await tyche.experiment(data).forMetric('revenue').withPreset('ecommerce').analyze();

// Progressive disclosure
const decomposition = result.getVariantResult('treatment')?.getDecomposition();
if (decomposition) {
  console.log('Conversion lifted by', decomposition.frequency.relativeEffect);
  console.log('Value lifted by', decomposition.value.relativeEffect);
}
```

#### 4.2 Natural Language Insights

**Files**: `src/domain/insights/InsightGenerator.ts`

From InterfaceStandards.md:

```typescript
interface NaturalLanguageInsights {
  insights: Insight[];
  confidence: 'high' | 'medium' | 'low';
  caveats: string[];
}

interface Insight {
  type: 'finding' | 'warning' | 'recommendation';
  priority: 'high' | 'medium' | 'low';
  text: string;
  data?: any; // Supporting data
}

class InsightGenerator {
  generate(result: ExperimentResult, options: InsightOptions = {}): NaturalLanguageInsights;
}
```

**Tasks**:

- [ ] Implement insight generation for all result types
- [ ] Create plain English templates
- [ ] Add business context awareness
- [ ] Generate actionable recommendations

#### 4.3 Error Recovery and Resilience

**Files**: `src/infrastructure/ErrorRecovery.ts`

```typescript
class ErrorRecovery {
  static async withRecovery<T>(
    operation: () => Promise<T>,
    fallbacks: FallbackStrategy[]
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      for (const fallback of fallbacks) {
        if (fallback.canHandle(error)) {
          return fallback.recover(error);
        }
      }
      throw error;
    }
  }
}

// Pre-defined fallback strategies
class SimplifyModelFallback implements FallbackStrategy {
  canHandle(error: Error): boolean {
    return error instanceof TycheError &&
           (error.code === ErrorCode.CONVERGENCE_FAILED ||
            error.code === ErrorCode.INSUFFICIENT_DATA);
  }

  async recover(error: Error): Promise<any> {
    // Try simpler model (e.g., k=1 instead of k=2)
    console.warn('Model failed to converge, trying simpler model');

    if (error instanceof TycheError && error.code === ErrorCode.CONVERGENCE_FAILED) {
      const simpler = {
        ...error.context.config,
        components: 1  // Reduce to single component
      };
      return ModelRouter.refit(error.context.data, simpler);
    }
  }
}

// Usage in analyzer
async analyze(data: ExperimentData): Promise<ExperimentResult> {
  return ErrorRecovery.withRecovery(
    () => this.performAnalysis(data),
    [
      new SimplifyModelFallback(),
      new FallbackToConjugate(),
      new IncreaseIterations()
    ]
  );
}
```

**Recovery Strategies**:

- Model simplification (reduce components)
- Fallback to conjugate methods
- Increase iteration limits
- Use weaker priors
- Provide partial results with warnings

#### 4.4 Embeddable Visualizations

**Files**: `src/application/export/EmbeddableViz.ts`

```typescript
class EmbeddableVisualization {
  // Generate standalone HTML/JS bundle
  static async createBundle(result: ExperimentResult, options: VizOptions = {}): Promise<string> {
    // Minimal bundle with just necessary code
    // Interactive distribution plots
    // No dependencies on main app
  }

  // React component for embedding
  static ReactComponent: React.FC<{ result: ExperimentResult }>;

  // Vanilla JS for any site
  static render(container: string | HTMLElement, data: any): void;
}
```

#### 4.5 Demo Application

**Files**: `src/demo/*`

Progressive journey showcasing all capabilities:

```typescript
// Demo app showing progression
const demo = {
  // Step 1: Simple A/B test
  basicConversion: async () => {
    const result = await tyche.experiment(conversionData).forMetric('conversion').analyze();

    showResult(result.summary());
  },

  // Step 2: Revenue with decomposition
  revenueAnalysis: async () => {
    const result = await tyche.experiment(revenueData).forMetric('revenue').analyze();

    showDecomposition(result.getDecomposition());
    showCustomerTiers(result.getComponents()); // Value distribution tiers
  },

  // Step 3: Segment discovery
  segmentAnalysis: async () => {
    const result = await tyche
      .experiment(segmentedData)
      .forMetric('revenue')
      .withSegments(['device', 'dayOfWeek'])
      .analyze();

    const segments = await result.discoverSegments();
    showSegmentInsights(segments);
  },

  // Step 4: Full HTE analysis
  hteDiscovery: async () => {
    const result = await tyche.experiment(fullData).forMetric('compound').analyze();

    const hte = await result.analyzeHTE({
      sources: ['manual', 'causal_tree'],
      constraints: { maxDepth: 3, minSize: 0.1 },
    });

    showHTEPatterns(hte);
  },
};
```

**Demo Features**:

1. Interactive data generation
2. Real-time inference visualization
3. Step-by-step tutorials
4. Export results at any stage
5. Comparison with frequentist approaches

## Analysis Capability Progression

The implementation builds capabilities incrementally:

```
Phase 0: Foundation Replacement
├── Core error handling (TycheError)
├── Merge distributions from multiple sources
├── Simplify posteriors to sample-based
├── Model capabilities declaration
├── Replace router with capability-based approach
├── Consolidate model selection (WAIC, BIC, DIC)
├── Simplify data model to 2 types
└── Standardize worker operations

Phase 1: Basic A/B Testing
├── Simple conversion comparison (Beta-Binomial)
├── Effect sizes with uncertainty
├── Business interpretations
├── Data validation and parsing
└── Full Bayesian mixture models (VBEM)

Phase 2: Business Analysis
├── Revenue = Conversion × Value decomposition
├── Mixture models for multimodal value distributions
├── Industry presets (e-commerce, SaaS)
├── Prior elicitation (returns distributions)
└── Fluent API

Phase 2.5: Dependence Research
├── Test independence assumption
├── Prototype copula approach
├── Measure business impact
└── Make decision on complexity vs value

Phase 3: Segmentation & HTE
├── Unified Segment interface (all sources)
├── Manual segments (hypothesis-driven)
├── Causal tree discovery (data-driven user groups)
├── Mixture components as value tiers (not user segments)
├── Bootstrap validation
└── Cross-segment comparison

Phase 4: Polish & Integration
├── Error recovery strategies
├── Progress tracking and cancellation
├── Export to multiple formats
├── Natural language insights
├── Interactive visualizations
├── Embeddable visualization bundle
└── Complete demo app
```

## Success Metrics by Phase

### Phase 0 Complete When:

- [ ] TycheError and ErrorCode implemented
- [ ] Distribution audit documented with consolidation plan
- [ ] All posteriors use unified sample-based approach
- [ ] StandardData used everywhere
- [ ] Capability-based routing working
- [ ] All posteriors can compute logPdf via samples
- [ ] Model selection complexity isolated
- [ ] Worker operations standardized
- [ ] Tests still passing

### Phase 1 Complete When:

- [ ] Basic A/B test comparison works end-to-end
- [ ] Can calculate lift with uncertainty
- [ ] Business interpretation included
- [ ] Core data handling implemented
- [ ] UserLevelData supports features
- [ ] Result objects follow InterfaceStandards.md
- [ ] All revenue-critical engines migrated (Beta, LogNormal, mixtures)
- [ ] Consistent XYConjugate naming for all conjugate engines
- [ ] Mixture models provide full uncertainty (weights + parameters via VBEM)

### Phase 2 Complete When:

- [ ] Revenue = Conversion × Value decomposition working
- [ ] Mixture models identify multimodal value distributions
- [ ] Prior elicitation from percentiles
- [ ] At least one industry preset implemented
- [ ] Power analysis via workers
- [ ] Fluent API feels natural
- [ ] Dependence research complete

### Phase 3 Complete When:

- [ ] Unified Segment interface implemented
- [ ] Manual segmentation working
- [ ] Causal tree discovery with constraints
- [ ] Bootstrap validation functional
- [ ] All segments analyzed through same pipeline
- [ ] Cross-segment insights generated
- [ ] Power analysis integrated

### Phase 4 Complete When:

- [ ] Natural language insights generating useful explanations
- [ ] Interactive visualizations embeddable
- [ ] Complete demo app showcasing journey
- [ ] Documentation complete
- [ ] Ready for user feedback

## Technical Debt Being Addressed

1. **WAIC Integration Complexity** → Isolated to ModelSelection module
2. **Model Type Explosion** → Currently have many redundant model configurations (BetaModel, BetaGammaModel, BetaNormalModel, BetaLogNormalModel, etc.) instead of using composition. Will be replaced with core distribution types (beta, lognormal, normal, gamma, plus future additions) that compose into simple or compound structures as needed
3. **Worker Inconsistency** → Standardized WorkerOperation pattern
4. **Missing posteriors.logPdf** → Solved by sample-based approach (all posteriors compute via KDE)
5. **Coupled inference/math** → Separated into inference engines and posteriors
6. **Unclear routing logic** → Data quality indicators drive decisions
7. **No unified interfaces** → All follow InterfaceStandards.md
8. **Mixture weight uncertainty** → Resolved by VBEM implementation (Phase 1.1c)

## File Organization

Following the architecture layers:

```
src/
├── core/               # Foundation (Phase 0)
│   ├── data/          # StandardData, DataQuality
│   ├── distributions/ # Pure mathematical objects
│   └── posteriors/    # Posterior implementations
├── statistical/        # Statistical layer (Phase 1)
│   ├── inference/     # Engines and routing
│   └── selection/     # Model selection (WAIC, BIC, DIC)
├── domain/            # Business layer (Phase 2-3)
│   ├── types/         # ExperimentData, VariantData
│   ├── analyzers/     # Domain-specific analyzers
│   ├── results/       # Result objects
│   ├── priors/        # Prior elicitation
│   ├── presets/       # Industry presets
│   ├── hte/           # Segmentation & HTE
│   ├── analysis/      # Power analysis
│   └── insights/      # Natural language
├── application/       # UI layer (Phase 4)
│   ├── api/           # Fluent API
│   ├── export/        # Embeddable viz
│   └── demo/          # Demo application
└── infrastructure/    # Cross-cutting
    └── workers/       # Worker pool
```

## What We're NOT Building

Per the core specs, these are explicitly out of scope:

- Real-time/sequential testing
- Complex dependence modeling (unless research shows clear need)
- General-purpose stats library features
- Black-box ML methods
- Micro-optimization targeting

## Key Principles

1. **Incremental Replacement**: Replace foundation pieces one at a time
2. **Isolate Changes**: Each replacement should minimize impact
3. **Test Continuously**: Keep the test suite green
4. **User-First**: Every change improves the user experience
5. **Document as You Go**: Update docs with each change
6. **Preserve Working Code**: Don't delete until replacement proven

This roadmap directly implements the architecture defined in TechnicalArchitecture.md and InterfaceStandards.md, providing a clear path from current state to desired state.
