# Tyche Roadmap Issues - Structured Format

# Total: 27 issues across 5 phases (0-4)

issues:

# ==================== PHASE 0: Foundation Alignment ====================

- id: "0.1"
  title: "Core Error Handling"
  phase: 0
  priority: P0
  labels: ['phase-0', 'foundation', 'errors']
  size: M

  description: |
  Implement consistent error handling from the start using TycheError class and error code system. This must come first because every other component will throw errors using this system. Starting with proper error handling prevents technical debt and inconsistent error patterns spreading through the codebase.

  All subsequent issues should use TycheError for error handling.

  tasks:
  - "Create TycheError class extending Error with error context support"
  - "Define ErrorCode enum with all error types"
  - "Ensure stack trace preservation"

  codeSnippets: |
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

  files:
  toCreate: - "src/core/errors/TycheError.ts"

- id: "0.2"
  title: "Standardize Data Model"
  phase: 0
  priority: P0
  labels: ['phase-0', 'foundation', 'data-model']
  size: L

  description: |
  Create StandardData with just two types as defined in InterfaceStandards.md. Every StandardData object includes quality indicators that help with routing.

  DataQuality indicators are computed once and used for routing decisions throughout the pipeline, avoiding repeated analysis of the same data.

  Existing tests use various data formats - update incrementally as we touch each test file rather than a big-bang migration.

  tasks:
  - "Create StandardData and DataQuality interfaces"
  - "Add quality indicator computation (hasZeros, hasNegatives, hasOutliers)"
  - "Implement multimodality detection for mixture model routing"
  - "Convert all code to use StandardData"
  - "Add UserLevelData feature support for future HTE"
  - "Remove redundant data type definitions"

  codeSnippets: |
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

  files:
  toCreate: - "src/core/data/StandardData.ts"

- id: "0.3a"
  title: "Distribution Implementation Audit"
  phase: 0
  priority: P0
  labels: ['phase-0', 'investigation']
  size: M

  description: |
  Audit existing implementations BEFORE consolidation. Document all existing distribution implementations to plan consolidation strategy.

  Deliverable: Create `docs/distribution-audit.md` with a table showing each distribution, where it's implemented, what methods exist, and what's coupled to inference logic.

  This audit is complete when we can see exactly what code to preserve vs. refactor in 0.3b.

  tasks:
  - "Audit Beta implementations across `/inference/`, `/core/`, `vi-engine.ts`"
  - "Audit Normal implementations and identify gaps"
  - "Audit LogNormal implementations (Bayesian vs simple)"
  - "Audit Gamma implementations (not integrated yet)"
  - "Document which have logPdf, which don't"
  - "Identify coupling patterns (inference logic mixed with math)"
  - "Create consolidation plan in distribution-audit.md"

  files:
  toCreate: - "docs/distribution-audit.md"

- id: "0.3b"
  title: "Pure Distribution Objects"
  phase: 0
  priority: P0
  labels: ['phase-0', 'foundation', 'distributions']
  size: L
  dependsOn: ["0.3a"]

  description: |
  Currently distributions are scattered across `/inference/`, `/core/`, and `vi-engine.ts` with inference logic mixed into mathematical operations. This coupling makes it impossible to reuse distributions in new contexts and makes testing difficult.

  Create pure mathematical distribution objects with no inference logic mixed in. Distributions handle only math, separate from inference engines.

  The mathematical implementations in these files are correct - we're extracting and consolidating them, not rewriting the math.

  tasks:
  - "Merge implementations from `/inference/`, `/core/distributions/`, `vi-engine.ts`"
  - "Add missing logPdf implementations (technical debt from roadmap)"
  - "Remove all inference logic from distributions"
  - "Ensure consistent interface across all distributions"
  - "Create Beta, LogNormal, Normal, Gamma as pure math"
  - "Update all imports (this will touch many files)"

  codeSnippets: |
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

  files:
  toCreate: - "src/core/distributions/\*.ts"

