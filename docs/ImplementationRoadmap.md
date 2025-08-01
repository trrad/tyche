# Tyche Implementation Roadmap

## Current State Assessment

### What's Working Well ✅
- **Solid mathematical core**: Distributions, conjugate updates, EM algorithms
- **Working inference**: Beta-Binomial, Gamma-Poisson, compound models, mixtures
- **WebWorker infrastructure**: Async computation with progress tracking
- **Test suite**: Comprehensive scenarios and test data generators
- **Two-part models**: Beta-LogNormal compound for revenue decomposition
- **Mixture detection**: EM algorithms for discovering customer tiers

### Technical Debt 🚧
- **WAIC integration complexity**: Revealed architectural issues
- **Missing experiment structure**: No variant comparison or effect calculations
- **No segmentation framework**: Neither manual nor causal tree discovery
- **Distribution-inference coupling**: Math mixed with inference logic
- **Missing data validation**: No systematic data quality checks
- **Model type explosion**: Too many redundant types instead of composition

### Gaps to Fill 📋
- **Basic A/B test workflow**: Compare variants, compute lifts
- **Business-ready outputs**: Interpretations, not just parameters
- **Domain-specific analyzers**: Opinionated paths for common use cases
- **HTE discovery**: Constrained causal trees for stable segments
- **Prior elicitation**: Visual tools for non-statisticians
- **Power analysis**: Sample size calculations and experiment planning
- **Dependence modeling**: Validate independence assumption in compound models

## Migration Strategy: Incremental Foundation Replacement

### Core Principle: Replace, Don't Layer
Since we're early in the project and current code is a PoC, we replace foundation pieces systematically. Each replacement is isolated to minimize disruption.

### What We're NOT Changing
- Core mathematical formulas ✓
- Conjugate update math ✓
- EM algorithm logic ✓
- WebWorker infrastructure (just simplifying) ✓
- Test scenarios and generators ✓

### What NEEDS Replacement
- **Distribution classes**: Merge implementations from `/inference/`, `/core/distributions/`, and vi-engine.ts
- **Model routing**: Replace complex logic with capability-based approach
- **Worker operations**: Standardize pattern, clarify inference vs sampling
- **Model selection**: Consolidate scattered logic into one module
- **Data types**: Simplify to just binomial and user-level

The math stays the same, but the organization changes to enable clean VI integration and reduce complexity.

## Phase 0: Foundation Replacement (Week 0 - CRITICAL)

Your current WAIC integration revealed critical issues that must be fixed before proceeding. This phase creates the clean foundation everything else builds on.

### 0.1 Merge Distributions (Day 1-2)
**Files**: `src/core/distributions/*.ts`

Current state has three different patterns scattered across codebase. Merge into unified pure mathematical objects:

```typescript
// BEFORE: Distributions coupled with inference
class Beta {
  // Has sampling, pdf, but also inference logic mixed in
  private static isUserLevelData(data: any): boolean {
    return Array.isArray(data) && 
           data.length > 0 && 
           'converted' in data[0] && 
           'value' in data[0];
  }
}

// AFTER: Pure mathematical objects
interface Distribution {
  // Pure math functions
  pdf(x: number): number;
  logPdf(x: number): number;
  cdf(x: number): number;
  sample(rng: RNG): number;
  mean(): number;
  variance(): number;
}

// Example: LogNormal is pure math only
class LogNormalDistribution implements Distribution {
  constructor(private mu: number, private sigma: number) {}
  
  pdf(x: number): number {
    // Pure mathematical implementation
  }
  
  // No fit() method - inference engines handle fitting
}
```

### 0.2 Standardize Data Quality Indicators (Day 3)
**Files**: `src/core/data/StandardData.ts`

Every StandardData object includes quality indicators that help with routing:

```typescript
interface StandardData {
  type: 'binomial' | 'user-level';
  n: number;
  
  // Data-specific fields
  binomial?: { successes: number; trials: number; };
  userLevel?: { users: UserLevelData[]; };
  
  // Quality indicators used for model routing
  quality: {
    hasZeros: boolean;      // Key for compound model selection
    hasNegatives: boolean;  // Determines distribution family
    hasOutliers: boolean;
    missingData: number;
  };
}

// These quality indicators are computed once when converting to StandardData
// and used by ModelRouter and InferenceEngines to make routing decisions
```

### 0.3 Replace ModelRouter (Day 4)
**Files**: `src/inference/ModelRouter.ts`

Simplified routing based on data characteristics:

```typescript
// Model types are the actual distributions
type ModelType = 
  | 'beta'        // Binary outcomes
  | 'lognormal'   // Positive continuous
  | 'normal'      // General continuous
  | 'gamma';      // Positive with lighter tails

// Model structure determines how we handle zeros
type ModelStructure = 'simple' | 'compound';

// Data types are different from model types
type DataType = 'binomial' | 'user-level';  // That's it!

interface ModelConfig {
  structure: ModelStructure;
  
  // For simple models
  type?: ModelType;
  components?: number;      // Default 1
  
  // For compound models (zero-inflated)
  conversionType?: 'beta';  // Always beta
  valueType?: ModelType;    // Type for positive values
  valueComponents?: number; // Components in value distribution
}

interface MultimodalityResult {
  isMultimodal: boolean;
  confidence: number;
  suggestedComponents: number;
  evidence: {
    bimodalityCoefficient: number;
    kurtosis: number;
    hasGaps: boolean;
  };
}

class ModelRouter {
  // Smart defaults without WAIC for 90% of cases
  static async route(
    data: StandardData,
    fitOptions?: FitOptions
  ): Promise<{ config: ModelConfig, engine: InferenceEngine }> {
    // Determine config from data
    const config = this.determineConfig(data);
    
    // Select compatible engine (considering prior if present)
    const engine = this.selectEngine(config, data, fitOptions);
    
    return { config, engine };
  }
  
  private static determineConfig(data: StandardData): ModelConfig {
    // For binomial data
    if (this.isBinomialData(data)) {
              return { structure: 'simple', type: 'beta' };
    }
    
    // Everything else is user-level data
    if (Array.isArray(data) && data.length > 0 && 'value' in data[0]) {
      const users = data as UserLevelData[];
      const hasZeros = users.some(u => !u.converted || u.value === 0);
      const hasNegatives = users.some(u => u.value < 0);
      
      if (hasZeros) {
        // Compound model is our general approach for zero-inflated data
        const positiveValues = users
          .filter(u => u.converted && u.value > 0)
          .map(u => u.value);
        
        // Still detect multimodality in the value distribution
        const detection = this.detectMultimodality(positiveValues);
        
        return {
          structure: 'compound',
          conversionType: 'beta',
          valueType: 'lognormal',
          valueComponents: detection.suggestedComponents
        };
      }
      
      // Pure continuous (no zeros)
      const values = users.map(u => u.value);
      const detection = this.detectMultimodality(values);
      
      if (hasNegatives) {
        return {
          structure: 'simple',
          type: 'normal',
          components: detection.suggestedComponents
        };
      } else {
        return {
          structure: 'simple',
          type: 'lognormal',
          components: detection.suggestedComponents
        };
      }
    }
    
    throw new Error('Unrecognized data format');
  }
  
  // Multimodality detection algorithm (unchanged)
  private static detectMultimodality(data: number[]): MultimodalityResult {
    const stats = this.computeDataStatistics(data);
    
    // Bimodality coefficient (Sarle's b)
    const bimodalityCoefficient = (stats.skewness ** 2 + 1) / 
      (stats.kurtosis + 3 * ((data.length - 1) ** 2) / ((data.length - 2) * (data.length - 3)));
    
    const evidence = {
      bimodalityCoefficient,
      kurtosis: stats.kurtosis,
      hasGaps: this.checkForGaps(data, stats)
    };
    
    // Determine components based on evidence
    const isMultimodal = (evidence.bimodalityCoefficient > 0.555 && 
                         evidence.kurtosis < 3) ||
                        (evidence.hasGaps && data.length > 50);
    
    return {
      isMultimodal,
      confidence: this.calculateConfidence(evidence),
      suggestedComponents: isMultimodal ? 2 : 1,
      evidence
    };
  }
}
```

