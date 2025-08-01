# Tyche: Technical Architecture

## Architecture Overview

Tyche follows a domain-driven architecture with opinionated analyzers for specific business use cases, rather than a generic framework. Each layer has clear responsibilities with data flowing up through analysis to presentation.

```
┌─────────────────────────────────────────────────────┐
│                  Application Layer                   │
│          (UI, Export, Visualization, API)           │
├─────────────────────────────────────────────────────┤
│               Domain Analysis Layer                  │
│  (RevenueAnalyzer, ConversionAnalyzer, Presets)    │
├─────────────────────────────────────────────────────┤
│                Statistical Layer                     │
│       (Inference, Posteriors, Comparisons)          │
├─────────────────────────────────────────────────────┤
│                   Core Layer                         │
│     (Distributions, Numerics, Data Types)           │
├─────────────────────────────────────────────────────┤
│                Infrastructure Layer                  │
│         (Workers, Browser Storage, Utils)           │
└─────────────────────────────────────────────────────┘
```

## Data Flow: User Call to Results

Let's trace exactly what happens when a user analyzes an experiment:

```typescript
// User code
const result = await tyche
  .experiment(data)
  .forMetric('revenue')
  .analyze();
```

### Step 1: Builder Validates & Parses Data
```typescript
// ExperimentBuilder.withControl(data)
- Detects data format (binomial vs user-level)
- Converts to StandardData
- Validates quality (sample size, data integrity, support, etc.)
- Stores in builder state
```

### Step 2: Analyzer Selection
```typescript
// Builder.forMetric('revenue')
- Creates RevenueAnalyzer instance
- Analyzer declares what it handles
- No routing yet - that happens during analysis
```

### Step 3: Analysis Begins
```typescript
// RevenueAnalyzer.analyze(experimentData)
1. Combine all variant data into single dataset
2. Convert combined data → StandardData (for routing decision)
3. Call ModelRouter.route(standardData, fitOptions)
```

### Step 4: Model Routing & Engine Selection
```typescript
// ModelRouter.route(standardData, fitOptions)
1. Examine data once:
   - Data type (binomial vs user-level)
   - Has zeros? (→ compound structure needed)
   - Has negatives? (→ affects distribution choice)
   - Sample size and quality features generated earlier.

2. Determine ModelConfig:
   - Binomial → { structure: 'simple', type: 'beta' }
   - User-level with zeros → { structure: 'compound', conversionType: 'beta', valueType: 'lognormal', valueComponents: k }
   - User-level no zeros → { structure: 'simple', type: 'lognormal', components: k }
   
   Where k is determined by multimodality detection on the relevant values. Can select other types of value distributions as default based on simple heuristic tests run here or fitting all options and comparing in step 3.

3. Select compatible engine:
   - Check each engine.canHandle(config, data, fitOptions)
   - Prior compatibility is part of engine check
   - Return first compatible engine (prioritized by algorithm type)
   - Optional: If config.type or config.valueType is an array, can fit multiple models and use comparison (WAIC/BIC) to select best

4. Return both config and selected engine
```

### Step 5: Apply to Each Variant
```typescript
// RevenueAnalyzer applies same config/engine to each variant
1. For each variant:
   - Convert variant data → StandardData (individual variant, not combined)
   - Call engine.fit(variantData, config, fitOptions)
   - Store posterior in results map
```

### Step 6: Result Construction
```typescript
// RevenueAnalyzer builds unified result structure
1. Fit each variant and create VariantResult objects
2. Compose VariantResults into ExperimentResult
3. Capabilities determined by posterior type at runtime:
   - CompoundPosterior → getDecomposition() returns data
   - MixturePosterior → getComponents() returns segments
   - SimplePosterior → both return null
```

### Step 7: User Explores Results
```typescript
// Rich result object enables many analyses
result.summary()                          // Immediate
result.compareVariants()                  // Cross-variant analysis
result.discoverSegments()                 // Find mixture segments, async
result.getVariantResult('treatment')      // Access individual variants
  .getDecomposition()                     // Compound model breakdown
result.export('pdf')                      // Generate static report
```

## Layer Specifications

### Core Layer
**Purpose**: Mathematical primitives and fundamental data structures

