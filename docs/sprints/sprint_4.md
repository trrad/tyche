# Sprint 4: Power Analysis & Industry Presets (Week 5)

## Sprint Goal

Add experiment planning capabilities through Bayesian power analysis and make the system more accessible with industry-specific presets. This sprint helps users plan better experiments and get started faster.

## Context

- Core analysis capabilities are now complete
- Users need to know "how much data do I need?"
- Industry presets reduce barrier to entry
- Power analysis will be first heavy use of worker pools

## Dependencies

- ✅ Sprint 2: Worker infrastructure exists
- ✅ Sprint 3: Analyzers and result objects
- ✅ Sprint 0: Error handling patterns

---

## Issue 50: Implement industry presets system

**Priority**: P1: High  
**Labels**: `sprint-4`, `presets`, `usability`  
**Size**: M (Medium)

### Description

Create a system of industry-specific defaults for priors and typical effect sizes. Makes it easier for users to get started without deep statistical knowledge.

### Acceptance Criteria

- [ ] Define IndustryPreset interface
- [ ] Create presets for e-commerce, SaaS, content/media
- [ ] Include typical priors for conversion and revenue
- [ ] Include minimum practical effect sizes
- [ ] Easy integration with analyzers
- [ ] Extensible for custom presets
- [ ] Documentation with examples

### Technical Implementation

```typescript
interface IndustryPreset {
  name: string;
  description: string;
  category: 'ecommerce' | 'saas' | 'content' | 'custom';

  // Default priors based on industry data
  priors: {
    conversionRate: Distribution;
    averageOrderValue?: Distribution;
    churnRate?: Distribution;
    [metric: string]: Distribution | undefined;
  };

  // Minimum effect sizes worth detecting
  minimumPracticalEffect: {
    conversion: number; // e.g., 0.02 (2% relative)
    revenue: number; // e.g., 0.05 (5% relative)
    [metric: string]: number;
  };

  // Typical experiment parameters
  typicalExperiment: {
    duration: number; // days
    sampleSize: number; // per variant
    trafficAllocation: number; // percentage
  };

  // Business context
  businessContext: {
    seasonality?: string[]; // ['black-friday', 'christmas']
    considerations?: string[];
  };
}

// E-commerce preset example
const ecommercePreset: IndustryPreset = {
  name: 'E-commerce',
  description: 'Typical online retail metrics',
  category: 'ecommerce',

  priors: {
    // 2-5% conversion typical
    conversionRate: new BetaDistribution(3, 97),

    // $50-100 AOV common, log-normal distributed
    averageOrderValue: new LogNormalDistribution(
      Math.log(75), // median $75
      0.5 // moderate variability
    ),
  },

  minimumPracticalEffect: {
    conversion: 0.02, // 2% relative change matters
    revenue: 0.05, // 5% revenue change matters
  },

  typicalExperiment: {
    duration: 14, // 2 weeks
    sampleSize: 5000, // per variant
    trafficAllocation: 0.5,
  },

  businessContext: {
    seasonality: ['black-friday', 'cyber-monday', 'christmas'],
    considerations: [
      'Weekend traffic often differs from weekday',
      'Mobile conversion typically lower than desktop',
      'Cart abandonment ~70%',
    ],
  },
};

// Usage with analyzers
// Presets would be loaded from a registry
const ecommercePreset = loadPreset('ecommerce');
if (ecommercePreset) {
  const analyzer = new RevenueAnalyzer();
  analyzer.configure({
    priors: ecommercePreset.priors,
    minimumPracticalEffect: ecommercePreset.minimumPracticalEffect,
  });
}
```

### Files to Create

- `src/domain/presets/IndustryPreset.ts`
- `src/domain/presets/defaults/ecommerce.ts`
- `src/domain/presets/defaults/saas.ts`
- `src/domain/presets/defaults/content.ts`
- `src/tests/presets/presets.test.ts`

---

## Issue 51: Create PowerAnalysisEngine

**Priority**: P0: Critical  
**Labels**: `sprint-4`, `power-analysis`, `simulation`  
**Size**: L (Large)  
**Depends on**: Worker infrastructure from Sprint 2