### 0.4 Consolidate Model Selection (Day 5)
**Files**: `src/inference/selection/ModelSelection.ts`

All model comparison logic in ONE place:

```typescript
// ALL model comparison logic in ONE place
interface ComparisonCriterion {
  name: string;
  
  compare(models: Map<string, Posterior>, data: StandardData): ComparisonResult;
  
  requiresSampling: boolean;
  computationalCost: 'low' | 'medium' | 'high';
}

interface ComparisonResult {
  rankings: Array<{
    modelId: string;
    score: number;
    relativeProb?: number;
  }>;
  
  selected: string;
  
  diagnostics: {
    criterion: string;
    computationTime: number;
    confident: boolean;
  };
}

// Implement criteria
class WAIC implements ComparisonCriterion { /* existing implementation */ }
class BIC implements ComparisonCriterion { /* existing implementation */ }
class DIC implements ComparisonCriterion { /* new implementation */ }

// Service for comparing models
class ModelSelection {
  static async selectBest(
    candidates: ModelConfig[],
    data: StandardData,
    criterion: 'waic' | 'bic' | 'dic' = 'bic'
  ): Promise<ModelConfig> {
    // Only called when ModelRouter is ambiguous
    if (candidates.length === 1) return candidates[0];
    
    const results = await this.fitAll(candidates, data);
    return this.criteria[criterion].select(results);
  }
}
```

### 0.5 Simplify Worker Operations (Day 6)
**Files**: `src/infrastructure/WorkerOperation.ts`

```typescript
// Standardize ALL worker operations
export class WorkerOperation<TInput, TOutput> {
  constructor(
    private operation: string,
    private timeout: number = 30000
  ) {}
  
  async execute(input: TInput): Promise<TOutput> {
    // Uniform timeout, error handling, cleanup
    return this.pool.execute(this.operation, input, this.timeout);
  }
}

// Workers handle inference operations
// Sampling can be batched to avoid blocking without full worker implementation
```

### Why Foundation Replacement Matters

Your current WAIC integration revealed critical issues:
1. **Complex features have made simple cases complex**
2. **Distributions are coupled with inference logic** - blocks VI integration
3. **No capability declaration** - router can't make smart decisions
4. **Inconsistent worker patterns** - error handling varies

The foundation replacement fixes this by:
1. **Merging distributions into pure math** - Combine best of all sources into reusable primitives
2. **Data-driven routing** - Quality indicators computed once, used throughout
3. **Enforced interfaces** - No more missing methods breaking features
4. **Consolidated selection** - WAIC complexity contained to one module
5. **Simplified data model** - Just binomial and user-level types

## Phase 1: Foundation (Week 1)

### 1.1 Create Experiment Structure (Day 1-2)
**File**: `src/domain/types/ExperimentData.ts`

```typescript
// Define clear experiment structure
interface ExperimentData {
  variants: {
    control: VariantData;
    treatment: VariantData; // Single treatment first
  };
  
  metadata?: {
    name?: string;
    hypothesis?: string;
    startDate?: Date;
    endDate?: Date;
  };
}

interface VariantData {
  name: string;
  n: number;  // Always track sample size
  
  // Binary data (for aggregate conversion rates)
  binary?: {
    successes: number;
    trials: number;
  };
  
  // User-level data (handles all other cases)
  users?: UserLevelData[];
}

interface UserLevelData {
  userId: string;
  converted: boolean;
  value: number;
  features?: FeatureSet;  // Raw user attributes for segmentation
  timestamp?: Date;
}

interface FeatureSet {
  // User attributes (for future HTE)
  device?: 'mobile' | 'desktop' | 'tablet';
  browser?: string;
  dayOfWeek?: string;
  hour?: number;
  
  // Custom features
  [key: string]: any;
}
```

Also implement core data components:
- **Files**: `src/core/data/*`
  - CSVParser with auto-detection of data format
  - JSONParser for experiment data
  - FeatureTypes and FeatureRegistry
  - DataValidator with clear error messages

### 1.2 Basic Conversion Analysis (Day 3)
**File**: `src/domain/analyzers/ConversionAnalyzer.ts`

```typescript
class ConversionAnalyzer implements ExperimentAnalyzer {
  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    // Simple Beta-Binomial conjugate analysis
    const control = await this.fitBeta(data.variants.control);
    const treatment = await this.fitBeta(data.variants.treatment);
    
    // Calculate lift and uncertainty
    const lift = await this.calculateLift(control, treatment);
    
    return new ConversionResult({
      control: {
        rate: control.mean(),
        ci95: control.credibleInterval(0.95),
        posterior: control
      },
      treatment: {
        rate: treatment.mean(),
        ci95: treatment.credibleInterval(0.95),
        posterior: treatment
      },
      lift: {
        absolute: lift.absolute,
        relative: lift.relative,
        probability_positive: lift.probPositive
      }
    });
  }
  
  private async calculateLift(
    control: Posterior,
    treatment: Posterior,
    samples: number = 10000
  ): Promise<LiftResult> {
    // Use workers for sampling
    const sampler = new WorkerOperation<SampleRequest, number[]>('sample');
    
    const [controlSamples, treatmentSamples] = await Promise.all([
      sampler.execute({ posterior: control, n: samples }),
      sampler.execute({ posterior: treatment, n: samples })
    ]);
    
    // Compute lift statistics
    const absoluteLifts = treatmentSamples.map((t, i) => t - controlSamples[i]);
    const relativeLifts = treatmentSamples.map((t, i) => 
      controlSamples[i] > 0 ? (t - controlSamples[i]) / controlSamples[i] : 0
    );
    
    return {
      absolute: {
        mean: mean(absoluteLifts),
        ci95: quantiles(absoluteLifts, [0.025, 0.975])
      },
      relative: {
        mean: mean(relativeLifts),
        ci95: quantiles(relativeLifts, [0.025, 0.975])
      },
      probPositive: mean(absoluteLifts.map(l => l > 0))
    };
  }
}
```

