# Sprint 2: Routing & Inference Engines (Week 3)

## Sprint Goal

Connect the pure distributions (Sprint 1A) with analysis capabilities (Sprint 1B) through smart routing and inference engines. This sprint establishes the core architectural pattern for all future inference.

## Context

- We now have pure math distributions and basic result objects
- Need to connect them through engines that handle fitting
- ModelRouter will use data quality indicators for smart routing
- 90% of routing decisions should be instant (WAIC only for ambiguous cases)

## Dependencies

- ✅ Sprint 0: StandardData with quality indicators
- ✅ Sprint 1A: Pure distribution objects
- ✅ Sprint 1B: Result object pattern

---

## Issue 37: Implement InferenceEngine base class

**Priority**: P0: Critical  
**Labels**: `sprint-2`, `inference`, `architecture`  
**Size**: M (Medium)  
**Blocks**: All engine implementations

### Description

Create the abstract base class that all inference engines extend. This establishes the pattern for capability declaration and fitting.

### Acceptance Criteria

- [ ] Define InferenceEngine abstract class
- [ ] Implement capability checking via canHandle()
- [ ] Define fit() abstract method
- [ ] Add helper methods for capability matching
- [ ] Include algorithm type declaration
- [ ] Support FitOptions (prior, iterations, tolerance)
- [ ] Proper TypeScript generics

### Technical Implementation

```typescript
// From InterfaceStandards.md
interface EngineCapabilities {
  structures: ModelStructure[]; // ['simple'] or ['compound']
  types: ModelType[]; // ['beta', 'lognormal', etc.]
  dataTypes: DataType[]; // ['binomial', 'user-level']
  components: number[] | 'any'; // Supported component counts

  // Performance characteristics
  exact: boolean;
  fast: boolean; // <100ms typical
  stable: boolean;
}

abstract class InferenceEngine {
  abstract readonly capabilities: EngineCapabilities;
  abstract readonly algorithm: 'conjugate' | 'em' | 'vi' | 'mcmc';

  canHandle(config: ModelConfig, data: StandardData, options?: FitOptions): boolean {
    return (
      this.matchesStructure(config.structure) &&
      this.matchesType(config.type) &&
      this.matchesData(data.type) &&
      this.supportsComponents(config.components || 1)
    );
  }

  abstract async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult>;

  // Helper methods
  protected matchesStructure(structure: ModelStructure): boolean {
    return this.capabilities.structures.includes(structure);
  }

  protected matchesType(type?: ModelType): boolean {
    if (!type) return false;
    return this.capabilities.types.includes(type);
  }

  protected matchesData(dataType: DataType): boolean {
    return this.capabilities.dataTypes.includes(dataType);
  }

  protected supportsComponents(n: number): boolean {
    if (this.capabilities.components === 'any') return true;
    return this.capabilities.components.includes(n);
  }
}
```

### Prior Compatibility Note

Prior compatibility is checked in the context of model + data, not just at engine level. Each engine decides if it can handle a specific prior.

### Files to Create/Modify

- `src/statistical/inference/InferenceEngine.ts`
- `src/statistical/inference/types.ts` (FitOptions, InferenceResult)
- `src/tests/inference/engine-base.test.ts`

---

## Issue 38: Create BetaBinomialEngine

**Priority**: P0: Critical  
**Labels**: `sprint-2`, `inference`, `engine`  
**Size**: M (Medium)  
**Depends on**: Issue 1

### Description

First concrete engine implementation for Beta-Binomial conjugate updates. This replaces the hardcoded logic in ConversionAnalyzer.

### Acceptance Criteria

- [ ] Extends InferenceEngine abstract class
- [ ] Declares capabilities correctly:
  - structures: ['simple']
  - types: ['beta']
  - dataTypes: ['binomial']
  - exact: true, fast: true