### Description

Implement Bayesian power analysis using parallel simulation with worker pools. This helps users determine required sample sizes before running experiments using posterior precision and probability of detecting meaningful effects.

### Acceptance Criteria

- [ ] Calculate expected posterior precision for different sample sizes
- [ ] Calculate probability of detecting meaningful effects
- [ ] Support all model types (binomial, continuous, compound)
- [ ] Use worker pool for parallel simulation
- [ ] Progress reporting during computation
- [ ] Handle timeout gracefully with TycheError
- [ ] Return credible intervals on precision estimates
- [ ] Cache results for common scenarios

### Technical Implementation

```typescript
interface PowerAnalysisParams {
  prior: Distribution;
  minimumDetectableEffect: number; // Smallest meaningful effect
  sampleSizes: number[]; // Range to test
  targetPrecision?: number; // Desired posterior precision (width of credible interval)
  probabilityThreshold?: number; // Minimum P(|effect| > threshold) to act
  modelType?: ModelType;
}

interface PowerResult {
  sampleSize: number;
  expectedPosteriorWidth: number; // Expected width of 95% credible interval
  probabilityOfDetection: number; // P(|posterior mean| > minimumDetectableEffect)
  expectedPosteriorPrecision: number; // 1 / variance
  iterations: number;
}

interface PowerCurve {
  params: PowerAnalysisParams;
  results: PowerResult[];
  recommendation: {
    sampleSize: number;
    expectedPrecision: number;
    probabilityOfDetection: number;
    timeToReach?: number; // days based on historical traffic
  };
}

class PowerAnalysisEngine {
  constructor(private workerPool: WorkerPool) {}

  async calculatePowerCurve(
    params: PowerAnalysisParams,
    options: {
      iterations?: number;
      onProgress?: (progress: ProgressUpdate) => void;
    } = {}
  ): Promise<PowerCurve> {
    const iterations = options.iterations || 10000;

    // Create tasks for each sample size
    const tasks: WorkerTask<SimulationParams, PowerResult>[] = params.sampleSizes.map(
      (sampleSize) => ({
        id: `power-${sampleSize}`,
        operation: 'power-simulation',
        params: {
          prior: this.serializePrior(params.prior),
          minimumDetectableEffect: params.minimumDetectableEffect,
          sampleSize,
          iterations: Math.floor(iterations / params.sampleSizes.length),
          targetPrecision: params.targetPrecision,
          modelType: params.modelType,
        },
        timeout: 30000,
        onProgress: (progress) => {
          options.onProgress?.({
            ...progress,
            message: `Sample size ${sampleSize}: ${progress.message}`,
          });
        },
      })
    );

    try {
      // Run in parallel
      const results = await this.workerPool.executeMany(tasks, {
        maxConcurrency: navigator.hardwareConcurrency || 4,
        onProgress: options.onProgress,
      });

      // Find recommended sample size based on precision and detection probability
      const recommendation = this.findRecommendation(results, params);

      return {
        params,
        results,
        recommendation,
      };
    } catch (error) {
      if (error.code === ErrorCode.WORKER_TIMEOUT) {
        throw new TycheError(
          ErrorCode.WORKER_TIMEOUT,
          'Power analysis timed out. Try fewer sample sizes or iterations.',
          {
            sampleSizes: params.sampleSizes.length,
            iterations,
          },
          true // recoverable
        );
      }
      throw error;
    }
  }

  private serializePrior(prior: Distribution): SerializedDistribution {
    // Convert Distribution to serializable format for worker
    return {
      type: prior.constructor.name,
      params: prior.getParams(), // Assumes distributions have this
    };
  }

  private findRecommendation(
    results: PowerResult[],
    params: PowerAnalysisParams
  ): PowerRecommendation {
    // Find sample size that meets precision target or detection probability
    const targetPrecision = params.targetPrecision || 0.05; // Default 5% precision
    const targetDetectionProb = params.probabilityThreshold || 0.8; // Default 80% probability

    // Prefer precision-based recommendation
    let adequate = results.find(
      (r) =>
        r.expectedPosteriorWidth <= targetPrecision ||
        r.probabilityOfDetection >= targetDetectionProb
    );

    if (!adequate) {
      // Use best available result
      adequate = results.reduce((best, current) =>
        current.expectedPosteriorPrecision > best.expectedPosteriorPrecision ? current : best
      );
    }

    return {
      sampleSize: adequate.sampleSize,
      expectedPrecision: adequate.expectedPosteriorPrecision,
      probabilityOfDetection: adequate.probabilityOfDetection,
      timeToReach: this.estimateTimeToReach(adequate.sampleSize),
    };
  }
}

// Worker implementation
// In src/workers/powerAnalysis.worker.ts
import type { WorkerMessage, WorkerProgress } from '../infrastructure/types';

self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === 'execute' && message.operation === 'power-simulation') {
    try {
      const result = await runPowerSimulation(message.payload);
      self.postMessage({
        id: message.id,
        type: 'result',
        payload: result,
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        id: message.id,
        type: 'error',
        payload: error.message,
      } as WorkerMessage);
    }
  }
});

async function runPowerSimulation(params: SimulationParams): Promise<PowerResult> {
  const { prior, minimumDetectableEffect, sampleSize, iterations, targetPrecision } = params;

  const posteriorWidths: number[] = [];
  const posteriorMeans: number[] = [];
  const posteriorPrecisions: number[] = [];

  // Run mini-batches for progress reporting
  const batchSize = 100;
  const batches = Math.ceil(iterations / batchSize);

  for (let batch = 0; batch < batches; batch++) {
    const batchResults = await runBatch(batchSize, prior, minimumDetectableEffect, sampleSize);

    posteriorWidths.push(...batchResults.posteriorWidths);
    posteriorMeans.push(...batchResults.posteriorMeans);
    posteriorPrecisions.push(...batchResults.posteriorPrecisions);

    // Report progress
    self.postMessage({
      type: 'progress',
      payload: {
        operation: 'power-simulation',
        current: (batch + 1) * batchSize,
        total: iterations,
        message: `Batch ${batch + 1}/${batches}`,
      },
    } as WorkerMessage<WorkerProgress>);
  }

  // Calculate expected posterior characteristics
  const expectedPosteriorWidth = mean(posteriorWidths);
  const expectedPosteriorPrecision = mean(posteriorPrecisions);

  // Probability of detecting meaningful effect
  const detectionCount = posteriorMeans.filter(
    (mean) => Math.abs(mean) >= minimumDetectableEffect
  ).length;
  const probabilityOfDetection = detectionCount / posteriorMeans.length;

  return {
    sampleSize,
    expectedPosteriorWidth,
    probabilityOfDetection,
    expectedPosteriorPrecision,
    iterations,
  };
}

async function runBatch(
  batchSize: number,
  prior: Distribution,
  minimumDetectableEffect: number,
  sampleSize: number
): Promise<{
  posteriorWidths: number[];
  posteriorMeans: number[];
  posteriorPrecisions: number[];
}> {
  const posteriorWidths: number[] = [];
  const posteriorMeans: number[] = [];
  const posteriorPrecisions: number[] = [];

  for (let i = 0; i < batchSize; i++) {
    // Simulate data generation and posterior updating
    const simulatedData = generateSyntheticData(prior, sampleSize, minimumDetectableEffect);
    const posterior = updatePosterior(prior, simulatedData);

    // Calculate posterior characteristics
    const credibleInterval = posterior.credibleInterval(0.95);
    const width = credibleInterval[0][1] - credibleInterval[0][0];
    const mean = posterior.mean()[0];
    const precision = 1 / posterior.variance()[0];

    posteriorWidths.push(width);
    posteriorMeans.push(mean);
    posteriorPrecisions.push(precision);
  }

  return {
    posteriorWidths,
    posteriorMeans,
    posteriorPrecisions,
  };
}
```