- id: "0.4"
  title: "Model Configuration & Routing"
  phase: 0
  priority: P0
  labels: ['phase-0', 'foundation', 'routing']
  size: M
  dependsOn: ["0.3b", "0.2"]

  description: |
  Implement capability-based routing using data quality indicators. Clear separation of structure vs type per InterfaceStandards.md.

  Uses DataQuality from 0.2 and pure distributions from 0.3b. This router is the bridge between data and inference engines.

  Replaces current hardcoded if/else chains in various analyzers with a single routing decision point.

  tasks:
  - "Implement capability-based routing using DataQuality"
  - "Remove hardcoded model selection logic"
  - "Create ModelSelection module for WAIC/BIC/DIC (contain complexity)"

  codeSnippets: |
  // Clear separation of structure vs type per InterfaceStandards.md
  interface ModelConfig {
  structure: 'simple' | 'compound';

      // For simple models
      type?: 'beta' | 'lognormal' | 'normal' | 'gamma'; // Plus future additions
      components?: number;  // 1 for single, 2+ for mixture

      // For compound models (zero-inflated)
      frequencyType?: 'beta';    // Always beta for frequency
      valueType?: ModelType;      // Distribution for positive values
      valueComponents?: number;   // Components in value distribution

  }

  class ModelRouter {
  static async route(
  data: StandardData,
  fitOptions?: FitOptions
  ): Promise<{ config: ModelConfig; engine: InferenceEngine }> {
  // Uses data quality indicators for routing decisions
  }
  }

  files:
  toCreate: - "src/inference/ModelRouter.ts"

# ==================== PHASE 1: Statistical Layer ====================

- id: "1.1"
  title: "Standardize Inference Engines"
  phase: 1
  priority: P0
  labels: ['phase-1', 'inference', 'architecture']
  size: M
  dependsOn: ["0.3b", "0.4"]

  description: |
  Create abstract InferenceEngine class that all inference engines extend. This establishes the pattern for capability declaration and fitting.

  This abstraction enables the router from 0.4 to select appropriate engines based on their declared capabilities.

  tasks:
  - "Create abstract InferenceEngine class"
  - "Update all engines to extend InferenceEngine"
  - "Implement canHandle() for each engine"
  - "Standardize InferenceResult format"
  - "Ensure all engines declare capabilities"

  codeSnippets: |
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

  files:
  toCreate: - "src/inference/engines/InferenceEngine.ts"

- id: "1.1b"
  title: "Migrate Existing Engines to New Architecture"
  phase: 1
  priority: P0
  labels: ['phase-1', 'migration', 'inference']
  size: L
  dependsOn: ["1.1"]

  description: |
  Migrate existing inference engines to the new architecture pattern. Priority order focuses on revenue-critical engines.

  tasks:
  - "Migrate BetaBinomialConjugate to new pattern"
  - "Rename LogNormalBayesian → LogNormalConjugate for consistency"
  - "Rename/complete NormalNormal → NormalConjugate for consistency"
  - "Migrate Normal and LogNormal Mixture EM engines"
  - "Defer: GammaExponentialConjugate (exists but not integrated)"
  - "Defer: VI engine wrapper (future phase)"

  files:
  mentioned: - "src/inference/engines/\*.ts"

- id: "1.1c"
  title: "Upgrade Mixture Models to Full VBEM"
  phase: 1
  priority: P1
  labels: ['phase-1', 'inference']
  size: M
  dependsOn: ["1.1b"]

  description: |
  Replace point estimate mixture weights with proper Bayesian treatment using Variational Bayes EM (VBEM) to maintain uncertainty over weights.

  We're accepting the complexity of VBEM over simple EM to maintain proper uncertainty quantification in mixture weights, which is essential for our Bayesian approach.

  tasks:
  - "Add Dirichlet prior parameters to mixture engines"
  - "Replace weight point estimates with posterior distributions"
  - "Update NormalMixtureEM to track weight uncertainty via Dirichlet"
  - "Update LogNormalMixtureEM to track weight uncertainty via Dirichlet"
  - "Modify getComponents() to include weight credible intervals"
  - "Update ComponentInfo interface to support weight uncertainty"
  - "Add tests for weight uncertainty propagation"
  - "Document VBEM approach vs standard EM"

  codeSnippets: |
  // Implementation approach:
  // - Use Dirichlet-Multinomial conjugacy for weight updates
  // - Replace `weight = Nj/n` with `alpha[j] = alpha_prior[j] + Nj`
  // - Expected weights: `E[w_j] = alpha[j] / sum(alpha)`
  // - Weight uncertainty: Beta marginals from Dirichlet

  files:
  mentioned: - "src/inference/engines/\*MixtureEM.ts"