### 1.3 Result Object Pattern (Day 4)
**File**: `src/domain/results/AnalysisResult.ts`

Following PyMC3's pattern: fit once, analyze many ways:

```typescript
abstract class AnalysisResult {
  constructor(protected metadata: ResultMetadata) {}
  
  // Shared functionality for all results
  abstract toJSON(): object;
  export(format: 'json' | 'csv' | 'pdf'): Promise<Blob> {
    // Shared export logic
  }
}

// Single variant result with runtime capability detection
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
  
  // Runtime checks based on posterior type
  getDecomposition(): EffectDecomposition | null {
    if (this.isCompoundPosterior(this.posterior)) {
      return {
        conversion: this.posterior.conversion.mean()[0],
        value: this.posterior.value.mean(),
        total: this.calculateTotal()
      };
    }
    return null;
  }
  
  getComponents(): ComponentInfo[] | null {
    return this.posterior.getComponents?.() || null;
  }
  
  summary(): VariantSummary {
    return {
      mean: this.posterior.mean(),
      credibleInterval: this.posterior.credibleInterval(),
      components: this.getComponents()
    };
  }
  
  private isCompoundPosterior(posterior: Posterior): posterior is CompoundPosterior {
    return 'conversion' in posterior && 'value' in posterior;
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
  
  summary(): ExperimentSummary {
    const variantSummaries = new Map<string, VariantSummary>();
    for (const [name, result] of this.variants) {
      variantSummaries.set(name, result.summary());
    }
    
    return {
      variants: variantSummaries,
      recommendation: this.generateRecommendation(),
      primaryMetric: this.calculatePrimaryMetric()
    };
  }
  
  async compareVariants(): Promise<Comparison> {
    // Cross-variant analysis
  }
  
  async discoverSegments(): Promise<Segment[]> {
    // Look for mixture components across variants
  }
  
  getVariantResult(name: string): VariantResult | undefined {
    return this.variants.get(name);
  }
        confidence: 'high',
        message: `Treatment shows ${(summary.lift.relative.mean * 100).toFixed(1)}% improvement with high confidence`
      };
    }
    // ... more cases
  }
  
  async compareVariants(): Promise<Comparison> {
    // Use workers for expensive computations
    const worker = new WorkerOperation<CompareRequest, Comparison>('compare');
    return worker.execute({
      control: this.posteriors.get('control'),
      treatment: this.posteriors.get('treatment')
    });
  }
}
```

## Phase 2: Business Models (Week 2)

### 2.1 Business Model Patterns Audit (Day 1)
**File**: `docs/business-patterns.md`

Catalog real patterns from different industries:
- **E-commerce**: conversion × revenue per customer
- **Subscription**: activation → retention → lifetime value
- **Content**: views × watch_time × ad_revenue  
- **B2B**: leads → qualified → closed × deal_size

Document assumptions and validate with real data.

### 2.2 Revenue Analysis (Day 2-3)
**File**: `src/domain/analyzers/RevenueAnalyzer.ts`

```typescript
class RevenueAnalyzer implements ExperimentAnalyzer {
  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    // Combine all variant data for routing decision
    const allUsers: UserLevelData[] = [];
    for (const variant of Object.values(data.variants)) {
      if (variant.users) {
        allUsers.push(...variant.users);
      }
    }
    
    // Route once on combined data
    const combinedData = this.toStandardData({
      n: allUsers.length,
      users: allUsers
    });
    const { config, engine } = await ModelRouter.route(combinedData, this.fitOptions);
    
    // Fit each variant and create VariantResults
    const variantResults = new Map<string, VariantResult>();
    for (const [name, variant] of Object.entries(data.variants)) {
      const variantData = this.toStandardData(variant);
      const result = await engine.fit(variantData, config, this.fitOptions);
      
      // Create VariantResult for each variant
      const variantResult = new VariantResult(result.posterior, {
        algorithm: result.metadata.algorithm,
        computeTime: result.metadata.computeTime,
        sampleSize: variant.n,
        modelStructure: config.structure
      });
      variantResults.set(name, variantResult);
    }
    
    // Compose into ExperimentResult
    return new ExperimentResult(variantResults, {
      experimentId: data.id,
      modelConfig: config,
      totalSamples: this.calculateTotalSamples(data)
    });
  }
  
  // Usage examples showing runtime capability discovery
  private async demonstrateUsage(result: ExperimentResult): Promise<void> {
    // Check if compound model was used
    const controlResult = result.getVariantResult('control');
    if (controlResult?.getDecomposition()) {
      console.log('Compound model: can analyze conversion + value effects');
      const decomp = controlResult.getDecomposition()!;
      console.log(`Conversion rate: ${decomp.conversion}`);
      console.log(`Average value: ${decomp.value}`);
    }
    
    // Check for customer segments
    const segments = await result.discoverSegments();
    if (segments.length > 0) {
      console.log(`Found ${segments.length} customer segments`);
    }
    
    // Standard comparison regardless of model type
    const comparison = await result.compareVariants();
    console.log(`Winning variant: ${comparison.winningVariant}`);
  }
  
  private async decomposeEffects(
    results: Map<string, CompoundPosterior>
  ): Promise<EffectDecomposition> {
    const control = results.get('control')!;
    const treatment = results.get('treatment')!;
    
    // Decompose total effect into frequency and severity
    const frequencyEffect = await this.calculateLift(
      control.frequency,
      treatment.frequency
    );
    
    const severityEffect = await this.calculateLift(
      control.severity,
      treatment.severity
    );
    
    // Total effect (assuming independence for now)
    const totalEffect = await this.calculateCompoundLift(control, treatment);
    
    return {
      total: totalEffect,
      frequency: frequencyEffect,
      severity: severityEffect,
      interaction: this.estimateInteraction(totalEffect, frequencyEffect, severityEffect)
    };
  }
}
```

### 2.3 Fluent API Design (Day 4)
**File**: `src/api/ExperimentBuilder.ts`

```typescript
// Natural API for common cases
class ExperimentBuilder {
  private data: Partial<ExperimentData> = {};
  private config: BuilderConfig = {};
  
  forMetric(metric: 'conversion' | 'revenue' | 'compound'): this {
    this.config.metric = metric;
    return this;
  }
  
  withControl(data: any): this {
    // Auto-parse various formats
    this.data.control = this.parseVariantData(data, 'control');
    return this;
  }
  
  withTreatment(data: any): this {
    this.data.treatment = this.parseVariantData(data, 'treatment');
    return this;
  }
  
  withPrior(prior: Distribution): this {
    this.config.prior = prior;
    return this;
  }
  
  withSegments(segments: string[]): this {
    this.config.segments = segments;
    return this;
  }
  
  async analyze(): Promise<ExperimentResult> {
    // Validate data
    const validation = this.validate();
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
    
    // Select analyzer based on metric
    const analyzer = this.selectAnalyzer();
    
    // Configure with options
    if (this.config.prior) {
      analyzer.configure({ priors: new Map([['default', this.config.prior]]) });
    }
    
    return analyzer.analyze(this.data as ExperimentData);
  }
  
  private parseVariantData(data: any, name: string): VariantData {
    // Handle various input formats
    if (typeof data === 'object' && 'successes' in data && 'trials' in data) {
      // Binomial format
      return {
        name,
        n: data.trials,
        binary: { successes: data.successes, trials: data.trials }
      };
    }
    
    if (Array.isArray(data) && data.length > 0) {
      if (typeof data[0] === 'number') {
        // Array of numbers -> user-level with everyone converted
        return {
          name,
          n: data.length,
          users: data.map((value, i) => ({
            userId: `${i}`,
            converted: true,
            value
          }))
        };
      }
      
      if ('userId' in data[0]) {
        // Already user-level format
        return { name, n: data.length, users: data };
      }
    }
    
    throw new Error(`Unrecognized data format for ${name}`);
  }
}

// Usage
const result = await new ExperimentBuilder()
  .forMetric('revenue')  // Auto-detects if compound needed
  .withControl(controlData)
  .withTreatment(treatmentData)
  .withPrior(informativePrior)
  .analyze();
```