**Key Components**:
- **Distributions**: Pure mathematical objects (pdf, cdf, sample)
- **Data Types**: Just two - `binomial` and `user-level`
- **Parsers**: Convert various formats to StandardData
- **Validators**: Ensure data quality

```typescript
// Simplified data model
type DataType = 'binomial' | 'user-level';

interface StandardData {
  type: DataType;
  n: number;
  
  // For binomial (aggregate)
  binomial?: {
    successes: number;
    trials: number;
  };
  
  // For everything else
  userLevel?: {
    users: UserLevelData[];
    empiricalStats?: EmpiricalStats;
  };
  
  // Quality indicators
  quality: DataQuality;
}

// Distributions are pure math (no inference logic)
interface Distribution {
  // Pure math only
  pdf(x: number): number;
  logPdf(x: number): number;
  cdf(x: number): number;
  mean(): number;
  variance(): number;

  sample(rng: RNG): number;

}
```

### Statistical Layer
**Purpose**: Inference algorithms and posterior representations

**Key Components**:
- **Inference Algorithms**: Conjugate, EM, VI, MCMC implementations
- **Model Structure**: `simple` (direct) or `compound` (zero-inflated process)
- **Model Type**: `beta`, `lognormal`, `normal`, `gamma`, etc.
- **Data Quality**: Indicators computed once and used for routing
- **Inference Engines**: Actual fitting algorithms

```typescript
// Clear separation of structure from type
interface ModelConfig {
  structure: 'simple' | 'compound';
  
  // For simple models
  type?: ModelType;        // beta, lognormal, etc.
  components?: number;     // 1 for single, 2+ for mixture
  
  // For compound models a.k.a. frequency x severity (value) models
  frequencyType?: 'beta'; // Always beta for now
  valueType?: ModelType;   // Type for positive values
  valueComponents?: number;
}

// Model types are the actual distributions
// We'll support more in the future for things like watch time, arrival data
type ModelType = 'beta' | 'lognormal' | 'normal' | 'gamma';

interface FitOptions {
  prior?: Distribution;             // Prior distribution
  maxIterations?: number;           // For iterative algorithms
  tolerance?: number;               // Convergence threshold
  progressCallback?: (p: number) => void;
}

// Engines have built-in capabilities
abstract class InferenceEngine {
  abstract readonly capabilities: EngineCapabilities;
  // An InferenceEngine determines if it can fit a particular combination of modelconfig, standarddata and fitoptions objects using its own logic. These three pieces of information will determine what distributions are selected, how they are composed into a InferenceResult object and what other optional arguments might be used.
  
  canHandle(config: ModelConfig, data: StandardData, fitOptions?: FitOptions): boolean {
    // Check if this engine can handle the config
    return this.matchesStructure(config) &&
           this.matchesType(config) &&
           this.meetsDataRequirements(data) &&
           this.supportsPrior(fitOptions?.prior);
  }
  
  abstract async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult>;
}

// Example engine with capabilities
class BetaBinomialConjugateEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['simple'],
    types: ['beta'],
    dataTypes: ['binomial'],
    exact: true,
    fast: true,
    components: 1  // Only single component
  };
  
  fit(data: StandardData, config: ModelConfig, options?: FitOptions): Promise<InferenceResult> {
    // Conjugate update implementation
  }
}

class CompoundInferenceEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['compound'],
    types: [],  // Compound is a structure that composes other types
    dataTypes: ['user-level'],
    exact: false,  // Depends on sub-engines used
    fast: true,
    requiresValueType: true
  };
  
  fit(data: StandardData, config: ModelConfig, options?: FitOptions): Promise<InferenceResult> {
    // Delegate to sub-engines for each part
  }
}
```

### Domain Analysis Layer
**Purpose**: Business-specific analysis patterns

**Key Components**:
- **Analyzers**: Opinionated for specific metrics
- **Presets**: Industry-specific defaults
- **Results**: Rich objects for exploration