- id: "1.2"
  title: "Data Structures and Validation"
  phase: 1
  priority: P0
  labels: ['phase-1', 'data', 'validation']
  size: M
  dependsOn: ["0.2", "0.1"]

  description: |
  Create experiment data structures and validation logic per InterfaceStandards.md. Uses TycheError from 0.1 for consistent error handling.

  tasks:
  - "Define ExperimentData interface"
  - "Define VariantData interface"
  - "Implement DataValidator with TycheError"
  - "Add sample size validation"
  - "Add variant structure validation"

  codeSnippets: |
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
  throw new TycheError(
  ErrorCode.INVALID_DATA,
  'Experiment must have a control variant',
  { experimentId: data.id }
  );
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

  files:
  toCreate: - "src/domain/types/\*.ts"

- id: "1.3"
  title: "Result Objects Foundation"
  phase: 1
  priority: P0
  labels: ['phase-1', 'results', 'foundation']
  size: M

  description: |
  Create base result object classes that all analysis results extend.

  tasks:
  - "Create abstract AnalysisResult class"
  - "Define ResultMetadata interface"
  - "Implement base export functionality"
  - "Add JSON serialization support"

  codeSnippets: |
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

  files:
  toCreate: - "src/domain/results/\*.ts"

# ==================== PHASE 2: Domain Layer & Business Analysis ====================

- id: "2.1"
  title: "Analyzer Framework"
  phase: 2
  priority: P0
  labels: ['phase-2', 'analyzers', 'business']
  size: L
  dependsOn: ["1.1", "1.2", "1.3"]

  description: |
  Create analyzer framework with two types per InterfaceStandards.md: ExperimentAnalyzer for comparing variants and DatasetAnalyzer for single datasets.

  This is where business logic lives, separate from statistical machinery. Analyzers orchestrate the statistical engines to answer business questions.

  tasks:
  - "Define ExperimentAnalyzer interface"
  - "Define DatasetAnalyzer interface"
  - "Create ConversionAnalyzer implementation"
  - "Create RevenueAnalyzer implementation"
  - "Create PriorLearner as DatasetAnalyzer"

  codeSnippets: |
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

  files:
  toCreate: - "src/domain/analyzers/\*.ts"