- [ ] Implements conjugate update math
- [ ] Returns proper InferenceResult with BetaPosterior
- [ ] Supports Beta prior (validates it's actually Beta)
- [ ] < 1ms performance
- [ ] Clear error messages

### Technical Implementation

```typescript
class BetaBinomialEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['simple'] as ModelStructure[],
    types: ['beta'] as ModelType[],
    dataTypes: ['binomial'] as DataType[],
    components: [1],
    exact: true,
    fast: true,
    stable: true,
  };

  readonly algorithm = 'conjugate' as const;

  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    // Validate
    if (data.type !== 'binomial' || !data.binomial) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'BetaBinomialEngine requires binomial data', {
        expectedType: 'binomial',
        receivedType: data.type,
        hasData: !!data.binomial,
      });
    }

    // Extract prior or use default
    let prior = { alpha: 1, beta: 1 }; // Default uniform
    if (options?.prior) {
      // Validate it's actually a Beta distribution
      if (!this.isBetaDistribution(options.prior)) {
        throw new TycheError(ErrorCode.INVALID_PRIOR, 'BetaBinomialEngine requires Beta prior', {
          receivedType: options.prior.constructor.name,
          expectedType: 'BetaDistribution',
        });
      }
      prior = this.extractBetaParams(options.prior);
    }

    // Conjugate update
    const { successes, trials } = data.binomial;
    const posteriorAlpha = prior.alpha + successes;
    const posteriorBeta = prior.beta + (trials - successes);

    // Create posterior using pure distribution
    const posterior = new BetaPosterior(posteriorAlpha, posteriorBeta);

    return {
      posterior,
      diagnostics: {
        converged: true, // Always true for conjugate
        logLikelihood: this.computeLogLikelihood(data, posterior),
      },
      metadata: {
        algorithm: 'conjugate',
        computeTime: 0, // Near instant
      },
    };
  }

  private isBetaDistribution(dist: Distribution): boolean {
    // Check if it's a Beta distribution
    // Could check constructor name or interface
    return dist.constructor.name === 'BetaDistribution';
  }
}
```

### Files to Create

- `src/statistical/engines/BetaBinomialEngine.ts`
- `src/tests/engines/beta-binomial.test.ts`

---

## Issue 39: Implement capability-based ModelRouter

**Priority**: P0: Critical  
**Labels**: `sprint-2`, `routing`, `architecture`  
**Size**: L (Large)  
**Depends on**: Issue 1, Issue 2

### Context

The current WAIC integration complexity stems from having no systematic way to route data to appropriate models. Every analyzer reinvents routing logic, and we end up running expensive model comparison for cases that should be obvious.

### What This Solves

Creates a capability-based router that uses StandardData quality indicators to make instant routing decisions. When data has zeros, route to compound models. When data has negatives, choose normal over lognormal. This eliminates 90% of expensive model comparison.

### How It Works

ModelRouter maintains a registry of engines with declared capabilities. For each dataset, it examines quality indicators once, determines the appropriate ModelConfig, then finds the best compatible engine. Simple heuristics handle the common cases instantly.

### Implementation Requirements

- [ ] ModelRouter.route() returns { config, engine } pair
- [ ] Uses quality indicators for instant decisions (hasZeros → compound, hasNegatives → normal vs lognormal)
- [ ] Engine registry with capability declarations
- [ ] Priority ordering (conjugate > em > vi > mcmc)
- [ ] Graceful fallback with clear error messages
- [ ] Multimodality detection only for extreme cases

### Technical Implementation

```typescript
class ModelRouter {
  // Registry of all available engines
  private static engines: InferenceEngine[] = [
    new BetaBinomialEngine(),
    new LogNormalConjugateEngine(),
    // More engines added as implemented
  ];

  static async route(
    data: StandardData,
    fitOptions?: FitOptions
  ): Promise<{ config: ModelConfig; engine: InferenceEngine }> {
    // Step 1: Determine config from data
    const config = this.determineConfig(data);

    // Step 2: Find compatible engine
    const engine = this.selectEngine(config, data, fitOptions);

    return { config, engine };
  }

  private static determineConfig(data: StandardData): ModelConfig {
    // Binomial data → Beta
    if (data.type === 'binomial') {
      return { structure: 'simple', type: 'beta' };
    }

    // User-level routing based on quality
    const { hasZeros, hasNegatives } = data.quality;

    if (hasZeros) {
      // Compound model needed
      return {
        structure: 'compound',
        frequencyType: 'beta',
        valueType: hasNegatives ? 'normal' : 'lognormal',
        valueComponents: 1, // Start simple
      };
    }

    // Simple model
    return {
      structure: 'simple',
      type: hasNegatives ? 'normal' : 'lognormal',
      components: 1, // Start simple
    };
  }

  private static selectEngine(
    config: ModelConfig,
    data: StandardData,
    fitOptions?: FitOptions
  ): InferenceEngine {
    // Find all compatible engines
    const compatible = this.engines
      .filter((engine) => engine.canHandle(config, data, fitOptions))
      .sort((a, b) => {
        // Prioritize by algorithm type
        const priority = { conjugate: 0, em: 1, vi: 2, mcmc: 3 };
        return priority[a.algorithm] - priority[b.algorithm];
      });

    if (compatible.length === 0) {
      throw new TycheError(
        ErrorCode.MODEL_MISMATCH,
        `No engine available for ${config.structure} model with ${config.type || 'unknown'} type`,
        {
          config,
          dataType: data.type,
          availableEngines: this.engines.map((e) => ({
            algorithm: e.algorithm,
            capabilities: e.capabilities,
          })),
        }
      );
    }

    return compatible[0];
  }
}
```

### Multimodality Detection

```typescript
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

// Only for extreme cases
private static detectComponents(values: number[]): number {
  // Implementation detail - uses statistical tests to detect multimodality
  const result = this.runMultimodalityDetection(values);

  if (result.confidence > 0.95 && result.suggestedComponents <= 4) {
    return result.suggestedComponents;
  }

  return 1;  // Default to simple
}

private static runMultimodalityDetection(values: number[]): MultimodalityResult {
  // Simple heuristic for now
  // Real implementation would use statistical tests
  if (values.length < 100) {
    return {
      isMultimodal: false,
      confidence: 0,
      suggestedComponents: 1,
      evidence: {
        bimodalityCoefficient: 0,
        kurtosis: 0,
        hasGaps: false
      }
    };
  }

  // Placeholder for actual statistical tests
  // Would compute bimodality coefficient, check for gaps in distribution, etc.
  return {
    isMultimodal: false,
    confidence: 0.5,
    suggestedComponents: 1,
    evidence: {
      bimodalityCoefficient: 0.3,
      kurtosis: 3.0,
      hasGaps: false
    }
  };
}
```

### Files to Create/Modify

- `src/statistical/routing/ModelRouter.ts`
- `src/statistical/routing/MultimodalityDetection.ts`
- `src/statistical/routing/types.ts` (for MultimodalityResult interface)
- `src/tests/routing/model-router.test.ts`

---

## Issue 40: Port LogNormalConjugateEngine

**Priority**: P1: High  
**Labels**: `sprint-2`, `inference`, `engine`  
**Size**: M (Medium)  
**Depends on**: Issue 1

### Description

Port the existing LogNormal conjugate engine to the new architecture pattern.

### Acceptance Criteria

- [ ] Extends InferenceEngine properly
- [ ] Handles simple lognormal models only
- [ ] Single component only (no mixtures)
- [ ] Capability declarations:
  - structures: ['simple']
  - types: ['lognormal']
  - dataTypes: ['user-level']
- [ ] Supports appropriate priors
- [ ] < 10ms performance for typical data
- [ ] Proper numerical stability

### Technical Implementation

```typescript
class LogNormalConjugateEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['simple'] as ModelStructure[],
    types: ['lognormal'] as ModelType[],
    dataTypes: ['user-level'] as DataType[],
    components: 1,
    exact: true,
    fast: true,
    stable: true,
  };

  readonly algorithm = 'conjugate' as const;

  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    // Validate user-level data where everyone converted
    if (!data.userLevel || data.quality.hasZeros) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'LogNormalConjugateEngine requires positive continuous data',
        {
          hasUserLevel: !!data.userLevel,
          hasZeros: data.quality.hasZeros,
          suggestion: data.quality.hasZeros
            ? 'Use compound model for zero-inflated data'
            : 'Provide user-level data',
        }
      );
    }

    // Extract values
    const values = data.userLevel.users
      .filter((u) => u.converted && u.value > 0)
      .map((u) => Math.log(u.value)); // Work in log space

    // Conjugate update for known variance case
    // Or use sample statistics for unknown variance
    const posterior = this.computePosterior(values, options?.prior);

    return {
      posterior,
      diagnostics: {
        converged: true,
        logLikelihood: this.computeLogLikelihood(values, posterior),
      },
      metadata: {
        algorithm: 'conjugate',
        computeTime: Date.now() - start,
      },
    };
  }
}
```

### Files to Create

- `src/statistical/engines/LogNormalConjugateEngine.ts`
- `src/tests/engines/lognormal-conjugate.test.ts`

---

## Issue 41: Update ConversionAnalyzer to use routing

**Priority**: P1: High  
**Labels**: `sprint-2`, `analyzer`, `refactor`  
**Size**: S (Small)  
**Depends on**: Issue 3

### Description

Update the hardcoded ConversionAnalyzer to use ModelRouter instead of direct Beta-Binomial logic.

### Acceptance Criteria

- [ ] Remove hardcoded conjugate update logic
- [ ] Use ModelRouter.route() to get engine
- [ ] Convert ExperimentData → StandardData for routing
- [ ] Maintain same external API
- [ ] Tests still pass
- [ ] Performance still < 10ms

### Technical Implementation

```typescript
class ConversionAnalyzer implements ExperimentAnalyzer {
  async analyze(data: ExperimentData): Promise<ExperimentResult> {
    const variantResults = new Map<string, VariantResult>();

    // Analyze each variant
    for (const [name, variant] of this.getAllVariants(data)) {
      // Convert to StandardData
      const standardData = this.toStandardData(variant);

      // Route to appropriate engine
      const { config, engine } = await ModelRouter.route(standardData);

      // Fit
      const result = await engine.fit(standardData, config);

      // Create VariantResult
      variantResults.set(name, new VariantResult(result.posterior, result.metadata));
    }

    return new ExperimentResult(variantResults, {
      experimentId: data.id,
      modelConfig: config,
      totalSamples: this.calculateTotalSamples(data),
    });
  }

  private toStandardData(variant: VariantData): StandardData {
    if (!variant.binary) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'ConversionAnalyzer requires binary data');
    }

    return {
      type: 'binomial',
      n: variant.binary.trials,
      binomial: variant.binary,
      quality: {
        hasZeros: false,
        hasNegatives: false,
        hasOutliers: false,
        missingData: 0,
      },
    };
  }
}
```

### Files to Modify

- `src/domain/analyzers/ConversionAnalyzer.ts`
- Update tests to mock/use ModelRouter

---

## Issue 42: Implement WorkerPool infrastructure

**Priority**: P0: Critical  
**Labels**: `sprint-2`, `infrastructure`, `workers`  
**Size**: L (Large)  
**Blocks**: Power analysis (Sprint 4), Bootstrap validation (Sprint 5)

### Description

Create the worker pool infrastructure for parallel computation. This enables CPU-intensive operations like EM algorithms, power analysis, and bootstrap validation to run without blocking the UI.

### Acceptance Criteria

- [ ] Implement WorkerPool interface from InterfaceStandards.md
- [ ] Support single and batch task execution
- [ ] Progress reporting from workers
- [ ] Graceful error handling and timeouts
- [ ] Task cancellation support
- [ ] Pool size based on hardware concurrency
- [ ] Generic enough for all future worker needs

### Technical Implementation

```typescript
// From InterfaceStandards.md
interface WorkerPool {
  // Execute single task
  execute<T, R>(params: T): Promise<R>;
  execute<T, R>(task: WorkerTask<T, R>): Promise<R>;

  // Execute many tasks in parallel
  executeMany<T, R>(tasks: T[], options?: PoolOptions): Promise<R[]>;

  // Pool management
  cancel(taskId: string): void;
  getStatus(): PoolStatus;
}

class WorkerPoolImpl implements WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: WorkerTask<any, any>[] = [];
  private activeTasksMap = new Map<string, ActiveTask>();
  private maxWorkers: number;

  constructor(workerScript: string, maxWorkers: number = navigator.hardwareConcurrency || 4) {
    this.maxWorkers = maxWorkers;
    this.initializeWorkers(workerScript);
  }

  private initializeWorkers(script: string): void {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker(script);

      worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
        this.handleWorkerMessage(worker, event.data);
      });

      worker.addEventListener('error', (error) => {
        this.handleWorkerError(worker, error);
      });

      this.workers.push(worker);
    }
  }

  async execute<T, R>(paramOrTask: T | WorkerTask<T, R>): Promise<R> {
    const task: WorkerTask<T, R> = this.isWorkerTask(paramOrTask)
      ? paramOrTask
      : {
          id: this.generateTaskId(),
          operation: 'default',
          params: paramOrTask,
        };

    return new Promise((resolve, reject) => {
      const activeTask: ActiveTask = {
        task,
        resolve,
        reject,
        startTime: Date.now(),
      };

      // Set timeout if specified
      if (task.timeout) {
        activeTask.timeoutId = setTimeout(() => {
          this.handleTimeout(task.id);
        }, task.timeout);
      }

      this.activeTasksMap.set(task.id, activeTask);
      this.taskQueue.push(task);
      this.processQueue();
    });
  }

  async executeMany<T, R>(tasks: T[] | WorkerTask<T, R>[], options?: PoolOptions): Promise<R[]> {
    const workerTasks = tasks.map((t) =>
      this.isWorkerTask(t)
        ? t
        : {
            id: this.generateTaskId(),
            operation: 'default',
            params: t,
          }
    );

    const progressCallback = options?.onProgress;
    let completed = 0;

    // Add progress tracking
    if (progressCallback) {
      workerTasks.forEach((task) => {
        const originalOnProgress = task.onProgress;
        task.onProgress = (progress) => {
          originalOnProgress?.(progress);
          if (progress.current === progress.total) {
            completed++;
            progressCallback(completed, workerTasks.length);
          }
        };
      });
    }

    // Execute with concurrency limit
    const results: R[] = new Array(workerTasks.length);
    const executing: Promise<void>[] = [];

    for (let i = 0; i < workerTasks.length; i++) {
      const promise = this.execute<T, R>(workerTasks[i]).then((result) => {
        results[i] = result;
      });

      executing.push(promise);

      if (executing.length >= (options?.maxConcurrency || this.maxWorkers)) {
        await Promise.race(executing);
        executing.splice(
          executing.findIndex((p) => p.isSettled?.()),
          1
        );
      }
    }

    await Promise.all(executing);
    return results;
  }

  cancel(taskId: string): void {
    const activeTask = this.activeTasksMap.get(taskId);
    if (!activeTask) return;

    // Remove from queue if pending
    const queueIndex = this.taskQueue.findIndex((t) => t.id === taskId);
    if (queueIndex >= 0) {
      this.taskQueue.splice(queueIndex, 1);
    }

    // Cancel if running
    if (activeTask.worker) {
      activeTask.task.onCancel?.();
      activeTask.reject(new TycheError(ErrorCode.CANCELLED, 'Task cancelled by user'));
    }

    this.cleanupTask(taskId);
  }

  getStatus(): PoolStatus {
    return {
      active: this.activeTasksMap.size,
      queued: this.taskQueue.length,
      completed: this.completedCount,
      failed: this.failedCount,
    };
  }

  private processQueue(): void {
    // Find available worker
    const availableWorker = this.workers.find(
      (w) => !Array.from(this.activeTasksMap.values()).some((t) => t.worker === w)
    );

    if (!availableWorker || this.taskQueue.length === 0) return;

    // Assign next task
    const task = this.taskQueue.shift()!;
    const activeTask = this.activeTasksMap.get(task.id)!;
    activeTask.worker = availableWorker;

    // Send to worker
    const message: WorkerMessage = {
      id: task.id,
      type: 'execute',
      operation: task.operation,
      payload: task.params,
    };

    availableWorker.postMessage(message);
  }

  private handleWorkerMessage(worker: Worker, message: WorkerMessage): void {
    const activeTask = this.activeTasksMap.get(message.id);
    if (!activeTask) return;

    switch (message.type) {
      case 'result':
        activeTask.resolve(message.payload);
        this.cleanupTask(message.id);
        this.completedCount++;
        break;

      case 'error':
        activeTask.reject(new Error(message.payload));
        this.cleanupTask(message.id);
        this.failedCount++;
        break;

      case 'progress':
        activeTask.task.onProgress?.(message.payload as WorkerProgress);
        break;
    }

    // Process next task
    this.processQueue();
  }

  private handleTimeout(taskId: string): void {
    const activeTask = this.activeTasksMap.get(taskId);
    if (!activeTask) return;

    activeTask.reject(
      new TycheError(ErrorCode.WORKER_TIMEOUT, 'Worker task timed out', {
        taskId,
        timeout: activeTask.task.timeout,
      })
    );

    this.cleanupTask(taskId);
    this.failedCount++;
  }

  private cleanupTask(taskId: string): void {
    const activeTask = this.activeTasksMap.get(taskId);
    if (!activeTask) return;

    if (activeTask.timeoutId) {
      clearTimeout(activeTask.timeoutId);
    }

    this.activeTasksMap.delete(taskId);
  }

  private isWorkerTask<T, R>(value: any): value is WorkerTask<T, R> {
    return typeof value === 'object' && 'id' in value && 'operation' in value;
  }

  private generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private completedCount = 0;
  private failedCount = 0;
}

// Singleton accessor
let workerPool: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!workerPool) {
    workerPool = new WorkerPoolImpl('/workers/universal.worker.js');
  }
  return workerPool;
}
```

### Files to Create

- `src/infrastructure/workers/WorkerPool.ts`
- `src/infrastructure/workers/types.ts`
- `src/workers/universal.worker.ts`
- `src/tests/workers/worker-pool.test.ts`

---

## Issue 43: Implement universal worker

**Priority**: P0: Critical  
**Labels**: `sprint-2`, `infrastructure`, `workers`  
**Size**: M (Medium)  
**Depends on**: Issue 6 (WorkerPool)  
**Blocks**: All worker-based operations

### Description

Create the universal worker that receives messages from WorkerPool and routes them to appropriate handlers. This is the actual worker script that runs in the background thread.

### Acceptance Criteria

- [ ] Implement message protocol from InterfaceStandards.md
- [ ] Route operations to appropriate handlers
- [ ] Support progress reporting
- [ ] Handle errors gracefully
- [ ] Support operation cancellation
- [ ] Extensible for new operations
- [ ] Type-safe message handling

### Technical Implementation

```typescript
// src/workers/universal.worker.ts
import type { WorkerMessage, WorkerProgress } from '../infrastructure/types';

// Operation handlers
import { emFitHandler } from './operations/emFit';
import { powerAnalysisHandler } from './operations/powerAnalysis';
import { bootstrapHandler } from './operations/bootstrap';
import { causalTreeHandler } from './operations/causalTree';

// Registry of available operations
const operationHandlers: Record<string, OperationHandler> = {
  'em-fit': emFitHandler,
  'power-simulation': powerAnalysisHandler,
  'bootstrap-validation': bootstrapHandler,
  'causal-tree': causalTreeHandler,
};

// Main message handler
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type !== 'execute') {
    console.error('Unknown message type:', message.type);
    return;
  }

  const handler = operationHandlers[message.operation || 'default'];

  if (!handler) {
    self.postMessage({
      id: message.id,
      type: 'error',
      payload: `Unknown operation: ${message.operation}`,
    } as WorkerMessage);
    return;
  }

  try {
    // Create progress reporter
    const progressReporter = createProgressReporter(message.id);

    // Execute operation
    const result = await handler(message.payload, progressReporter);

    // Send result
    self.postMessage({
      id: message.id,
      type: 'result',
      payload: result,
    } as WorkerMessage);
  } catch (error) {
    // Send error
    self.postMessage({
      id: message.id,
      type: 'error',
      payload: error instanceof Error ? error.message : String(error),
    } as WorkerMessage);
  }
});

// Progress reporter factory
function createProgressReporter(taskId: string) {
  return (progress: Partial<WorkerProgress>) => {
    self.postMessage({
      id: taskId,
      type: 'progress',
      payload: {
        operation: progress.operation || 'processing',
        current: progress.current || 0,
        total: progress.total || 100,
        message: progress.message,
      },
    } as WorkerMessage<WorkerProgress>);
  };
}

// Operation handler type
type OperationHandler = (
  params: any,
  progress: (update: Partial<WorkerProgress>) => void
) => Promise<any>;

// Example operation handler
const emFitHandler: OperationHandler = async (params, progress) => {
  const { data, components, maxIterations } = params;

  progress({ message: 'Initializing EM algorithm', current: 0, total: maxIterations });

  // EM algorithm implementation
  let converged = false;
  let iteration = 0;
  let logLikelihood = -Infinity;

  while (!converged && iteration < maxIterations) {
    // E-step
    progress({
      message: `E-step iteration ${iteration + 1}`,
      current: iteration,
      total: maxIterations,
    });

    // ... E-step logic ...

    // M-step
    progress({
      message: `M-step iteration ${iteration + 1}`,
      current: iteration,
      total: maxIterations,
    });

    // ... M-step logic ...

    iteration++;
  }

  return {
    components: [], // fitted components
    converged,
    iterations: iteration,
    logLikelihood,
  };
};
```

### Files to Create

- `src/workers/universal.worker.ts`
- `src/workers/operations/emFit.ts`
- `src/workers/operations/powerAnalysis.ts`
- `src/workers/operations/bootstrap.ts`
- `src/workers/operations/causalTree.ts`
- `src/tests/workers/universal-worker.test.ts`

---

## Issue 44: Implement model comparison infrastructure

**Priority**: P1: High  
**Labels**: `sprint-2`, `model-selection`, `routing`  
**Size**: L (Large)  
**Depends on**: Issue 3 (ModelRouter)

### Description

Add model comparison capabilities including WAIC calculation for the minority of cases where data quality indicators don't provide clear routing decisions. WAIC is used only when multiple models are plausible after initial routing.

### Acceptance Criteria

- [ ] Implement WAIC calculation for fitted models (only when needed)
- [ ] Support model comparison across different structures
- [ ] Cache WAIC results for efficiency
- [ ] Integrate with ModelRouter for edge cases (not primary routing)
- [ ] Handle numerical stability in log calculations
- [ ] Clear interpretation of comparison results
- [ ] Performance optimization for large datasets
- [ ] Used sparingly - only when quality indicators insufficient

### Technical Implementation

```typescript
interface ModelComparisonResult {
  models: Array<{
    config: ModelConfig;
    waic: number;
    se: number; // Standard error
    weight: number; // Model weight
  }>;

  best: {
    config: ModelConfig;
    engine: InferenceEngine;
  };

  summary: {
    substantialDifference: boolean;
    recommendation: string;
  };
}

class ModelComparison {
  /**
   * Calculate WAIC (Watanabe-Akaike Information Criterion)
   * Lower is better
   */
  static async calculateWAIC(
    data: StandardData,
    posterior: Posterior
  ): Promise<{ waic: number; se: number }> {
    // Get log pointwise predictive density
    const lppd = await this.calculateLPPD(data, posterior);

    // Calculate effective number of parameters
    const pWAIC = await this.calculatePWAIC(data, posterior);

    // WAIC = -2 * (lppd - pWAIC)
    const waic = -2 * (lppd - pWAIC);

    // Calculate standard error
    const se = this.calculateSE(data, posterior, lppd, pWAIC);

    return { waic, se };
  }

  private static async calculateLPPD(data: StandardData, posterior: Posterior): Promise<number> {
    // Sample from posterior
    const posteriorSamples = await posterior.sample(1000);

    // Get data points
    const dataPoints = this.extractDataPoints(data);

    // Calculate log pointwise predictive density
    let lppd = 0;

    for (const point of dataPoints) {
      // Average likelihood over posterior samples
      const likelihoods = posteriorSamples.map((theta) =>
        Math.exp(this.logLikelihood(point, theta))
      );

      const avgLikelihood = mean(likelihoods);
      lppd += Math.log(avgLikelihood);
    }

    return lppd;
  }

  private static async calculatePWAIC(data: StandardData, posterior: Posterior): Promise<number> {
    // Variance of log predictive density
    const posteriorSamples = await posterior.sample(1000);
    const dataPoints = this.extractDataPoints(data);

    let pWAIC = 0;

    for (const point of dataPoints) {
      const logLikelihoods = posteriorSamples.map((theta) => this.logLikelihood(point, theta));

      pWAIC += variance(logLikelihoods);
    }

    return pWAIC;
  }

  /**
   * Compare multiple models and select the best
   */
  static async compareModels(
    data: StandardData,
    candidates: Array<{ config: ModelConfig; engine: InferenceEngine }>
  ): Promise<ModelComparisonResult> {
    // Fit all candidate models
    const fittedModels = await Promise.all(
      candidates.map(async ({ config, engine }) => {
        const result = await engine.fit(data, config);
        const { waic, se } = await this.calculateWAIC(data, result.posterior);

        return {
          config,
          engine,
          result,
          waic,
          se,
        };
      })
    );

    // Sort by WAIC (lower is better)
    fittedModels.sort((a, b) => a.waic - b.waic);

    // Calculate model weights (Akaike weights)
    const minWAIC = fittedModels[0].waic;
    const deltaWAIC = fittedModels.map((m) => m.waic - minWAIC);
    const weights = this.calculateAkaikeWeights(deltaWAIC);

    // Build result
    const models = fittedModels.map((m, i) => ({
      config: m.config,
      waic: m.waic,
      se: m.se,
      weight: weights[i],
    }));

    // Check if there's substantial difference
    const substantialDifference =
      models.length > 1 && models[1].waic - models[0].waic > 2 * models[0].se;

    return {
      models,
      best: {
        config: fittedModels[0].config,
        engine: fittedModels[0].engine,
      },
      summary: {
        substantialDifference,
        recommendation: this.generateRecommendation(models, substantialDifference),
      },
    };
  }

  private static calculateAkaikeWeights(deltaWAIC: number[]): number[] {
    const expTerms = deltaWAIC.map((d) => Math.exp(-0.5 * d));
    const sum = expTerms.reduce((a, b) => a + b, 0);
    return expTerms.map((e) => e / sum);
  }

  private static generateRecommendation(
    models: ModelComparisonResult['models'],
    substantialDifference: boolean
  ): string {
    if (!substantialDifference) {
      return 'Models perform similarly. Using simpler model.';
    }

    const best = models[0];
    const weight = (best.weight * 100).toFixed(1);

    return `${this.describeModel(best.config)} is best (${weight}% weight)`;
  }
}

// Integration with ModelRouter
class ModelRouter {
  // ... existing code ...

  static async routeWithComparison(
    data: StandardData,
    fitOptions?: FitOptions
  ): Promise<{ config: ModelConfig; engine: InferenceEngine }> {
    // First try simple routing
    const quickRoute = this.determineConfig(data);

    // If data suggests multiple models might work
    if (this.shouldCompareModels(data, quickRoute)) {
      const candidates = this.generateCandidates(data);
      const comparison = await ModelComparison.compareModels(data, candidates);
      return comparison.best;
    }

    // Otherwise use quick routing
    const engine = this.selectEngine(quickRoute, data, fitOptions);
    return { config: quickRoute, engine };
  }

  private static shouldCompareModels(data: StandardData, quickRoute: ModelConfig): boolean {
    // RARELY use model comparison - only when:
    // - Data quality indicators are genuinely ambiguous
    // - Sample size is large enough for meaningful WAIC differences
    // - Multiple reasonable models exist after quality-based routing
    //
    // Goal: 90%+ of decisions made by quality indicators alone

    return (
      data.n > 1000 && // Higher threshold - WAIC needs substantial data
      data.quality.hasOutliers &&
      !data.quality.hasZeros &&
      !data.quality.hasNegatives
    ); // More restrictive conditions
  }
}
```

### Files to Create

- `src/statistical/comparison/ModelComparison.ts`
- `src/statistical/comparison/WAIC.ts`
- `src/statistical/comparison/types.ts`
- `src/tests/comparison/model-comparison.test.ts`

---

## Issue 66: Migrate existing inference engines

**Priority**: P0: Critical  
**Labels**: `sprint-2`, `migration`, `engine`  
**Size**: L (Large)  
**Depends on**: Issue 1 (InferenceEngine base class)

### Description

Migrate the high-quality existing inference engines from `/src/inference/` to the new Sprint 2 architecture. This preserves excellent mathematical implementations while adopting the new capability-based routing system.

### Current Assets to Migrate

We have sophisticated implementations that need interface adaptation:

#### Exact Engines (High Priority)

- **`GammaExponential.ts`**: Solid conjugate updates for waiting time data
- **`LogNormalInference.ts`**: For positive continuous data (Issue 4 covers this)
- **`NormalNormal.ts`**: For data with negative values
- **`BetaBinomial.ts`**: Already covered in Issue 2

#### EM Engines (Critical Missing Pieces)

- **`LogNormalMixtureEM.ts`**: Sophisticated EM with fast M-step optimization
- **`NormalMixtureEM.ts`**: For mixture discovery

### Acceptance Criteria

- [ ] **GammaExponentialEngine** migrated as first-class citizen
  - Capabilities: `structures: ['simple'], types: ['gamma'], dataTypes: ['user-level']`
  - Preserves existing conjugate math
  - < 5ms performance maintained
- [ ] **LogNormalMixtureEMEngine** implements Sprint 2 pattern
  - Capabilities: `components: [2,3,4], exact: false, algorithm: 'em'`
  - Worker integration for large datasets (>1000 points)
  - Progress reporting through worker pool
- [ ] **NormalMixtureEMEngine** follows same pattern as LogNormal
- [ ] **NormalNormalEngine** for negative value handling
- [ ] All engines extend new `InferenceEngine` base class
- [ ] DataConverter bridges old `DataInput` → new `StandardData` during transition
- [ ] Mathematical implementations preserved exactly
- [ ] Error handling upgraded to `TycheError` with context

### Technical Implementation

#### Data Conversion Layer

```typescript
// Bridge between old and new data formats
export class DataConverter {
  static fromDataInput(input: DataInput): StandardData {
    if (Array.isArray(input.data)) {
      return {
        type: 'user-level',
        n: input.data.length,
        userLevel: {
          users: input.data.map((value, i) => ({
            userId: String(i),
            converted: true,
            value,
          })),
        },
        quality: this.computeQuality(input.data),
      };
    }

    if ('successes' in input.data) {
      return {
        type: 'binomial',
        n: input.data.trials,
        binomial: input.data,
        quality: { hasZeros: false, hasNegatives: false, hasOutliers: false, missingData: 0 },
      };
    }
  }
}
```

#### GammaExponentialEngine Migration

```typescript
export class GammaExponentialEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['simple'] as ModelStructure[],
    types: ['gamma'] as ModelType[],
    dataTypes: ['user-level'] as DataType[],
    components: [1],
    exact: true,
    fast: true,
    stable: true,
  };

  readonly algorithm = 'conjugate' as const;

  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    // Validate
    if (data.type !== 'user-level' || data.quality.hasZeros) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'GammaExponentialEngine requires positive continuous data',
        {
          dataType: data.type,
          hasZeros: data.quality.hasZeros,
          suggestion: 'Use compound model for zero-inflated data',
        }
      );
    }

    // Extract positive values (preserve existing logic)
    const values = data
      .userLevel!.users.filter((u) => u.converted && u.value > 0)
      .map((u) => u.value);

    // PRESERVE: Existing conjugate update math
    const posterior = this.computeGammaPosterior(values, options?.prior);

    return {
      posterior,
      diagnostics: {
        converged: true,
        logLikelihood: this.computeLogLikelihood(values, posterior),
      },
      metadata: {
        algorithm: 'conjugate',
        computeTime: 0, // Near instant
      },
    };
  }
}
```

#### LogNormalMixtureEMEngine Migration

```typescript
export class LogNormalMixtureEMEngine extends InferenceEngine {
  readonly capabilities = {
    structures: ['simple'] as ModelStructure[],
    types: ['lognormal'] as ModelType[],
    dataTypes: ['user-level'] as DataType[],
    components: [2, 3, 4] as number[],
    exact: false,
    fast: false, // EM takes time
    stable: true,
  };

  readonly algorithm = 'em' as const;

  async fit(
    data: StandardData,
    config: ModelConfig,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const values = this.extractLogValues(data);
    const k = config.components || 2;

    // Use worker for large datasets
    if (values.length > 1000) {
      return this.fitWithWorker(values, k, options);
    }

    // PRESERVE: Existing EM implementation for smaller datasets
    return this.fitMainThread(values, k, options);
  }

  private async fitWithWorker(
    values: number[],
    k: number,
    options?: FitOptions
  ): Promise<InferenceResult> {
    const workerPool = getWorkerPool();

    const params = {
      data: values,
      components: k,
      maxIterations: options?.maxIterations || 1000,
      tolerance: options?.tolerance || 1e-6,
    };

    const result = await workerPool.execute({
      id: `em-lognormal-${Date.now()}`,
      operation: 'em-fit',
      params,
      onProgress: (progress) => {
        // Report EM iteration progress
        console.log(`EM iteration ${progress.current}/${progress.total}`);
      },
    });

    return this.constructResult(result);
  }
}
```

### Migration Priority

1. **Week 1**: GammaExponentialEngine (user specifically requested)
2. **Week 1**: LogNormalMixtureEMEngine (critical missing piece)
3. **Week 2**: NormalMixtureEMEngine and NormalNormalEngine
4. **Week 2**: DataConverter and transition tooling

### Files to Create/Modify

- `src/statistical/engines/GammaExponentialEngine.ts`
- `src/statistical/engines/LogNormalMixtureEMEngine.ts`
- `src/statistical/engines/NormalMixtureEMEngine.ts`
- `src/statistical/engines/NormalNormalEngine.ts`
- `src/statistical/inference/DataConverter.ts`
- `src/workers/operations/emFit.ts` (for EM worker operations)
- `src/tests/engines/` (migrate all engine tests)

### Migration Benefits

- **Preserve Excellence**: Keep sophisticated mathematical implementations
- **Add Capabilities**: Proper routing and error handling
- **Worker Integration**: Parallel EM for large datasets
- **Future-Proof**: Easy to add more distributions (Poisson, Dirichlet, etc.)

---

## Sprint Success Criteria

- [ ] Capability-based routing working
- [ ] BetaBinomialEngine fully functional
- [ ] ConversionAnalyzer uses new routing
- [ ] Tests passing for all components
- [ ] No performance regression
- [ ] Clear error messages throughout
- [ ] Worker pool infrastructure operational
- [ ] Universal worker routing messages correctly
- [ ] Model comparison with WAIC implemented

## Risk: Circular Dependencies

Watch out for circular dependencies between:

- Engines need Distribution classes
- Posteriors implement Distribution interface
- ModelRouter needs Engines

Solution: Keep interfaces separate from implementations

## Next Sprint Preview

Sprint 3 will add business-focused features:

- RevenueAnalyzer with compound models
- CompoundInferenceEngine
- EM algorithm engines for mixtures
- Prior elicitation helpers
- Start of fluent API design