```typescript
// Experiment analyzers compare variants - always return ExperimentResult
interface ExperimentAnalyzer {
  analyze(data: ExperimentData): Promise<ExperimentResult>;
}

// Single-dataset analyzers for non-experimental analysis - return VariantResult
interface DatasetAnalyzer {
  analyze(data: StandardData): Promise<VariantResult>;
}

// Example: Learn empirical priors from historical data
class PriorLearner implements DatasetAnalyzer {
  async analyze(data: StandardData): Promise<VariantResult> {
    const { config, engine } = await ModelRouter.route(data);
    const result = await engine.fit(data, config);
    
    // Return VariantResult - can extract Distribution later if needed
    return new VariantResult(result.posterior, {
      algorithm: result.metadata.algorithm,
      computeTime: result.metadata.computeTime,
      sampleSize: data.n,
      purpose: 'prior_learning'
    });
  }
  
  // Helper method to extract Distribution for use as prior
  extractPrior(result: VariantResult): Distribution {
    return this.posteriorToDistribution(result.getPosterior());
  }
}
```

```typescript
// Analyzers encapsulate business logic
class RevenueAnalyzer implements ExperimentAnalyzer {
  private fitOptions?: FitOptions;
  
  configure(options: AnalyzerOptions): void {
    if (options.priors?.has('revenue')) {
      this.fitOptions = {
        prior: options.priors.get('revenue'),
        ...options.computeOptions
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
      
      // Each variant gets its own VariantResult
      const variantResult = new VariantResult(result.posterior, {
        algorithm: result.metadata.algorithm,
        computeTime: result.metadata.computeTime,
        sampleSize: variant.n
      });
      variantResults.set(name, variantResult);
    }
    
    // 4. Compose into unified ExperimentResult
    return new ExperimentResult(variantResults, {
      experimentId: data.id,
      modelConfig: config,
      totalSamples: this.calculateTotalSamples(data)
    });
  }
}

// Usage: Capabilities discovered at runtime
const result = await analyzer.analyze(experimentData);

// Check if compound model was used
if (result.getVariantResult('control')?.getDecomposition()) {
  console.log('Compound model: conversion + value effects');
}

// Check for customer segments
const segments = await result.discoverSegments();
if (segments.length > 0) {
  console.log(`Found ${segments.length} customer segments`);
}
  
  async discoverSegments(): Promise<Segment[]> {
    // Run HTE analysis
  }
}
```

### Application Layer
**Purpose**: User interaction and external interfaces

**Key Components**:
- **Fluent API**: Natural experiment building
- **Visualizations**: Interactive exploration
- **Export**: Multiple format support

## Model Selection Architecture

The system uses smart defaults with capability-based routing:

```typescript
class ModelRouter {
  // Maintained list of available engines
  private static engines = [
    new BetaBinomialConjugateEngine(),
    new LogNormalConjugateEngine(),
    new LogNormalEMEngine(),
    new CompoundInferenceEngine(),
    // Future: new VIEngine(), new MCMCEngine()
  ];
  
  static async route(
    data: StandardData,
    fitOptions?: FitOptions
  ): Promise<{ config: ModelConfig, engine: InferenceEngine }> {
    // Step 1: Determine model configuration from data (one time)
    const config = this.determineConfig(data);
    
    // Step 2: Find compatible engine (considers prior if present)
    const engine = this.selectEngine(config, data, fitOptions);
    
    // Future enhancement: If multiple model types specified,
    // could fit all and use WAIC/BIC to select best
    
    return { config, engine };
  }
  
  private static determineConfig(data: StandardData): ModelConfig {
    // Handle binomial data
    if (data.type === 'binomial') {
      return { structure: 'simple', type: 'beta' };
    }
    
    // Handle user-level data
    const users = data.userLevel!.users;
    const hasZeros = data.quality.hasZeros;
    const hasNegatives = data.quality.hasNegatives;
    
    // Zeros → Compound structure
    if (hasZeros) {
      const positiveValues = users
        .filter(u => u.converted && u.value > 0)
        .map(u => u.value);
      
      // Check for multimodality in positive values
      const components = this.detectComponents(positiveValues);
      
      return {
        structure: 'compound',
        conversionType: 'beta',
        valueType: hasNegatives ? 'normal' : 'lognormal',
        valueComponents: components
      };
    }
    
    // No zeros → Simple structure
    const values = users.map(u => u.value);
    const components = this.detectComponents(values);
    
    return {
      structure: 'simple',
      type: hasNegatives ? 'normal' : 'lognormal',
      components
    };
  }
  
  private static selectEngine(
    config: ModelConfig,
    data: StandardData,
    fitOptions?: FitOptions
  ): InferenceEngine {
    // Find compatible engines
    const compatible = this.engines
      .filter(engine => engine.canHandle(config, data, fitOptions))
      .sort((a, b) => {
        // Prioritize by algorithm type
        const priority = { conjugate: 0, em: 1, vi: 2, mcmc: 3 };
        return priority[a.algorithm] - priority[b.algorithm];
      });
    
    if (compatible.length === 0) {
      // this error could be improved with our error patterns.
      throw new Error(`No engine available for ${JSON.stringify(config)}`);
    }
    
    return compatible[0];
  }
  
  private static detectComponents(values: number[]): number {
    // Implementation detail - uses statistical tests to detect multimodality
    // Returns 1 for single mode, 2+ for multimodal distributions
    // Exact method left to implementer -- should only trigger in extreme case
    return this.runMultimodalityDetection(values);
  }
}

// Example engine with capabilities
class LogNormalConjugateEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['simple'],
    types: ['lognormal'],
    dataTypes: ['user-level'],
    components: 1,  // Only single component
    exact: true,
    fast: true
  };
  
  canHandle(config: ModelConfig, data: StandardData, fitOptions?: FitOptions): boolean {
    // Basic compatibility
    if (!super.canHandle(config, data, fitOptions)) return false;
    
    // Check prior compatibility
    if (fitOptions?.prior) {
      // Conjugate engine requires NormalInverseGamma distribution
      return fitOptions.prior instanceof NormalInverseGammaDistribution;
    }
    
    return true;
  }
}
```