- id: "2.2"
  title: "Result Objects Implementation"
  phase: 2
  priority: P0
  labels: ['phase-2', 'results']
  size: L
  dependsOn: ["1.3", "2.1"]

  description: |
  Implement concrete result classes for single variant and multi-variant analysis.

  tasks:
  - "Implement VariantResult class"
  - "Implement ExperimentResult class"
  - "Add runtime capability detection"
  - "Implement getDecomposition() for compound models"
  - "Implement getComponents() for mixtures"
  - "Add compareVariants() method"

  codeSnippets: |
  // Single variant/dataset result
  class VariantResult extends AnalysisResult {
  constructor(
  private posterior: Posterior,
  metadata: ResultMetadata
  ) {
  super(metadata);
  }

      getPosterior(): Posterior { return this.posterior; }

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

  files:
  toCreate: - "src/domain/results/\*.ts"

- id: "2.3"
  title: "Business Decomposition"
  phase: 2
  priority: P1
  labels: ['phase-2', 'business', 'decomposition']
  size: M
  dependsOn: ["2.1"]

  description: |
  Implement effect decomposition for compound models (revenue = conversion × value). Note: Value distributions aren't limited to LogNormal.

  tasks:
  - "Define EffectDecomposition interface"
  - "Implement frequency effect calculation"
  - "Implement value effect calculation"
  - "Calculate combined effects"
  - "Determine contribution percentages"

  codeSnippets: |
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

  files:
  toCreate: - "src/domain/results/EffectDecomposition.ts"

- id: "2.4"
  title: "Prior Elicitation"
  phase: 2
  priority: P2
  labels: ['phase-2', 'priors', 'usability']
  size: M

  description: |
  Create visual tools for non-statisticians to specify priors. Prior elicitation returns Distribution objects directly.

  tasks:
  - "Implement elicitBeta from percentiles"
  - "Implement fromPercentiles for multiple distributions"
  - "Add confidence level adjustment"
  - "Create industry-specific helpers"
  - "Ensure visual feedback integration"

  codeSnippets: |
  class PriorElicitor {
  /\*\*
  _ Elicit Beta prior from conversion rate estimates
  _ @param input.likely - Most likely conversion rate
  _ @param input.lower - 5th percentile (optional)
  _ @param input.upper - 95th percentile (optional)
  _ @param input.confidence - How sure the user is about their estimates
  _/
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
  high: 200 // Strong prior
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
        percentiles: Array<[number, number]>  // [probability, value]
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
          confidence: 'high'
        });
      }

      static saasTrialConversionPrior(): BetaDistribution {
        // Based on empirical data: 15-20% typical
        return this.elicitBeta({
          likely: 0.175,
          lower: 0.10,
          upper: 0.30,
          confidence: 'medium'
        });
      }

  }

  files:
  toCreate: - "src/domain/priors/PriorElicitor.ts"

- id: "2.5"
  title: "Industry Presets"
  phase: 2
  priority: P2
  labels: ['phase-2', 'presets', 'usability']
  size: M

  description: |
  Create system of industry-specific defaults for priors and typical effect sizes.

  tasks:
  - "Define IndustryPreset interface"
  - "Create e-commerce preset"
  - "Create SaaS preset"
  - "Create content/media preset"
  - "Add preset registry/loader"

  codeSnippets: |
  interface IndustryPreset {
  name: string;
  description: string;

      metrics: {
        primary: MetricDefinition;
        secondary: MetricDefinition[];
        guardrails: MetricDefinition[];
      };

      priors: {
        [metric: string]: Distribution;  // Direct Distribution objects
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
  }
  };

  files:
  toCreate: - "src/domain/presets/\*.ts"

- id: "2.6"
  title: "Worker Pool Infrastructure"
  phase: 2
  priority: P0
  labels: ['phase-2', 'infrastructure', 'workers']
  size: L
  blocks: ["3.5"]

  description: |
  Create worker pool infrastructure for parallel computation needed by EM algorithms, power analysis, and bootstrap validation.

  tasks:
  - "Implement WorkerPool interface"
  - "Support single and batch execution"
  - "Add progress reporting"
  - "Implement task cancellation"
  - "Add timeout handling"
  - "Scale based on hardware concurrency"

  codeSnippets: |
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

  files:
  toCreate: - "src/infrastructure/workers/WorkerPool.ts"

- id: "2.7"
  title: "Dependence Research Spike"
  phase: 2
  priority: P3
  labels: ['phase-2', 'research']
  size: S

  description: |
  Validate independence assumption in compound models between frequency and severity.

  tasks:
  - "Test with simulated correlated data"
  - "Prototype simple copula approach if needed"
  - "Measure business impact vs statistical fit"
  - "Decision: Keep simple or add dependence modeling"

# ==================== PHASE 3: Segmentation & HTE ====================