### 2.4 Industry Presets (Day 5)
**File**: `src/domain/presets/IndustryPresets.ts`

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
    [metric: string]: Distribution;
  };
  
  minimumEffects: {
    [metric: string]: number;
  };
  
  segmentation?: {
    recommended: string[];
    avoid: string[];
  };
}

const ECOMMERCE_PRESET: IndustryPreset = {
  name: 'E-commerce',
  description: 'Standard e-commerce experiment setup',
  
  metrics: {
    primary: {
      name: 'revenue_per_user',
      type: 'revenue',  // Router will detect if compound needed
      modelHints: {
        expectZeros: true,  // Many users don't purchase
        expectMixture: true // Budget vs premium customers
      }
    },
    secondary: [
      { name: 'add_to_cart_rate', type: 'conversion' },
      { name: 'average_order_value', type: 'continuous' }
    ],
    guardrails: [
      { name: 'bounce_rate', type: 'conversion' },
      { name: 'page_load_time', type: 'continuous' }
    ]
  },
  
  priors: {
  conversion: new BetaDistribution(100, 900),      // ~10% baseline
  revenue: new LogNormalDistribution(3.5, 1.2),    // ~$30 AOV
  add_to_cart_rate: new BetaDistribution(200, 800) // ~20% baseline
},
  
  minimumEffects: {
    conversion: 0.02,     // 2% absolute
    revenue: 5,           // $5
    add_to_cart_rate: 0.03 // 3% absolute
  },
  
  segmentation: {
    recommended: ['device', 'new_vs_returning', 'traffic_source'],
    avoid: ['session_id'] // Too granular
  }
};
```

### 2.5 Prior Elicitation Implementation (Day 6)
**Files**: `src/domain/priors/*`

```typescript
// No Prior interface needed! Use Distribution directly
// Engines check compatibility via instanceof checks

// Example: Engine checks for compatible prior
class BetaBinomialConjugateEngine extends InferenceEngine {
  canHandle(config: ModelConfig, data: StandardData, fitOptions?: FitOptions): boolean {
    const baseCheck = this.matchesStructure(config) && this.matchesType(config);
    
    // Check prior compatibility
    if (fitOptions?.prior) {
      return baseCheck && fitOptions.prior instanceof BetaDistribution;
    }
    
    return baseCheck;
  }
}

// Prior elicitation from percentiles - returns distributions directly
class PriorElicitor {
  static fromPercentiles(
    p05: number,
    p95: number,
    distribution: 'conversion' | 'revenue' | 'count'
  ): Distribution {
    switch (distribution) {
      case 'conversion':
        // Use optimization to find beta parameters
        const { alpha, beta } = this.fitBetaFromPercentiles(p05, p95);
        return new BetaDistribution(alpha, beta);
        
      case 'revenue':
        // Fit log-normal to percentiles
        const { mu, sigma } = this.fitLogNormalFromPercentiles(p05, p95);
        return new LogNormalDistribution(mu, sigma);
        
      case 'count':
        // Fit gamma to percentiles
        const { shape, rate } = this.fitGammaFromPercentiles(p05, p95);
        return new GammaDistribution(shape, rate);
    }
  }
  
  private static fitBetaFromPercentiles(p05: number, p95: number): {alpha: number, beta: number} {
    // Optimization to find parameters
    // Initial guess based on method of moments
    const mean = (p05 + p95) / 2;
    const variance = ((p95 - p05) / 3.29) ** 2; // Approximate from normal
    
    // Starting values
    const v = mean * (1 - mean) / variance - 1;
    let alpha = mean * v;
    let beta = (1 - mean) * v;
    
    // Refine with optimization
    // ... optimization code
    
    return { alpha, beta };
  }
}
```

## Phase 2.5: Dependence Structure Research (Week 2.5)

**Critical**: Test and validate the independence assumption in compound models.

### Research Tasks (3 days)
**Files**: `research/dependence/*`

```typescript
// Test current independence assumption with simulated dependent data
class DependenceResearch {
  // Generate data with known dependence structure
  generateDependentData(correlation: number, n: number): UserLevelData[] {
    // Use copula to create dependent (conversion, revenue) pairs
    const copula = new GaussianCopula(correlation);
    const samples = copula.sample(n);
    
    // Transform to (conversion, revenue) space
    return samples.map(([u1, u2]) => ({
      userId: generateId(),
      converted: u1 > 0.5, // 50% baseline conversion
      value: u2 > 0 ? Math.exp(qnorm(u2) * 1.2 + 3.5) : 0 // Log-normal revenue
    }));
  }
  
  // Test impact on business decisions
  async testDecisionImpact() {
    const correlations = [-0.5, -0.2, 0, 0.2, 0.5];
    const results = [];
    
    for (const rho of correlations) {
      // Generate dependent data
      const data = this.generateDependentData(rho, 10000);
      
      // Fit with independence assumption
      const independentModel = await this.fitIndependent(data);
      
      // Fit with copula (if implemented)
      const copulaModel = await this.fitCopula(data);
      
      // Compare business decisions
      const decisions = {
        correlation: rho,
        independent: this.simulateDecision(independentModel),
        copula: this.simulateDecision(copulaModel),
        difference: this.compareDecisions(independentModel, copulaModel)
      };
      
      results.push(decisions);
    }
    
    return results;
  }
  
  // Prototype simple copula approach
  async prototypeCopula(): Promise<CopulaImplementation> {
    // Gaussian copula + existing marginals
    return {
      fit: async (data: UserLevelData[]) => {
        // 1. Fit marginals independently (existing code)
        const frequency = await this.fitFrequency(data);
        const severity = await this.fitSeverity(data);
        
        // 2. Estimate copula parameter (correlation)
        const correlation = this.estimateCorrelation(data, frequency, severity);
        
        // 3. Return joint model
        return new CopulaCompoundModel(frequency, severity, correlation);
      }
    };
  }
}

// Decision criteria
interface DependenceDecision {
  recommendation: 'keep_simple' | 'add_dependence';
  rationale: string[];
  evidence: {
    businessImpact: number;  // % change in decisions
    complexityIncrease: number; // Lines of code
    performanceImpact: number;  // ms slower
    interpretability: number;   // 1-10 scale
  };
}
```

### Deliverables
1. **Simulation study**: Impact of dependence on real business decisions
2. **Prototype implementation**: Simple Gaussian copula approach
3. **Recommendation**: Whether to add dependence modeling
4. **If yes**: Implementation plan for Phase 4

### 2.6 Power Analysis Framework (Week 3-4)

**Parallel simulation with worker pools:**

The power analysis framework will be the first major use of the new worker pool pattern:

```typescript
class PowerAnalysisEngine {
  private workerPool: WorkerPoolOperation<PowerAnalysisParams, PowerAnalysisResult>;
  
  async calculatePowerCurve(
    prior: BetaPosterior,
    effectSize: number,
    sampleSizes: number[],
    iterations: number = 10000
  ): Promise<PowerCurve> {
    // Create tasks for each sample size
    const tasks = sampleSizes.map(sampleSize => ({
      prior: { 
        alpha: prior.alpha, 
        beta: prior.beta 
      },
      effectSize,
      sampleSize,
      iterations: Math.floor(iterations / sampleSizes.length)
    }));
    
    // Run in parallel across worker pool
    const results = await this.workerPool.executeMany(
      tasks,
      (completed, total) => {
        console.log(`Power analysis: ${completed}/${total} complete`);
      }
    );
    
    return {
      sampleSizes,
      power: results.map(r => r.power)
    };
  }
}
```

**Benefits**:
- UI remains responsive during heavy computation
- Automatic scaling to available hardware
- Clean separation between computation and orchestration

## Phase 3: Heterogeneous Treatment Effects (Week 3)

**Key Insight**: Segments are user groupings for analyzing "who responds differently" to treatments, based on observable features like device type or behavior patterns. This is distinct from mixture components, which are statistical properties of value distributions.

### 3.1 Unified Segment Interface (Day 1-2)
**File**: `src/domain/segments/Segments.ts`

**Note**: Segments are user groupings for analyzing treatment effects, not mixture components. See `docs/InterfaceStandards.md` for the core interface definition.

```typescript
// Manual segments (hypothesis-driven)
class ManualSegmentation {
  constructor(private rules: SegmentationRule[]) {}
  
  extractSegments(data: ExperimentData): Segment[] {
    return this.rules.map(rule => this.applyRule(data, rule));
  }
  
  private applyRule(data: ExperimentData, rule: SegmentationRule): Segment {
    const members = this.filterByRule(data, rule);
    
    return {
      id: rule.id,
      name: rule.name,
      source: 'manual',
      definition: {
        selector: rule.selector,
        description: rule.description,
        features: rule.features
      },
      population: {
        size: members.length,
        percentage: members.length / this.totalSize(data)
      }
      // effect calculated later by analyzer
    };
  }
}

// Causal tree (discovered patterns)
class CausalTreeSegmentation {
  constructor(
    private constraints: CausalTreeConstraints = {
      maxDepth: 3,
      minSegmentSize: 0.10,
      minEffect: 0.02,
      honestSplitting: true
    }
  ) {}
  
  async extractSegments(data: ExperimentData): Promise<Segment[]> {
    const tree = await this.growTree(data);
    return tree.getLeafNodes().map(this.nodeToSegment);
  }
  
  private async growTree(data: ExperimentData): Promise<CausalTree> {
    const worker = new WorkerOperation<TreeRequest, CausalTree>('causalTree');
    
    return worker.execute({
      data,
      constraints: this.constraints,
      features: this.extractFeatures(data)
    });
  }
}
```

### 3.2 HTE Analysis Pipeline (Day 3-4)
**File**: `src/domain/analyzers/HTEAnalyzer.ts`

```typescript
class HTEAnalyzer {
  async analyze(
    result: ExperimentResult,
    data: ExperimentData
  ): Promise<HTEResult> {
    // Extract segments from two sources
    const manualSegments = this.extractManualSegments(data);
    const discoveredSegments = await this.discoverCausalTreeSegments(data);
    
    const allSegments = [...manualSegments, ...discoveredSegments];
    
    // Analyze each segment
    const segmentResults = await Promise.all(
      allSegments.map(seg => this.analyzeSegment(seg, data))
    );
    
    return new HTEResult({
      segments: segmentResults,
      overall: result
      // TODO: Design principled Bayesian approach for pattern discovery
    });
  }
  
  private extractManualSegments(data: ExperimentData): Segment[] {
    const segmenter = new ManualSegmentation(DEFAULT_RULES);
    return segmenter.extractSegments(data);
  }
  
  private async discoverCausalTreeSegments(data: ExperimentData): Promise<Segment[]> {
    const segmenter = new CausalTreeSegmentation();
    return segmenter.extractSegments(data);
  }
  
  private async analyzeSegment(
    segment: Segment,
    data: ExperimentData
  ): Promise<SegmentAnalysis> {
    // Filter data to segment
    const segmentData = this.filterToSegment(data, segment);
    
    // Run appropriate analyzer
    const analyzer = AnalyzerFactory.fromData(segmentData);
    const result = await analyzer.analyze(segmentData);
    
    return {
      segment,
      result,
      effect: this.calculateSegmentEffect(result),
      confidence: this.assessConfidence(segmentData, result)
    };
  }
  

}
```

### 3.3 Causal Tree Implementation (Day 5)
**File**: `src/domain/segments/CausalTree.ts`

```typescript
class CausalTree {
  constructor(
    private root: TreeNode,
    private constraints: CausalTreeConstraints
  ) {}
  
  static async grow(
    data: ExperimentData,
    constraints: CausalTreeConstraints
  ): Promise<CausalTree> {
    // Honest splitting: use half data for structure, half for estimation
    const [trainData, testData] = this.honestSplit(data);
    
    // Recursively grow tree
    const root = await this.growNode(trainData, testData, 0, constraints);
    
    // Prune to improve stability
    const prunedRoot = await this.prune(root, testData);
    
    return new CausalTree(prunedRoot, constraints);
  }
  
  private static async growNode(
    trainData: ExperimentData,
    testData: ExperimentData,
    depth: number,
    constraints: CausalTreeConstraints
  ): Promise<TreeNode> {
    // Check stopping criteria
    if (depth >= constraints.maxDepth ||
        this.sampleSize(trainData) < constraints.minSegmentSize * this.totalSize(trainData)) {
      return this.createLeaf(testData);
    }
    
    // Find best split
    const split = await this.findBestSplit(trainData, constraints);
    
    if (!split || split.improvement < constraints.minEffect) {
      return this.createLeaf(testData);
    }
    
    // Recursively split
    const [leftTrain, rightTrain] = this.applySplit(trainData, split);
    const [leftTest, rightTest] = this.applySplit(testData, split);
    
    const [leftChild, rightChild] = await Promise.all([
      this.growNode(leftTrain, leftTest, depth + 1, constraints),
      this.growNode(rightTrain, rightTest, depth + 1, constraints)
    ]);
    
    return {
      type: 'split',
      feature: split.feature,
      threshold: split.threshold,
      left: leftChild,
      right: rightChild,
      effect: this.estimateEffect(testData)
    };
  }
  
  private static async findBestSplit(
    data: ExperimentData,
    constraints: CausalTreeConstraints
  ): Promise<Split | null> {
    const features = this.extractFeatures(data);
    let bestSplit: Split | null = null;
    let bestImprovement = 0;
    
    // Try all features and thresholds
    for (const feature of features) {
      const thresholds = this.getCandidateThresholds(data, feature);
      
      for (const threshold of thresholds) {
        const split = { feature, threshold };
        const [left, right] = this.applySplit(data, split);
        
        // Skip if creates too-small segments
        if (this.sampleSize(left) < constraints.minSegmentSize * this.totalSize(data) ||
            this.sampleSize(right) < constraints.minSegmentSize * this.totalSize(data)) {
          continue;
        }
        
        // Calculate improvement in treatment effect heterogeneity
        const improvement = await this.calculateImprovement(data, left, right);
        
        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestSplit = { ...split, improvement };
        }
      }
    }
    
    return bestSplit;
  }
}
```

### 3.4 Bootstrap Validation (Day 6)
**File**: `src/domain/validation/Bootstrap.ts`

```typescript
class BootstrapValidator {
  constructor(
    private iterations: number = 200,
    private strata?: StratificationRules
  ) {}
  
  async validateSegments(
    segments: Segment[],
    data: ExperimentData
  ): Promise<ValidationResult> {
    const results = await this.runBootstrap(segments, data);
    
    return {
      segments: segments.map(seg => ({
        segment: seg,
        stability: this.calculateStability(seg, results),
        frequency: this.calculateFrequency(seg, results),
        effectVariability: this.calculateEffectVariability(seg, results)
      })),
      
      overall: {
        stableSegments: this.identifyStable(results),
        recommendation: this.generateRecommendation(results)
      }
    };
  }
  
  private async runBootstrap(
    segments: Segment[],
    data: ExperimentData
  ): Promise<BootstrapRun[]> {
    // Use worker pool for parallel bootstrap
    const chunks = this.chunkIterations(this.iterations);
    
    const worker = new WorkerOperation<BootstrapRequest, BootstrapRun[]>('bootstrap');
    
    const results = await Promise.all(
      chunks.map(chunk => 
        worker.execute({
          data,
          segments,
          iterations: chunk.size,
          seed: chunk.seed,
          strata: this.strata
        })
      )
    );
    
    return results.flat();
  }
  
  private calculateStability(segment: Segment, runs: BootstrapRun[]): number {
    // How often does this segment appear in bootstrap samples?
    const appearances = runs.filter(run => 
      run.segments.some(s => this.isSameSegment(s, segment))
    ).length;
    
    return appearances / runs.length;
  }
  
  private calculateEffectVariability(segment: Segment, runs: BootstrapRun[]): Uncertainty {
    // Extract effect estimates across runs
    const effects = runs
      .map(run => run.segments.find(s => this.isSameSegment(s, segment)))
      .filter(Boolean)
      .map(s => s!.effect.estimate);
    
    return {
      mean: mean(effects),
      std: std(effects),
      ci95: quantiles(effects, [0.025, 0.975])
    };
  }
}
```

## Phase 4: Production Polish (Week 4)

### 4.1 Error Recovery (Day 1)
**File**: `src/infrastructure/ErrorRecovery.ts`

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
      throw new RecoverableError(error, fallbacks);
    }
  }
}

// Pre-defined fallback strategies
class SimplifyModelFallback implements FallbackStrategy {
  canHandle(error: Error): boolean {
    return error instanceof ConvergenceError ||
           error instanceof InsufficientDataError;
  }
  
  async recover(error: Error): Promise<any> {
    // Try simpler model (e.g., k=1 instead of k=2)
    console.warn('Model failed to converge, trying simpler model');
    
    if (error instanceof ConvergenceError) {
      const simpler = {
        ...error.config,
        components: 1  // Reduce to single component
      };
      return ModelRouter.refit(error.data, simpler);
    }
  }
}

// Usage in analyzer
async analyze(data: ExperimentData): Promise<ExperimentResult> {
  return ErrorRecovery.withRecovery(
    () => this.primaryAnalysis(data),
    [
      new SimplifyModelFallback(),     // Try simpler model
      new IncreaseDataFallback(),      // Request more data
      new UseDefaultsFallback()        // Use conservative defaults
    ]
  );
}
```

### 4.2 Progress & Cancellation (Day 2)
**File**: `src/infrastructure/Progress.ts`

```typescript
class ProgressTracker {
  private abortController = new AbortController();
  private startTime = Date.now();
  
  async trackOperation<T>(
    operation: (progress: ProgressReporter) => Promise<T>,
    onProgress: (update: ProgressUpdate) => void
  ): Promise<T> {
    const reporter = new ProgressReporter(onProgress, this.startTime);
    
    try {
      return await operation(reporter);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new OperationCancelled();
      }
      throw error;
    }
  }
  
  cancel(): void {
    this.abortController.abort();
  }
}

// Usage in HTE analysis
const tracker = new ProgressTracker();
const resultPromise = tracker.trackOperation(
  async (progress) => {
    progress.start(100, 'Starting HTE analysis...');
    
    progress.update(10, 'Extracting manual segments...');
    const manualSegments = await extractManualSegments(data);
    
    progress.update(30, 'Discovering mixture components...');
    const mixtureSegments = await extractMixtureSegments(data);
    
    progress.update(50, 'Growing causal tree...');
    const treeSegments = await growCausalTree(data, progress.createSubReporter(30));
    
    progress.update(80, 'Validating segments...');
    const validated = await validateSegments(allSegments);
    
    progress.update(95, 'Generating insights...');
    const insights = await generateInsights(validated);
    
    progress.complete();
    return insights;
  },
  (update) => updateUI(update)
);
```

### 4.3 Export & Sharing (Day 3)
**File**: `src/export/ExportService.ts`

```typescript
interface ExportFormat {
  format: 'json' | 'csv' | 'html' | 'python' | 'r';
  includePosteriors: boolean;
  includeRawData: boolean;
  includeVisualizations: boolean;
}

class ExportService {
  async export(
    result: AnalysisResult,
    format: ExportFormat
  ): Promise<ExportResult> {
    switch (format.format) {
      case 'json':
        return this.exportJSON(result, format);
      
      case 'html':
        return this.exportInteractiveHTML(result, format);
        
      case 'python':
        return this.exportPythonNotebook(result, format);
        
      case 'r':
        return this.exportRScript(result, format);
    }
  }
  
  private async exportPythonNotebook(
    result: AnalysisResult,
    options: ExportFormat
  ): Promise<ExportResult> {
    const notebook = {
      cells: [
        this.createMarkdownCell('# Experiment Analysis Results'),
        this.createMarkdownCell(`Generated by Tyche on ${new Date().toISOString()}`),
        
        // Setup
        this.createCodeCell([
          'import pandas as pd',
          'import numpy as np',
          'import matplotlib.pyplot as plt',
          'import seaborn as sns',
          'from scipy import stats'
        ].join('\n')),
        
        // Data
        this.createCodeCell(this.exportDataAsPython(result)),
        
        // Results
        this.createMarkdownCell('## Summary Statistics'),
        this.createCodeCell(this.exportSummaryAsPython(result)),
        
        // Posteriors (if requested)
        ...(options.includePosteriors ? [
          this.createMarkdownCell('## Posterior Distributions'),
          this.createCodeCell(this.exportPosteriorsAsPython(result))
        ] : []),
        
        // Visualizations
        this.createMarkdownCell('## Visualizations'),
        this.createCodeCell(this.exportVisualizationsAsPython(result))
      ]
    };
    
    return {
      content: JSON.stringify(notebook, null, 2),
      mimeType: 'application/x-ipynb+json',
      filename: `analysis_${result.metadata.timestamp.getTime()}.ipynb`
    };
  }
}
```

### 4.4 Natural Language Insights (Day 4)
**File**: `src/domain/insights/InsightGenerator.ts`

```typescript
class InsightGenerator {
  generate(result: AnalysisResult): NaturalLanguageInsights {
    const insights: Insight[] = [];
    
    // Primary finding
    insights.push(this.generatePrimaryInsight(result));
    
    // Surprising findings
    if (this.hasSurprise(result)) {
      insights.push(this.generateSurpriseInsight(result));
    }
    
    // Segment insights - check capabilities at runtime
    if (result instanceof ExperimentResult) {
      const segments = await result.discoverSegments();
      if (segments.length > 0) {
        insights.push(...this.generateSegmentInsights(result, segments));
      }
    }
    
    // Recommendations
    insights.push(this.generateRecommendation(result));
    
    return {
      insights,
      confidence: this.assessOverallConfidence(result),
      caveats: this.identifyCaveats(result)
    };
  }
  
  private generatePrimaryInsight(result: AnalysisResult): Insight {
    const summary = result.summary();
    
    // For ExperimentResult, check if any variant has decomposition capability
    if (result instanceof ExperimentResult) {
      const controlResult = result.getVariantResult('control');
      const decomposition = controlResult?.getDecomposition();
      
      if (decomposition) {
      
      // Identify primary driver
      const frequencyImpact = Math.abs(decomposition.frequency.relative.mean);
      const severityImpact = Math.abs(decomposition.severity.relative.mean);
      
      if (frequencyImpact > severityImpact * 2) {
        return {
          type: 'primary',
          text: `The ${(decomposition.total.relative.mean * 100).toFixed(1)}% improvement in revenue is primarily driven by more customers converting (${(decomposition.frequency.relative.mean * 100).toFixed(1)}% increase in conversion rate).`,
          importance: 'high',
          visualization: 'compound_decomposition'
        };
      } else if (severityImpact > frequencyImpact * 2) {
        return {
          type: 'primary', 
          text: `The ${(decomposition.total.relative.mean * 100).toFixed(1)}% improvement in revenue is primarily driven by higher spending per customer (${(decomposition.severity.relative.mean * 100).toFixed(1)}% increase in average order value).`,
          importance: 'high',
          visualization: 'compound_decomposition'
        };
      } else {
        return {
          type: 'primary',
          text: `The ${(decomposition.total.relative.mean * 100).toFixed(1)}% improvement in revenue comes from both more customers converting (${(decomposition.frequency.relative.mean * 100).toFixed(1)}%) and higher spending per customer (${(decomposition.severity.relative.mean * 100).toFixed(1)}%).`,
          importance: 'high',
          visualization: 'compound_decomposition'
        };
      }
    }
    
    // Default for simple results
    return {
      type: 'primary',
      text: this.describePrimaryEffect(summary),
      importance: 'high',
      visualization: 'effect_distribution'
    };
  }
  
  private generateSegmentInsights(result: HTEResult): Insight[] {
    const insights: Insight[] = [];
    const segments = result.getStableSegments();
    
    // Find segments with largest effects
    const sortedByEffect = segments
      .filter(s => s.effect.significant)
      .sort((a, b) => Math.abs(b.effect.estimate) - Math.abs(a.effect.estimate));
    
    if (sortedByEffect.length > 0) {
      const best = sortedByEffect[0];
      insights.push({
        type: 'segment',
        text: `${best.segment.name} shows the strongest response with ${(best.effect.estimate * 100).toFixed(1)}% improvement, representing ${(best.segment.population.percentage * 100).toFixed(0)}% of users.`,
        importance: 'high',
        segment: best.segment,
        visualization: 'segment_effects'
      });
    }
    
    // Find surprising patterns
    const patterns = result.getPatterns();
    for (const pattern of patterns.slice(0, 2)) {
      insights.push({
        type: 'pattern',
        text: pattern.description,
        importance: 'medium',
        visualization: 'pattern_detail'
      });
    }
    
    return insights;
  }
}
```

### 4.5 Interactive Visualizations (Day 5)
**File**: `src/application/ui/visualizations/InteractiveDistribution.ts`

Transform existing visualizations into interactive workhorses:

```typescript
class InteractiveDistributionPlot implements Visualization {
  private svg: d3.Selection<SVGElement>;
  private scales: { x: d3.Scale, y: d3.Scale };
  private brush: d3.Brush;
  
  constructor(
    private container: HTMLElement,
    private options: VisualizationOptions = {}
  ) {
    this.initialize();
  }
  
  render(data: DistributionData): void {
    // Clear previous
    this.clear();
    
    // Render distribution
    this.renderDistribution(data);
    
    // Add interactivity
    this.addBrush();
    this.addTooltips();
    this.addRangeSelector();
    
    // Mobile optimizations
    if (this.isMobile()) {
      this.optimizeForMobile();
    }
  }
  
  private addRangeSelector(): void {
    // Allow selecting ranges to see conditional statistics
    this.brush = d3.brushX()
      .extent([[0, 0], [this.width, this.height]])
      .on('end', this.onBrushEnd.bind(this));
    
    this.svg.append('g')
      .attr('class', 'brush')
      .call(this.brush);
  }
  
  private onBrushEnd(event: d3.BrushEvent): void {
    if (!event.selection) return;
    
    const [x0, x1] = event.selection.map(this.scales.x.invert);
    
    // Calculate conditional statistics
    const stats = this.calculateConditionalStats(x0, x1);
    
    // Emit event for other components
    this.emit('rangeSelected', { range: [x0, x1], stats });
    
    // Update display
    this.showConditionalStats(stats);
  }
  
  private calculateConditionalStats(min: number, max: number): ConditionalStats {
    // For current distribution, calculate:
    // - P(min < X < max)
    // - E[X | min < X < max]
    // - Comparison with other variant
    
    return {
      probability: this.data.cdf(max) - this.data.cdf(min),
      conditionalMean: this.data.conditionalMean(min, max),
      percentOfTotal: this.getPercentInRange(min, max)
    };
  }
}

// Embeddable bundle
export class TycheViz {
  static renderDistribution(
    container: string | HTMLElement,
    data: any,
    options?: any
  ): InteractiveDistributionPlot {
    const element = typeof container === 'string' 
      ? document.querySelector(container) 
      : container;
      
    return new InteractiveDistributionPlot(element, options).render(data);
  }
}

// Usage on external site:
// <script src="https://cdn.tyche.ai/viz.js"></script>
// <div id="plot"></div>
// <script>
//   TycheViz.renderDistribution('#plot', data);
// </script>
```

### 4.6 Documentation & Demo (Day 6)

Update all README files with clear examples:

**`src/inference/README.md`**:
```markdown
# Inference Layer

Core statistical algorithms. Used by domain analyzers, not directly by users.

## Architecture

- **Pure distributions** in `/core/distributions/` - mathematical primitives only
- **Inference engines** - actual fitting algorithms (conjugate, EM, VI)
- **Model routing** - automatic selection based on data characteristics

## Current State
- ✅ Conjugate updates (Beta, Gamma, Normal)
- ✅ EM algorithms (mixtures)
- ✅ Compound models
- ⚠️ VI engine (preserved but not integrated)

## Usage

Used internally by domain analyzers:
```typescript
// Don't use directly
const engine = new InferenceEngine();

// Use through domain API
const result = await tyche.conversionTest(data).analyze();
```

## Adding New Models

1. Implement distribution in `/core/distributions/`
2. Add inference engine
3. Declare capabilities
4. Update ModelRouter
```

Create comprehensive demo app showcasing the full journey:
```typescript
// Demo app showing progression
const demo = {
  // Step 1: Simple A/B test
  basicConversion: async () => {
    const result = await tyche
      .experiment(conversionData)
      .forMetric('conversion')
      .analyze();
    
    showResult(result.summary());
  },
  
  // Step 2: Revenue with decomposition
  revenueAnalysis: async () => {
    const result = await tyche
      .experiment(revenueData)
      .forMetric('revenue')
      .analyze();
    
    showDecomposition(result.getDecomposition());
    showCustomerTiers(result.getCustomerTiers());
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
    const result = await tyche
      .experiment(fullData)
      .forMetric('compound')
      .analyze();
    
    const hte = await result.analyzeHTE({
      sources: ['manual', 'mixture', 'causal_tree'],
      constraints: { maxDepth: 3, minSize: 0.10 }
    });
    
    showHTEPatterns(hte);
  }
};
```

## Success Criteria

### Week 0 Success (Foundation Replacement)
- [ ] All distributions merged into pure mathematical objects
- [ ] Data quality indicators standardized in StandardData
- [ ] Router replaced with capability-based approach
- [ ] Worker operations standardized with clear roles
- [ ] WAIC complexity contained to ModelSelection module
- [ ] Comparison infrastructure implemented (WAIC, BIC, DIC)
- [ ] Data model simplified to binomial and user-level

### Week 1 Success
- [ ] Basic A/B test comparison works end-to-end
- [ ] Can calculate lift with uncertainty
- [ ] Business interpretation included
- [ ] Core data handling implemented (parsers, features, validation)
- [ ] UserLevelData properly supports features for future HTE

### Week 2 Success  
- [ ] Business model patterns documented
- [ ] Revenue experiments with decomposition
- [ ] Fluent API feels natural
- [ ] Customer tier detection via mixtures
- [ ] At least one preset implemented
- [ ] Prior elicitation implemented with distributions
- [ ] Prior elicitation from percentiles working

### Week 2.5 Success (Dependence Research)
- [ ] Independence assumption tested with simulated data
- [ ] Simple copula prototype implemented
- [ ] Business impact measured (not just statistical fit)
- [ ] Decision made: keep simple or add dependence modeling

### Week 3 Success
- [ ] Unified Segment interface implemented
- [ ] Manual segmentation working
- [ ] Causal tree structure implemented with constraints
- [ ] Mixture segments extracted from compound models
- [ ] All segment types analyzed through same pipeline
- [ ] Bootstrap validation functional
- [ ] Cross-segment insights generated

### Week 4 Success
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Interactive distribution visualizations working
- [ ] Embeddable visualization bundle created
- [ ] Demo app showcasing full progression
- [ ] Natural language insights generating useful explanations
- [ ] Export to Python/R notebooks working
- [ ] Ready for user feedback

## Analysis Capability Progression

The implementation builds capabilities incrementally:

```
Week 0: Foundation Replacement (CRITICAL)
├── Merge distributions from multiple sources
├── Model capabilities declaration
├── Replace router with capability-based approach
├── Consolidate model selection (WAIC, BIC, DIC)
├── Simplify data model to 2 types
└── Standardize worker operations

Week 1: Basic A/B Testing
├── Simple conversion comparison (Beta-Binomial)
├── Effect sizes with uncertainty
├── Business interpretations
└── Data validation and parsing

Week 2: Business Analysis  
├── Revenue = Conversion × Value decomposition
├── Mixture models for customer tiers
├── Industry presets (e-commerce, SaaS)
├── Prior elicitation (returns distributions)
└── Fluent API

Week 2.5: Dependence Research
├── Test independence assumption
├── Prototype copula approach
├── Measure business impact
└── Make decision on complexity vs value

Week 3: Segmentation & HTE
├── Unified Segment interface (all sources)
├── Manual segments (hypothesis-driven)
├── Causal tree discovery (data-driven patterns)  
├── Mixture segments (value distribution tiers)
├── Bootstrap validation
└── Cross-segment comparison

Week 4: Polish & Integration
├── Error recovery strategies
├── Progress tracking and cancellation
├── Export to multiple formats
├── Natural language insights
├── Interactive visualizations
├── Embeddable visualization bundle
└── Complete demo app
```

## Key Principles Throughout

1. **Incremental Replacement**: Replace foundation pieces one at a time
2. **Isolate Changes**: Each replacement should minimize impact on other systems
3. **Test Continuously**: Keep the test suite green during replacement
4. **User-First**: Every change improves the user experience
5. **Document as You Go**: Update docs with each change
6. **Preserve Working Code**: Don't delete anything until replacement is proven

## Technical Debt Being Addressed

Your current pain points and their solutions:

1. **WAIC Integration Complexity** → Isolated to ModelSelection module
2. **Model Type Explosion** → Reduced to 5 core types with composition
3. **Worker Inconsistency** → Standardized WorkerOperation pattern
4. **Missing posteriors.logPdf** → Enforced by Distribution interface
5. **Coupled inference/math** → Separated into pure functions
6. **Unclear routing logic** → Data quality indicators drive decisions
7. **Three data types** → Simplified to just two

## The Foundation Replacement Payoff

After Week 0 foundation replacement:
```typescript
// Simple case (90%): Instant capability-based routing
tyche.conversionTest(data).analyze()  // No WAIC overhead

// Complex case (10%): WAIC when it adds value  
tyche.revenueExperiment(data)
  .withMixtureDetection()  // Uses WAIC for component selection
  .analyze()

// Everything flows through clean interfaces
// No more "simple cases made complex by advanced features"
```

This achieves your vision: **"Simple cases simple, complex cases possible"** through architecture, not just UI.