### Files to Create

- `src/domain/power/PowerAnalysisEngine.ts`
- `src/domain/power/types.ts`
- `src/workers/powerAnalysis.worker.ts`
- `src/tests/power/power-analysis.test.ts`

---

## Issue 52: Add power analysis to fluent API

**Priority**: P2: Medium  
**Labels**: `sprint-4`, `api`, `power-analysis`  
**Size**: S (Small)  
**Depends on**: Issue 2, Sprint 3 fluent API

### Description

Extend the fluent API to support Bayesian power analysis workflows.

### Acceptance Criteria

- [ ] Add `.planExperiment()` method to builder
- [ ] Support `.withTargetPrecision(0.05)`
- [ ] Support `.withMinimumDetectableEffect(0.05)`
- [ ] Return power curve visualization data
- [ ] Integrate with presets for defaults
- [ ] Type-safe API

### Technical Implementation

```typescript
// Extend ExperimentBuilder
class ExperimentBuilder {
  // ... existing methods ...

  planExperiment(): PowerAnalysisBuilder {
    return new PowerAnalysisBuilder(this.data, this.config);
  }
}

class PowerAnalysisBuilder {
  private params: Partial<PowerAnalysisParams> = {};

  constructor(
    private experimentData: Partial<ExperimentData>,
    private config: BuilderConfig
  ) {
    // Infer defaults from data/config
    this.inferDefaults();
  }

  withTargetPrecision(precision: number): this {
    this.params.targetPrecision = precision;
    return this;
  }

  withMinimumDetectableEffect(effect: number): this {
    this.params.minimumDetectableEffect = effect;
    return this;
  }

  withProbabilityThreshold(threshold: number): this {
    this.params.probabilityThreshold = threshold;
    return this;
  }

  withSampleSizes(sizes: number[]): this {
    this.params.sampleSizes = sizes;
    return this;
  }

  fromPreset(presetName: string): this {
    // Would load preset from a registry
    const preset = loadPreset(presetName);
    if (!preset) throw new Error(`Unknown preset: ${presetName}`);

    this.params.prior = preset.priors[this.config.metric || 'conversionRate'];
    this.params.minimumDetectableEffect =
      preset.minimumPracticalEffect[this.config.metric || 'conversion'];

    return this;
  }

  async calculate(): Promise<PowerCurve> {
    // Validate params
    this.validate();

    const engine = new PowerAnalysisEngine(getWorkerPool());
    return engine.calculatePowerCurve(this.params as PowerAnalysisParams);
  }

  private inferDefaults(): void {
    // Use metric type to set defaults
    switch (this.config.metric) {
      case 'conversion':
        this.params.prior = new BetaDistribution(1, 1); // Uniform
        this.params.effectSize = 0.05; // 5% relative
        break;
      case 'revenue':
        // Infer from historical data if available
        break;
    }

    // Default sample size range
    this.params.sampleSizes = [1000, 2000, 5000, 10000, 20000, 50000];
  }
}

// Usage
const powerCurve = await tyche
  .experiment()
  .forMetric('conversion')
  .planExperiment()
  .fromPreset('ecommerce')
  .withTargetPower(0.8)
  .calculate();

console.log(`Need ${powerCurve.recommendation.sampleSize} users per variant`);
```