- id: "3.1"
  title: "Unified Segment Interface"
  phase: 3
  priority: P0
  labels: ['phase-3', 'segments', 'hte']
  size: M

  description: |
  Create unified interface for segments. Critical distinction: Segments are user groupings (e.g., "mobile users"), NOT mixture components.

  tasks:
  - "Define Segment interface"
  - "Support manual and causal_tree sources"
  - "Add selector function for user filtering"
  - "Include population statistics"
  - "Add effect measurement structure"

  codeSnippets: |
  interface Segment {
  id: string;
  name: string;
  source: 'manual' | 'causal_tree'; // NOT mixture components!

      definition: {
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

  files:
  toCreate: - "src/domain/hte/Segment.ts"

- id: "3.2"
  title: "HTEAnalyzer"
  phase: 3
  priority: P0
  labels: ['phase-3', 'hte', 'analyzer']
  size: L
  dependsOn: ["3.1"]

  description: |
  Create analyzer for heterogeneous treatment effects that orchestrates segment discovery and validation.

  tasks:
  - "Implement HTEAnalyzer class"
  - "Support both manual and discovered segments"
  - "Analyze segments through unified pipeline"
  - "Add bootstrap validation"
  - "Generate cross-segment comparisons"

  codeSnippets: |
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
          crossSegmentComparison: this.compareSegments(segmentResults)
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

  files:
  toCreate: - "src/domain/hte/HTEAnalyzer.ts"

- id: "3.3"
  title: "Manual Segmentation"
  phase: 3
  priority: P1
  labels: ['phase-3', 'segments', 'manual']
  size: M
  dependsOn: ["3.1"]

  description: |
  Create helpers for defining segments manually based on user features.

  tasks:
  - "Create SegmentBuilder class"
  - "Add device segmentation helper"
  - "Add time-based segmentation"
  - "Add value range segmentation"
  - "Support combining segments (AND/OR)"

  codeSnippets: |
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

  files:
  toCreate: - "src/domain/hte/SegmentBuilder.ts"

- id: "3.4"
  title: "Constrained Causal Trees"
  phase: 3
  priority: P0
  labels: ['phase-3', 'causal-trees', 'hte']
  size: XL
  dependsOn: ["3.1", "2.6"]

  description: |
  Implement causal trees with constraints per CoreVision.md for interpretable, stable segment discovery.

  Constraints ensure business-actionable segments, not just statistically significant ones. Max depth of 3 means humans can understand the segment definition, minimum size of 10% means the segment is worth targeting.

  tasks:
  - "Implement constrained tree building"
  - "Add honest splitting"
  - "Integrate bootstrap validation"
  - "Ensure interpretable segments"

  codeSnippets: |
  interface CausalTreeConfig {
  // Constrained for interpretability
  maxDepth: 3; // Human-readable paths
  minSegmentSize: 0.10; // 10% minimum (targetable)
  minEffectSize: 0.02; // 2% minimum (meaningful)

      // Hypothesis-driven features only
      allowedFeatures: string[];

      // Validation required
      bootstrapIterations: 100;
      stabilityThreshold: 0.7;

  }

  class CausalTreeBuilder {
  async build(
  data: ExperimentData,
  config: CausalTreeConfig
  ): Promise<CausalTree> {
  // Constrained tree building with honest splitting
  // Bootstrap validation built-in
  }
  }

  files:
  toCreate: - "src/domain/hte/CausalTree.ts"

- id: "3.5"
  title: "Power Analysis Framework"
  phase: 3
  priority: P0
  labels: ['phase-3', 'power-analysis', 'planning']
  size: L
  dependsOn: ["2.6"]

  description: |
  Implement Bayesian power analysis using parallel simulation with worker pools.

  tasks:
  - "Implement importance sampling approach"
  - "Create worker tasks for parallel simulation"
  - "Build power curve visualization"
  - "Add sample size optimization"

  codeSnippets: |
  interface PowerAnalysis {
  // Calculate power for given parameters
  async calculatePower(config: {
  baseline: Distribution; // Prior as Distribution
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

  files:
  toCreate: - "src/domain/analysis/PowerAnalysis.ts"

# ==================== PHASE 4: Application Layer & Polish ====================

- id: "4.1"
  title: "Fluent API"
  phase: 4
  priority: P1
  labels: ['phase-4', 'api', 'usability']
  size: L

  description: |
  Create fluent API that makes Tyche accessible per CoreVision.md.

  tasks:
  - "Create Tyche main class"
  - "Implement ExperimentBuilder"
  - "Implement DatasetBuilder"
  - "Add ExperimentPlanner"
  - "Support progressive disclosure"

  codeSnippets: |
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
  const result = await tyche
  .experiment(data)
  .forMetric('revenue')
  .withPreset('ecommerce')
  .analyze();

  // Progressive disclosure
  const decomposition = result.getVariantResult('treatment')?.getDecomposition();
  if (decomposition) {
  console.log('Conversion lifted by', decomposition.frequency.relativeEffect);
  console.log('Value lifted by', decomposition.value.relativeEffect);
  }

  files:
  toCreate: - "src/api/Tyche.ts"

- id: "4.2"
  title: "Natural Language Insights"
  phase: 4
  priority: P2
  labels: ['phase-4', 'insights', 'nlg']
  size: M

  description: |
  Generate plain English explanations of analysis results.

  tasks:
  - "Implement insight generation for all result types"
  - "Create plain English templates"
  - "Add business context awareness"
  - "Generate actionable recommendations"

  codeSnippets: |
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
  generate(
  result: ExperimentResult,
  options: InsightOptions = {}
  ): NaturalLanguageInsights;
  }

  files:
  toCreate: - "src/domain/insights/InsightGenerator.ts"

- id: "4.3"
  title: "Error Recovery and Resilience"
  phase: 4
  priority: P1
  labels: ['phase-4', 'error-handling', 'resilience']
  size: M
  dependsOn: ["0.1"]

  description: |
  Implement error recovery strategies to handle failures gracefully. Uses TycheError from 0.1 for consistent error handling.

  tasks:
  - "Create ErrorRecovery framework"
  - "Implement model simplification fallback"
  - "Add conjugate method fallback"
  - "Implement iteration limit increases"
  - "Add partial results with warnings"

  codeSnippets: |
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

  files:
  toCreate: - "src/infrastructure/ErrorRecovery.ts"

- id: "4.4"
  title: "Embeddable Visualizations"
  phase: 4
  priority: P2
  labels: ['phase-4', 'visualization', 'export']
  size: M

  description: |
  Create embeddable visualization bundle for sharing results.

  tasks:
  - "Generate standalone HTML/JS bundle"
  - "Include interactive distribution plots"
  - "Support React and vanilla JS"
  - "Keep bundle size minimal"

  codeSnippets: |
  class EmbeddableVisualization {
  // Generate standalone HTML/JS bundle
  static async createBundle(
  result: ExperimentResult,
  options: VizOptions = {}
  ): Promise<string> {
  // Minimal bundle with just necessary code
  // Interactive distribution plots
  // No dependencies on main app
  }

      // React component for embedding
      static ReactComponent: React.FC<{ result: ExperimentResult }>;

      // Vanilla JS for any site
      static render(container: string | HTMLElement, data: any): void;

  }

  files:
  toCreate: - "src/application/export/EmbeddableViz.ts"

- id: "4.5"
  title: "Demo Application"
  phase: 4
  priority: P1
  labels: ['phase-4', 'demo', 'showcase']
  size: L

  description: |
  Build complete demo application showcasing progressive analysis journey. Each demo step builds on the previous, showing the progressive disclosure principle in action.

  tasks:
  - "Create interactive data generation"
  - "Show simple A/B test analysis"
  - "Demonstrate revenue decomposition"
  - "Show segment discovery"
  - "Include full HTE analysis"
  - "Add comparison with frequentist methods"

  codeSnippets: |
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
        const result = await tyche
          .experiment(fullData)
          .forMetric('compound')
          .analyze();

        const hte = await result.analyzeHTE({
          sources: ['manual', 'causal_tree'],
          constraints: { maxDepth: 3, minSize: 0.10 }
        });

        showHTEPatterns(hte);
      }

  };

  files:
  toCreate: - "src/demo/\*"
