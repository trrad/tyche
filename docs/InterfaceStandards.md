# Tyche Interface Standards

## Table of Contents
1. [Overview](#overview)
2. [Data Interfaces](#data-interfaces)
3. [Model Configuration](#model-configuration)
4. [Statistical Interfaces](#statistical-interfaces)
5. [Analysis Interfaces](#analysis-interfaces)
6. [Infrastructure Interfaces](#infrastructure-interfaces)
7. [API Design](#api-design)
8. [Type Guards & Utilities](#type-guards--utilities)

## Overview

This document defines the core interfaces that ensure consistency across Tyche. These interfaces are purposefully constrained to support our specific mission of experiment analysis.

## Data Interfaces

### Core Data Model

We use only TWO data types throughout the system:

```typescript
type DataType = 'binomial' | 'user-level';

interface StandardData {
  type: DataType;
  n: number;  // Always required
  
  // Binomial: Just 2 numbers (aggregate)
  binomial?: {
    successes: number;
    trials: number;
  };
  
  // User-level: Everything else
  userLevel?: {
    users: UserLevelData[];
    empiricalStats?: EmpiricalStats;  // Pre-computed for efficiency
  };
  
  // Quality indicators for routing
  quality: {
    hasZeros: boolean;     // Key for compound model selection
    hasNegatives: boolean; // Determines distribution family
    hasOutliers: boolean;
    missingData: number;
  };
}

interface UserLevelData {
  userId: string;
  converted: boolean;
  value: number;  // 0 if not converted
  
  // For future segmentation
  features?: FeatureSet;
  timestamp?: Date;
}

interface FeatureSet {
  // Standard features
  device?: 'mobile' | 'desktop' | 'tablet';
  browser?: string;
  dayOfWeek?: string;
  hour?: number;
  
  // Custom features
  [key: string]: any;
}
```

**Key Insight**: "Continuous" data is just user-level where everyone converted. This simplifies everything.

### Experiment Structure

```typescript
interface ExperimentData {
  id: string;
  name: string;
  
  variants: {
    control: VariantData;
    treatments: Map<string, VariantData>;  // Multiple treatments supported
  };
  
  metadata: {
    startDate: Date;
    endDate?: Date;
    hypothesis: string;
    minimumPracticalEffect?: Record<string, number>;
  };
}

interface VariantData {
  name: string;
  n: number;  // Always track sample size
  
  // One of these will be present
  binary?: BinomialData;
  users?: UserLevelData[];
}

interface BinomialData {
  successes: number;
  trials: number;
}
```

## Model Configuration

### Clear Structure vs Type Separation

```typescript
// Model structure: How we handle the data
type ModelStructure = 'simple' | 'compound';

// Model type: Which distribution family
type ModelType = 'beta' | 'lognormal' | 'normal' | 'gamma';

interface ModelConfig {
  structure: ModelStructure;
  
  // For simple models
  type?: ModelType;
  components?: number;  // 1 for single, 2+ for mixture
  
  // For compound models (zero-inflated)
  conversionType?: 'beta';    // Always beta for conversion
  valueType?: ModelType;       // Distribution for positive values
  valueComponents?: number;    // Components in value distribution
  
  // Note: We use 'valueType' and 'valueComponents' for compound models
  // to make it clear these apply to the value distribution only.
  // The conversion part is always single-component Beta.
}

// Examples:
// Simple conversion: { structure: 'simple', type: 'beta' }
// Revenue with tiers: { structure: 'simple', type: 'lognormal', components: 2 }
// Zero-inflated revenue: { 
//   structure: 'compound',
//   conversionType: 'beta',
//   valueType: 'lognormal',
//   valueComponents: 1
// }
// Zero-inflated revenue with tiers: { 
//   structure: 'compound',
//   conversionType: 'beta',
//   valueType: 'lognormal',
//   valueComponents: 2
// }
```

## Statistical Interfaces

### Pure Distributions

Distributions are mathematical objects

```typescript
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

// Implementation pattern
class LogNormalDistribution implements Distribution {
  constructor(private mu: number, private sigma: number) {}
  
  // Pure math only
  pdf(x: number): number {
    if (x <= 0) return 0;
    const logX = Math.log(x);
    return Math.exp(-0.5 * ((logX - this.mu) / this.sigma) ** 2) / 
           (x * this.sigma * Math.sqrt(2 * Math.PI));
  }
  
  mean(): number {
    return Math.exp(this.mu + this.sigma ** 2 / 2);
  }
  
  variance(): number {
    const m = this.mean();
    return m * m * (Math.exp(this.sigma ** 2) - 1);
  }
  
  // ... other pure math methods
}

// Philosophy: Priors ARE distributions
// No separate interface needed - engines check compatibility directly
```

### Posteriors

All posteriors implement this interface:

```typescript
interface Posterior {
  // Required methods
  mean(): number[];                              // Per component
  variance(): number[];                          // Per component
  sample(n?: number): Promise<number[]>;         // Via worker (optional)
  credibleInterval(level?: number): Array<[number, number]>;
  logPdf(data: number): number;                  // Required for comparison
  
  // Optional for mixtures
  getComponents?(): ComponentInfo[];
  
  // Optional for efficiency
  mode?(): number[];
  quantile?(q: number): number;
}

interface ComponentInfo {
  weight: number;
  mean: number;
  variance: number;
  parameters: Record<string, number>;  // Distribution-specific
}

// Compound posteriors compose two distributions
interface CompoundPosterior extends Posterior {
  conversion: Posterior;  // Beta posterior
  value: Posterior;       // Value distribution posterior
  
  // Assumes independence (see research task)
  mean(): number[] {
    const pConvert = this.conversion.mean()[0];
    const valueMeans = this.value.mean();
    return valueMeans.map(v => pConvert * v);
  }
}
```

### Inference Engines

Engines declare capabilities and implement fitting:

```typescript
interface EngineCapabilities {
  structures: ModelStructure[];      // What structures handled
  types: ModelType[];               // What types handled  
  dataTypes: DataType[];            // What data types accepted
  components: number[] | 'any';     // Supported component counts
  
  // Performance characteristics
  exact: boolean;
  fast: boolean;  // <100ms typical
  stable: boolean;
}

abstract class InferenceEngine {
  abstract readonly capabilities: EngineCapabilities;
  abstract readonly algorithm: 'conjugate' | 'em' | 'vi' | 'mcmc';
  
  canHandle(config: ModelConfig, data: StandardData, fitOptions?: FitOptions): boolean {
    return this.matchesStructure(config.structure) &&
           this.matchesType(config.type) && // supports valueType for compound
           this.matchesData(data.type) &&
           this.supportsComponents(config.components || 1) &&
           this.supportsPrior(fitOptions?.prior);
  }
  
  abstract async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult>;
}

interface FitOptions {
  prior?: Distribution;  // Just use Distribution directly
  maxIterations?: number;
  tolerance?: number;
  progressCallback?: (progress: number) => void;
}

interface InferenceResult {
  posterior: Posterior;
  diagnostics: {
    converged: boolean;
    iterations?: number;
    logLikelihood?: number;
  };
  metadata?: {
    algorithm: string;
    computeTime: number;
    warnings?: string[];
  };
}

// No Prior interface needed! 
// Priors are just distributions, and engines handle compatibility checking
```

## Analysis Interfaces

### Domain Analyzers

Business-focused analyzers with clear responsibilities:

```typescript
interface ExperimentAnalyzer {
  analyze(data: ExperimentData): Promise<ExperimentResult>;
  
  // Optional configuration
  configure?(options: AnalyzerOptions): void;
}

interface DatasetAnalyzer {
  analyze(data: StandardData): Promise<VariantResult>;
  
  // Optional configuration
  configure?(options: AnalyzerOptions): void;
}

interface AnalyzerOptions {
  priors?: Map<string, Distribution>;
  minimumPracticalEffect?: number;
  progressCallback?: (progress: number) => void;
}

// Concrete example - ExperimentAnalyzer returns ExperimentResult
class RevenueAnalyzer implements ExperimentAnalyzer<ExperimentResult> {
  private fitOptions?: FitOptions;
  
  configure(options: AnalyzerOptions): void {
    if (options.priors?.has('revenue')) {
      this.fitOptions = {
        prior: options.priors.get('revenue')
      };
    }
  }
  
  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    // 1. Combine all variant data for routing
    const allUsers: UserLevelData[] = [];
    for (const variant of Object.values(data.variants)) {
      if (variant.users) {
        allUsers.push(...variant.users);
      }
    }
    
    // 2. Route once on combined data
    const combinedData = this.toStandardData({
      n: allUsers.length,
      users: allUsers
    });
    const { config, engine } = await ModelRouter.route(
      combinedData,
      this.fitOptions
    );
    
    // 3. Fit each variant and create VariantResults
    const variantResults = new Map<string, VariantResult>();
    for (const [name, variant] of Object.entries(data.variants)) {
      const variantData = this.toStandardData(variant);
      const result = await engine.fit(variantData, config, this.fitOptions);
      
      // Create VariantResult for each variant
      const variantResult = new VariantResult(
        result.posterior, 
        { 
          algorithm: result.metadata.algorithm,
          computeTime: result.metadata.computeTime,
          sampleSize: variant.n
        }
      );
      variantResults.set(name, variantResult);
    }
    
    // 4. Compose into ExperimentResult (no type-specific classes needed)
    return new ExperimentResult(variantResults, {
      experimentId: data.id,
      modelConfig: config,
      totalSamples: data.variants.control.n + 
        Array.from(data.variants.treatments.values()).reduce((sum, t) => sum + t.n, 0)
    });
  }
}

// Example DatasetAnalyzer returns VariantResult directly
class PriorLearner implements DatasetAnalyzer<VariantResult> {
  async analyze(data: StandardData): Promise<VariantResult> {
    const { config, engine } = await ModelRouter.route(data);
    const result = await engine.fit(data, config);
    
    return new VariantResult(result.posterior, {
      algorithm: result.metadata.algorithm,
      computeTime: result.metadata.computeTime,
      sampleSize: data.n
    });
  }
}
```

### Analysis Results

Rich result objects following "fit once, analyze many ways":

```typescript
interface ResultMetadata {
  // Always present
  timestamp: Date;
  
  // Inference details (from VariantResult level)
  algorithm?: string;
  computeTime?: number;
  converged?: boolean;
  iterations?: number;
  sampleSize?: number;
  
  // Experiment details (from ExperimentResult level)
  experimentId?: string;
  experimentName?: string;
  
  // Flexible fields
  warnings?: string[];
  [key: string]: any;  // Allow extension
}

abstract class AnalysisResult {
  constructor(protected metadata: ResultMetadata) {}
  
  // Shared functionality for serialization, export, etc.
  abstract toJSON(): object;
  export(format: 'json' | 'csv' | 'pdf'): Promise<Blob> {
    // Shared export logic
  }
}

// Single variant analysis result
class VariantResult extends AnalysisResult {
  constructor(
    private posterior: Posterior,
    metadata: ResultMetadata
  ) {
    super(metadata);
  }
  
  // Access to posterior
  getPosterior(): Posterior {
    return this.posterior;
  }
  
  // Runtime type checking based on posterior capabilities
  getDecomposition(): EffectDecomposition | null {
    if (this.isCompoundPosterior(this.posterior)) {
      return {
        total: this.calculateTotalEffect(),
        conversion: this.posterior.conversion.mean()[0],
        value: this.posterior.value.mean()
      };
    }
    return null;
  }
  
  getComponents(): ComponentInfo[] | null {
    if (this.posterior.getComponents) {
      return this.posterior.getComponents();
    }
    return null;
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
  
  toJSON(): object {
    return {
      summary: this.summary(),
      decomposition: this.getDecomposition(),
      components: this.getComponents(),
      metadata: this.metadata
    };
  }
}

// Multi-variant experiment analysis result
class ExperimentResult extends AnalysisResult {
  constructor(
    private variants: Map<string, VariantResult>,
    metadata: ResultMetadata
  ) {
    super(metadata);
  }
  
  // Core analysis methods
  summary(): ResultSummary {
    const variantSummaries = new Map<string, VariantSummary>();
    for (const [name, result] of this.variants) {
      variantSummaries.set(name, result.summary());
    }
    
    return {
      variants: variantSummaries,
      primaryComparison: this.calculatePrimaryComparison(),
      recommendation: this.generateRecommendation()
    };
  }
  
  async compareVariants(): Promise<Comparison> {
    // Compare all variants against control
    const control = this.variants.get('control');
    if (!control) throw new Error('No control variant found');
    
    const comparisons = new Map<string, VariantComparison>();
    for (const [name, variant] of this.variants) {
      if (name !== 'control') {
        comparisons.set(name, await this.compareTwo(control, variant));
      }
    }
    
    return { comparisons, winningVariant: this.findWinner() };
  }
  
  async discoverSegments(): Promise<HTEResult> {
    // Delegate to HTE analyzer for segment discovery and analysis
    const hteAnalyzer = new HTEAnalyzer();
    return hteAnalyzer.analyze(this, this.experimentData);
  }
  
  async calculatePower(scenarios: PowerScenario[]): Promise<PowerResults> {
    // Power analysis across scenarios
    return this.powerAnalysis.calculate(this.variants, scenarios);
  }
  
  // Access to variant results
  getVariantResult(name: string): VariantResult | undefined {
    return this.variants.get(name);
  }
  
  getVariantResults(): Map<string, VariantResult> {
    return new Map(this.variants);  // Defensive copy
  }
  
  toJSON(): object {
    const variantData: Record<string, object> = {};
    for (const [name, result] of this.variants) {
      variantData[name] = result.toJSON();
    }
    
    return {
      summary: this.summary(),
      variants: variantData,
      metadata: this.metadata
    };
  }
}

interface EffectEstimate {
  estimate: number;
  uncertainty: [number, number];  // Credible interval
  probabilityPositive: number;
}

interface ResultSummary {
  variants: Map<string, VariantSummary>;
  primaryComparison: {  // Always control vs best treatment
    control: string;
    treatment: string;
    lift: EffectEstimate;
  };
  recommendation: string;
}
```

### Heterogeneous Treatment Effects (HTE)

**Important**: Do not confuse segments with mixture components:
- **Mixture components**: Statistical properties of value distributions (e.g., "high spenders vs low spenders")
- **Segments**: User groupings based on observable features for analyzing treatment effects (e.g., "mobile vs desktop users")

Segments are user groupings for analyzing differential treatment effects:

```typescript
interface Segment {
  id: string;
  name: string;
  source: 'manual' | 'causal_tree';
  
  definition: {
    // How to identify members based on observable features
    selector: (user: UserLevelData) => boolean;
    description: string;
    features?: string[];  // Which features define this segment
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

// Core analyzer interface
class HTEAnalyzer {
  async analyze(
    result: ExperimentResult,
    data: ExperimentData
  ): Promise<HTEResult> {
    // Implementation details in docs/ImplementationRoadmap.md Phase 3
  }
}
```

## Infrastructure Interfaces

### Worker Operations

Standardized pattern for all worker operations:

```typescript
class WorkerOperation<TRequest, TResponse> {
  constructor(
    private operation: string,
    private timeout: number = 30000
  ) {}
  
  async execute(request: TRequest): Promise<TResponse> {
    // Handles:
    // - Timeout enforcement
    // - Error propagation  
    // - Progress reporting
    // - Memory cleanup
    return this.pool.execute(this.operation, request, {
      timeout: this.timeout,
      signal: this.abortController.signal
    });
  }
  
  cancel(): void {
    this.abortController.abort();
  }
}

// Standard operations
const WORKER_OPERATIONS = {
  fit: new WorkerOperation<FitRequest, InferenceResult>('fit'),
  bootstrap: new WorkerOperation<BootstrapRequest, BootstrapResult>('bootstrap'),
  causalTree: new WorkerOperation<TreeRequest, CausalTree>('causalTree'),
  export: new WorkerOperation<ExportRequest, Blob>('export')
};
```

### Progress Reporting

For long-running operations:

```typescript
interface ProgressReporter {
  start(total?: number): void;
  update(current: number, message?: string): void;
  complete(): void;
  
  // For nested operations
  createSubReporter(weight: number): ProgressReporter;
}

interface ProgressUpdate {
  current: number;
  total?: number;
  percentage?: number;
  message?: string;
  elapsed: number;
  remaining?: number;
}
```

## API Design

### Fluent Builder Pattern

Natural API for experiment building:

```typescript
class ExperimentBuilder {
  private data: Partial<ExperimentData> = {};
  private options: BuilderOptions = {};
  
  forMetric(metric: MetricType): this {
    this.options.metric = metric;
    return this;
  }
  
  withControl(data: any): this {
    this.data.control = this.parseVariantData(data);
    return this;
  }
  
  withTreatment(name: string, data: any): this {
    this.data.treatments = this.data.treatments || new Map();
    this.data.treatments.set(name, this.parseVariantData(data));
    return this;
  }
  
  withPrior(distribution: string, prior: Distribution): this {
    this.options.priors = this.options.priors || new Map();
    this.options.priors.set(distribution, prior);
    return this;
  }
  
  async analyze(): Promise<ExperimentResult> {
    // Validate
    const validation = this.validate();
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }
    
    // Select analyzer
    const analyzer = AnalyzerFactory.create(this.options.metric);
    
    // Configure
    if (this.options.priors) {
      analyzer.configure({ priors: this.options.priors });
    }
    
    // Analyze
    return analyzer.analyze(this.data as ExperimentData);
  }
  
  private parseVariantData(data: any): VariantData {
    // Auto-detect format
    if (this.isBinomialData(data)) {
      return {
        name: 'variant',
        n: data.trials,
        binary: data
      };
    }
    
    if (this.isUserLevelData(data)) {
      return {
        name: 'variant',
        n: data.length,
        users: data
      };
    }
    
    if (Array.isArray(data) && typeof data[0] === 'number') {
      // Convert number array to user-level
      return {
        name: 'variant',
        n: data.length,
        users: data.map((value, i) => ({
          userId: String(i),
          converted: true,
          value
        }))
      };
    }
    
    throw new Error('Unrecognized data format');
  }
}
```

## Type Guards & Utilities

### Data Type Guards

```typescript
// Check data types
function isBinomialData(data: any): data is BinomialData {
  return typeof data === 'object' &&
         'successes' in data &&
         'trials' in data &&
         typeof data.successes === 'number' &&
         typeof data.trials === 'number';
}

function isUserLevelData(data: any): data is UserLevelData[] {
  return Array.isArray(data) &&
         data.length > 0 &&
         data.every(item => 
           'userId' in item &&
           'converted' in item &&
           'value' in item
         );
}

// Check model structures
function isCompoundModel(config: ModelConfig): boolean {
  return config.structure === 'compound';
}

function needsCompoundModel(data: StandardData): boolean {
  return data.quality.hasZeros && 
         data.type === 'user-level';
}
```

### Result Type Guards

```typescript
// Check result capabilities at runtime
function hasDecomposition(result: VariantResult): boolean {
  return result.getDecomposition() !== null;
}

function hasComponents(result: VariantResult): boolean {
  return result.getComponents() !== null && 
         result.getComponents()!.length > 1;
}

function isCompoundExperiment(result: ExperimentResult): boolean {
  const controlResult = result.getVariantResult('control');
  return controlResult ? hasDecomposition(controlResult) : false;
}

function hasMixtureSegments(result: ExperimentResult): boolean {
  for (const variantResult of result.getVariantResults().values()) {
    if (hasComponents(variantResult)) {
      return true;
    }
  }
  return false;
}

// Check posterior capabilities directly
function hasMixtureComponents(posterior: Posterior): boolean {
  return 'getComponents' in posterior &&
         typeof posterior.getComponents === 'function';
}
```

### Conversion Utilities

```typescript
class DataConverter {
  static toStandard(data: any): StandardData {
    if (isBinomialData(data)) {
      return {
        type: 'binomial',
        n: data.trials,
        binomial: data,
        quality: {
          hasZeros: false,
          hasNegatives: false,
          hasOutliers: false,
          missingData: 0
        }
      };
    }
    
    if (isUserLevelData(data)) {
      return this.userLevelToStandard(data);
    }
    
    if (Array.isArray(data) && typeof data[0] === 'number') {
      const users = data.map((value, i) => ({
        userId: String(i),
        converted: true,
        value
      }));
      return this.userLevelToStandard(users);
    }
    
    throw new Error('Cannot convert to StandardData');
  }
  
  private static userLevelToStandard(users: UserLevelData[]): StandardData {
    const values = users.map(u => u.value);
    
    return {
      type: 'user-level',
      n: users.length,
      userLevel: {
        users,
        empiricalStats: this.computeStats(values)
      },
      quality: {
        hasZeros: values.some(v => v === 0),
        hasNegatives: values.some(v => v < 0),
        hasOutliers: this.detectOutliers(values),
        missingData: users.filter(u => u.value === null).length
      }
    };
  }
}
```

## Interface Design Principles

1. **Minimal Surface Area**: Each interface does one thing well
2. **Composition Over Inheritance**: Small interfaces compose into systems
3. **Type Safety**: Leverage TypeScript's type system fully
4. **Fail Fast**: Validate early and clearly
5. **Progressive Disclosure**: Simple cases use simple interfaces

## Common Patterns

### Builder Pattern
Used for complex object construction with validation.

### Factory Pattern
Used for selecting appropriate implementations based on data.

### Strategy Pattern
Used for swappable algorithms (inference engines).

### Observer Pattern
Used for progress reporting and cancellation.

### Result Object Pattern
Rich objects that enable further analysis after initial fitting.

These interfaces form the contract system that ensures Tyche remains consistent, type-safe, and extensible while keeping simple cases simple and complex cases possible.