### Files to Create/Modify

- `src/api/PowerAnalysisBuilder.ts`
- Update `src/api/ExperimentBuilder.ts`
- `src/tests/api/power-analysis-api.test.ts`

---

## Issue 53: Implement basic prior elicitation

**Priority**: P2: Medium  
**Labels**: `sprint-4`, `priors`, `usability`  
**Size**: M (Medium)

### Description

Create utilities for eliciting priors from users who don't know distribution parameters. Focus on percentile-based methods.

### Acceptance Criteria

- [ ] Elicit Beta priors from success rate bounds
- [ ] Elicit LogNormal priors from revenue percentiles
- [ ] Support credible intervals (range containing X% of posterior mass)
- [ ] Return proper Distribution objects
- [ ] Validate elicited values are sensible
- [ ] Clear error messages for invalid inputs

### Technical Implementation

```typescript
interface PriorElicitation {
  // What the user provides
  percentiles: Array<{
    probability: number; // 0.05, 0.5, 0.95
    value: number; // Their estimate
  }>;

  confidence: 'low' | 'medium' | 'high';

  // Optional bounds
  bounds?: {
    min?: number;
    max?: number;
  };
}

class PriorElicitor {
  /**
   * Elicit Beta prior from conversion rate estimates
   */
  static elicitBeta(input: {
    likely: number; // Most likely conversion rate
    lower?: number; // 5th percentile
    upper?: number; // 95th percentile
    confidence?: 'low' | 'medium' | 'high';
  }): BetaDistribution {
    const conf = input.confidence || 'medium';

    // Adjust for confidence
    const effectiveSampleSize = {
      low: 10,
      medium: 50,
      high: 200,
    }[conf];

    // Method of moments
    const mean = input.likely;
    const variance = this.estimateVariance(input, conf);

    // Convert to Beta parameters
    const alpha = mean * ((mean * (1 - mean)) / variance - 1);
    const beta = (1 - mean) * ((mean * (1 - mean)) / variance - 1);

    // Validate
    if (alpha <= 0 || beta <= 0) {
      throw new TycheError(
        ErrorCode.INVALID_PRIOR,
        'Cannot create prior from these estimates. Try wider bounds or lower confidence.',
        { input }
      );
    }

    return new BetaDistribution(alpha, beta);
  }

  /**
   * Elicit LogNormal prior from revenue estimates
   */
  static elicitLogNormal(input: {
    median: number;
    percentile95?: number;
    percentile5?: number;
    confidence?: 'low' | 'medium' | 'high';
  }): LogNormalDistribution {
    // LogNormal: median = exp(mu)
    const mu = Math.log(input.median);

    // Estimate sigma from percentiles
    let sigma: number;

    if (input.percentile95 && input.percentile5) {
      // Use both bounds
      const logRange = Math.log(input.percentile95) - Math.log(input.percentile5);
      sigma = logRange / (2 * 1.96); // Approximate
    } else if (input.percentile95) {
      // Use upper bound only
      const logDiff = Math.log(input.percentile95) - mu;
      sigma = logDiff / 1.96;
    } else {
      // Default based on confidence
      sigma = {
        low: 0.5,
        medium: 0.3,
        high: 0.1,
      }[input.confidence || 'medium'];
    }

    return new LogNormalDistribution(mu, sigma);
  }

  /**
   * Interactive elicitation from percentiles
   */
  static async elicitInteractive(
    type: 'beta' | 'lognormal',
    percentiles: Array<[number, number]> // [p, value] pairs
  ): Promise<Distribution> {
    // This would use optimization to find parameters
    // that best match the given percentiles
    // For now, simplified version

    if (type === 'beta' && percentiles.length >= 2) {
      const p50 = percentiles.find((p) => p[0] === 0.5)?.[1];
      const p05 = percentiles.find((p) => p[0] === 0.05)?.[1];
      const p95 = percentiles.find((p) => p[0] === 0.95)?.[1];

      return this.elicitBeta({
        likely: p50 || (p05! + p95!) / 2,
        lower: p05,
        upper: p95,
      });
    }

    throw new Error('Not implemented for this type');
  }
}

// Usage in API
class ExperimentBuilder {
  withPriorFromEstimates(estimates: {
    metric: string;
    likely: number;
    lower?: number;
    upper?: number;
    confidence?: 'low' | 'medium' | 'high';
  }): this {
    const prior = PriorElicitor.elicitBeta(estimates);
    return this.withPrior(estimates.metric, prior);
  }
}
```

### Files to Create

- `src/domain/priors/PriorElicitor.ts`
- `src/domain/priors/elicitation-methods.ts`
- `src/tests/priors/elicitation.test.ts`

---

## Sprint Success Criteria

- [ ] Industry presets working and documented
- [ ] Power analysis runs in parallel using workers
- [ ] Power curves with confidence intervals
- [ ] Prior elicitation from percentiles
- [ ] Fluent API supports experiment planning
- [ ] All tests passing with good coverage

## Performance Targets

- Power analysis for 6 sample sizes: < 5 seconds
- Preset application: instant
- Prior elicitation: instant

## Next Sprint Preview

Sprint 5 (Phase 3) will add:

- Unified Segment interface
- Manual segmentation
- Causal tree discovery
- Bootstrap validation
- Cross-segment analysis