## Worker Architecture

All expensive operations use standardized worker pattern:

```typescript
class WorkerOperation<TInput, TOutput> {
  constructor(
    private operation: string,
    private timeout: number = 30000
  ) {}
  
  async execute(input: TInput): Promise<TOutput> {
    return this.pool.execute(this.operation, input, {
      timeout: this.timeout,
      onProgress: this.handleProgress
    });
  }
}

// Operations that run in workers:
// - Long-running inference task (ie: fit)
// - Bootstrap validation
// - Causal tree growing
// - Segment analysis
// - Export generation
```

## Key Architectural Decisions

### Two Data Types Only
Instead of binomial/continuous/user-level:
- **Binomial**: Aggregate data (2 numbers)
- **User-level**: Everything else

"Continuous" is just user-level where everyone converted. This dramatically simplifies the mental model.

### Model Structure vs Type
Clear separation:
- **Structure**: How we handle zeros (`simple` or `compound`)
- **Type**: The distribution family (`beta`, `lognormal`, etc.)

### Capability-Based Routing
- 90% of cases resolved by simple rules
- Model comparison (WAIC/BIC) only when ambiguous
- Engines declare capabilities, router matches

### Domain-Driven Analyzers
- `RevenueAnalyzer` knows about customer tiers
- `ConversionAnalyzer` handles binary outcomes
- Each encapsulates best practices, returns customized results objects.

### Result Object Pattern
- Fit once, analyze many ways
- Expensive operations on demand
- Progressive disclosure of capabilities

### No Global State
Everything is independently instantiable and testable.

### No Plugin System
New capabilities added by extending domain analyzers.

### Browser-First Design
All architectural decisions optimize for browser constraints.

## Performance Characteristics

| Operation | Typical Time | Strategy |
|-----------|-------------|----------|
| Beta-Binomial | <1ms | Main thread |
| LogNormal (k=1) | <10ms | Main thread |
| EM Algorithm (k=2) | 50-100ms | Main thread |
| Causal Tree | 10-60s | Worker pool |
| VI Inference | 5-20s | Worker pool |
| Export Generation | 1-5s | Single worker |

## Architecture Principles

1. **Opinionated Over Generic**: Domain analyzers encode best practices
2. **Layered Not Monolithic**: Clear boundaries, no cross-layer reaching
3. **Results Over Callbacks**: Rich result objects enable exploration
4. **Browser-First Design**: Optimize for JavaScript and memory limits
5. **Progressive Complexity**: Simple by default, power when needed
6. **Capability-Based**: Models declare abilities, routing is automatic

This architecture enables PhD-level analysis while maintaining simplicity and accessibility for users who just want reliable experiment results.