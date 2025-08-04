# Sprint 5: HTE & Segmentation (Week 6)

## Sprint Goal

Implement heterogeneous treatment effect (HTE) discovery to find which user segments respond differently to treatments. This sprint delivers the key differentiator: finding stable, actionable segments that persist.

## Context

- Need to distinguish segments (user groups) from mixture components (value distributions)
- Segments are based on observable features (device, time, behavior)
- Supports both manual (hypothesis-driven) and discovered (data-driven) segments
- All segments analyzed through unified pipeline

## Dependencies

- ✅ Sprint 0: UserLevelData has feature support
- ✅ Sprint 3: ExperimentResult structure
- ✅ Worker infrastructure for parallel computation

---

## Issue 54: Create unified Segment interface and analyzer

**Priority**: P0: Critical  
**Labels**: `sprint-5`, `hte`, `segments`  
**Size**: L (Large)  
**Blocks**: All segment analysis

### Context

There's a critical distinction between segments (user groupings like "mobile users") and mixture components (statistical properties like "high-value customers"). Confusing these leads to uninterpretable results and breaks the business value of HTE analysis.

### What Segments Are For

Segments group users by observable characteristics to analyze who responds differently to treatments. "Mobile weekend users respond 15% better" is actionable because marketing can target this group. This is different from mixture components which identify statistical patterns in value distributions.

### Why Unified Interface Matters

Segments can come from multiple sources: manual definition (hypothesis-driven), causal tree discovery (data-driven), or mixture analysis (value-based). The HTEAnalyzer needs to handle all sources through the same pipeline while preserving their different characteristics and validation requirements.

### Implementation Requirements

- [ ] Unified Segment interface supporting all sources (manual, causal tree, mixture-derived)
- [ ] Clear separation from mixture components in both interface and analysis
- [ ] Integration with ExperimentResult.discoverSegments() method
- [ ] Treatment effect analysis within each segment using existing analyzers
- [ ] HTEResult with validation metrics (stability, meaningfulness, practical impact)
- [ ] Cross-segment comparison to identify largest differences

### Technical Implementation

```typescript
// Segment interface is defined in InterfaceStandards.md
// Key aspects:
// - Segments are user groupings based on observable features
// - Not to be confused with mixture components
// - Used for analyzing differential treatment effects

interface HTEResult {
  segments: Segment[];

  validation: {
    stability: number; // Bootstrap stability score
    probabilityMeaningful: number; // P(effect > meaningful threshold)
    practicalImpact: number; // Business impact score
  };

  tree?: CausalTreeNode; // If from causal tree discovery

  crossSegmentComparison: {
    largestDifference: number;
    segmentPairs: Array<{
      segment1: string;
      segment2: string;
      effectDifference: number;
      ci95: [number, number];
    }>;
  };
}

class HTEAnalyzer {
  constructor(private workerPool: WorkerPool) {}

  async analyze(
    result: ExperimentResult,
    data: ExperimentData,
    segments?: Segment[] // Optional pre-defined segments
  ): Promise<HTEResult> {
    // If no segments provided, discover them
    if (!segments) {
      segments = await this.discoverSegments(result, data);
    }

    // Analyze each segment
    const analyzedSegments = await this.analyzeSegments(segments, data, result);

    // Validate segments
    const validation = await this.validateSegments(analyzedSegments, data);

    // Compare across segments
    const comparison = this.compareSegments(analyzedSegments);

    return {
      segments: analyzedSegments,
      validation,
      crossSegmentComparison: comparison,
    };
  }

  private async analyzeSegments(
    segments: Segment[],
    data: ExperimentData,
    parentResult: ExperimentResult
  ): Promise<Segment[]> {
    return Promise.all(
      segments.map(async (segment) => {
        // Filter data for this segment
        const segmentData = this.filterDataForSegment(data, segment);

        // Run same analysis as parent
        const analyzer = this.getAnalyzerForResult(parentResult);
        const segmentResult = await analyzer.analyze(segmentData);

        // Extract treatment effect
        const comparison = await segmentResult.compareVariants();
        const primaryEffect = comparison.comparisons[0]; // vs control

        return {
          ...segment,
          effect: {
            estimate: primaryEffect.effect.estimate,
            ci95: primaryEffect.effect.uncertainty,
            posterior: primaryEffect.posterior,
          },
        };
      })
    );
  }

  private filterDataForSegment(data: ExperimentData, segment: Segment): ExperimentData {
    const filteredVariants: any = {
      control: this.filterVariant(data.variants.control, segment),
    };

    filteredVariants.treatments = new Map();
    for (const [name, variant] of data.variants.treatments) {
      filteredVariants.treatments.set(name, this.filterVariant(variant, segment));
    }

    return {
      ...data,
      variants: filteredVariants,
    };
  }

  private filterVariant(variant: VariantData, segment: Segment): VariantData {
    if (!variant.users) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'HTE analysis requires user-level data with features'
      );
    }

    const filteredUsers = variant.users.filter(segment.definition.selector);

    return {
      ...variant,
      n: filteredUsers.length,
      users: filteredUsers,
    };
  }
}
```

### Files to Create

- `src/domain/hte/HTEAnalyzer.ts`
- `src/domain/hte/types.ts`
- `src/tests/hte/hte-analyzer.test.ts`

---

## Issue 55: Implement manual segment definition

**Priority**: P0: Critical  
**Labels**: `sprint-5`, `segments`, `manual`  
**Size**: M (Medium)  
**Depends on**: Issue 1

### Description

Allow users to define segments based on hypotheses about their users (e.g., "mobile users", "weekend shoppers").

### Acceptance Criteria

- [ ] Simple API for defining segments
- [ ] Common segment builders (device, time, value ranges)
- [ ] Segment validation (min size requirements)
- [ ] Combine multiple conditions (AND/OR)
- [ ] Save/load segment definitions
- [ ] Integration with HTEAnalyzer

### Technical Implementation

```typescript
// Segment builders for common patterns
class SegmentBuilder {
  static device(type: 'mobile' | 'desktop' | 'tablet'): Segment {
    return {
      id: `device-${type}`,
      name: `${type} users`,
      source: 'manual',
      definition: {
        selector: (user) => user.features?.device === type,
        description: `Users on ${type} devices`,
        features: ['device'],
      },
      population: { size: 0, percentage: 0 }, // Filled during analysis
    };
  }

  static timeOfWeek(days: string[]): Segment {
    return {
      id: `dow-${days.join('-')}`,
      name: `${days.join('/')} users`,
      source: 'manual',
      definition: {
        selector: (user) => days.includes(user.features?.dayOfWeek || ''),
        description: `Users active on ${days.join(', ')}`,
        features: ['dayOfWeek'],
      },
      population: { size: 0, percentage: 0 },
    };
  }

  static valueRange(min: number, max: number): Segment {
    return {
      id: `value-${min}-${max}`,
      name: `$${min}-$${max} spenders`,
      source: 'manual',
      definition: {
        selector: (user) => user.value >= min && user.value <= max,
        description: `Users with value between $${min} and $${max}`,
        features: [], // Based on outcome, not features
      },
      population: { size: 0, percentage: 0 },
    };
  }

  static custom(
    name: string,
    selector: (user: UserLevelData) => boolean,
    description: string
  ): Segment {
    return {
      id: `custom-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      source: 'manual',
      definition: {
        selector,
        description,
        features: [], // Unknown
      },
      population: { size: 0, percentage: 0 },
    };
  }

  // Combine segments
  static and(...segments: Segment[]): Segment {
    return {
      id: segments.map((s) => s.id).join('-and-'),
      name: segments.map((s) => s.name).join(' AND '),
      source: 'manual',
      definition: {
        selector: (user) => segments.every((s) => s.definition.selector(user)),
        description: `Users matching all: ${segments.map((s) => s.name).join(', ')}`,
        features: Array.from(new Set(segments.flatMap((s) => s.definition.features || []))),
      },
      population: { size: 0, percentage: 0 },
    };
  }

  static or(...segments: Segment[]): Segment {
    return {
      id: segments.map((s) => s.id).join('-or-'),
      name: segments.map((s) => s.name).join(' OR '),
      source: 'manual',
      definition: {
        selector: (user) => segments.some((s) => s.definition.selector(user)),
        description: `Users matching any: ${segments.map((s) => s.name).join(', ')}`,
        features: Array.from(new Set(segments.flatMap((s) => s.definition.features || []))),
      },
      population: { size: 0, percentage: 0 },
    };
  }
}

// Usage examples
const mobileWeekend = SegmentBuilder.and(
  SegmentBuilder.device('mobile'),
  SegmentBuilder.timeOfWeek(['Saturday', 'Sunday'])
);

const highValueDesktop = SegmentBuilder.and(
  SegmentBuilder.device('desktop'),
  SegmentBuilder.valueRange(100, Infinity)
);

// Validate segments
class SegmentValidator {
  static validate(segment: Segment, data: ExperimentData, minSize: number = 100): ValidationResult {
    let totalUsers = 0;
    let segmentUsers = 0;

    // Count users across all variants
    for (const variant of Object.values(data.variants)) {
      if (variant.users) {
        totalUsers += variant.users.length;
        segmentUsers += variant.users.filter(segment.definition.selector).length;
      }
    }

    const percentage = (segmentUsers / totalUsers) * 100;

    if (segmentUsers < minSize) {
      return {
        valid: false,
        reason: `Segment too small: ${segmentUsers} users (min: ${minSize})`,
        stats: { size: segmentUsers, percentage },
      };
    }

    if (percentage < 1) {
      return {
        valid: false,
        reason: `Segment too small: ${percentage.toFixed(1)}% of users`,
        stats: { size: segmentUsers, percentage },
      };
    }

    return {
      valid: true,
      stats: { size: segmentUsers, percentage },
    };
  }
}
```

### Files to Create

- `src/domain/hte/SegmentBuilder.ts`
- `src/domain/hte/SegmentValidator.ts`
- `src/tests/hte/segment-builder.test.ts`

---

## Issue 56: Implement constrained causal trees

**Priority**: P1: High  
**Labels**: `sprint-5`, `causal-tree`, `discovery`  
**Size**: XL (Extra Large)  
**Depends on**: Issue 1

### Description

Implement causal tree algorithm with constraints to find interpretable, stable segments where treatment effects differ.

### Acceptance Criteria

- [ ] Honest splitting (separate data for split finding and estimation)
- [ ] Max depth 3 for interpretability
- [ ] Min segment size 10% of population
- [ ] Min effect size 2% to split
- [ ] Only split on pre-treatment features
- [ ] Bootstrap validation of discovered segments
- [ ] Return tree structure with Segment objects

### Technical Implementation

```typescript
interface CausalTreeConfig {
  maxDepth: number; // 3 for interpretability
  minSegmentSize: number; // Percentage of total (0.1 = 10%)
  minEffectSize: number; // Minimum effect to split (0.02 = 2%)
  validationSplits: number; // For honest splitting
  features: string[]; // Which features to consider
}

interface CausalTreeNode {
  // Tree structure
  feature?: string;
  threshold?: number | string; // Numeric or categorical split
  left?: CausalTreeNode;
  right?: CausalTreeNode;

  // Segment info
  segment: Segment;
  sampleSize: number;

  // Effect estimate
  effect: {
    estimate: number;
    ci95: [number, number];
    heterogeneity?: number; // How different from parent
  };
}

class CausalTreeBuilder {
  constructor(
    private config: CausalTreeConfig = {
      maxDepth: 3,
      minSegmentSize: 0.1,
      minEffectSize: 0.02,
      validationSplits: 5,
      features: ['device', 'dayOfWeek', 'hour'],
    }
  ) {}

  async buildTree(data: ExperimentData, parentResult: ExperimentResult): Promise<CausalTreeNode> {
    // Honest splitting: divide data
    const { trainData, testData } = this.honestSplit(data);

    // Build tree on training data
    const tree = await this.growTree(trainData, testData, parentResult, (depth = 0));

    // Convert to segments
    const segments = this.extractSegments(tree);

    // Validate via bootstrap
    const validation = await this.validateTree(tree, data);

    return tree;
  }

  private async growTree(
    trainData: ExperimentData,
    testData: ExperimentData,
    parentResult: ExperimentResult,
    depth: number,
    parentNode?: CausalTreeNode
  ): Promise<CausalTreeNode> {
    // Check stopping criteria
    if (depth >= this.config.maxDepth) {
      return this.createLeaf(testData, parentResult);
    }

    const sampleSize = this.countUsers(trainData);
    const minSize = sampleSize * this.config.minSegmentSize;

    if (sampleSize < minSize * 2) {
      // Need enough for both children
      return this.createLeaf(testData, parentResult);
    }

    // Find best split on training data
    const bestSplit = await this.findBestSplit(trainData, parentResult, this.config.features);

    if (!bestSplit || bestSplit.improvement < this.config.minEffectSize) {
      return this.createLeaf(testData, parentResult);
    }

    // Split both datasets
    const { left: leftTrain, right: rightTrain } = this.splitData(trainData, bestSplit);
    const { left: leftTest, right: rightTest } = this.splitData(testData, bestSplit);

    // Recursively build children
    const node: CausalTreeNode = {
      feature: bestSplit.feature,
      threshold: bestSplit.threshold,
      segment: this.createSegmentFromSplit(bestSplit, testData),
      sampleSize: this.countUsers(testData),
      effect: await this.estimateEffect(testData, parentResult),
    };

    node.left = await this.growTree(leftTrain, leftTest, parentResult, depth + 1, node);

    node.right = await this.growTree(rightTrain, rightTest, parentResult, depth + 1, node);

    return node;
  }

  private async findBestSplit(
    data: ExperimentData,
    parentResult: ExperimentResult,
    features: string[]
  ): Promise<Split | null> {
    let bestSplit: Split | null = null;
    let bestImprovement = 0;

    // Try each feature
    for (const feature of features) {
      const splits = this.generateSplits(data, feature);

      for (const split of splits) {
        const improvement = await this.evaluateSplit(data, split, parentResult);

        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestSplit = { ...split, improvement };
        }
      }
    }

    return bestSplit;
  }

  private generateSplits(data: ExperimentData, feature: string): Split[] {
    // Collect all unique values
    const values = new Set<any>();

    for (const variant of Object.values(data.variants)) {
      if (variant.users) {
        for (const user of variant.users) {
          if (user.features?.[feature] !== undefined) {
            values.add(user.features[feature]);
          }
        }
      }
    }

    const uniqueValues = Array.from(values);

    // For numeric features, try percentiles
    if (typeof uniqueValues[0] === 'number') {
      const sorted = uniqueValues.sort((a, b) => a - b);
      const percentiles = [25, 50, 75];

      return percentiles.map((p) => ({
        feature,
        threshold: sorted[Math.floor((sorted.length * p) / 100)],
        type: 'numeric' as const,
      }));
    }

    // For categorical, try each value
    return uniqueValues.map((value) => ({
      feature,
      threshold: value,
      type: 'categorical' as const,
    }));
  }

  private createSegmentFromSplit(split: Split, data: ExperimentData): Segment {
    const selector =
      split.type === 'numeric'
        ? (user: UserLevelData) => (user.features?.[split.feature] || 0) <= split.threshold
        : (user: UserLevelData) => user.features?.[split.feature] === split.threshold;

    const description =
      split.type === 'numeric'
        ? `${split.feature} <= ${split.threshold}`
        : `${split.feature} = ${split.threshold}`;

    return {
      id: `tree-${split.feature}-${split.threshold}`,
      name: description,
      source: 'causal_tree',
      definition: {
        selector,
        description,
        features: [split.feature],
      },
      population: { size: 0, percentage: 0 }, // Filled later
    };
  }
}
```

### Files to Create

- `src/domain/hte/CausalTreeBuilder.ts`
- `src/domain/hte/tree-validation.ts`
- `src/workers/causalTree.worker.ts`
- `src/tests/hte/causal-tree.test.ts`

---

## Issue 57: Add bootstrap validation for segments

**Priority**: P1: High  
**Labels**: `sprint-5`, `validation`, `bootstrap`  
**Size**: M (Medium)  
**Depends on**: Issue 1, Issue 3

### Description

Implement bootstrap validation to ensure discovered segments are stable and not just noise.

### Acceptance Criteria

- [ ] Bootstrap resampling of experiment data
- [ ] Rebuild segments on each bootstrap sample
- [ ] Calculate stability metrics
- [ ] Identify which segments persist
- [ ] Return confidence in each segment
- [ ] Use worker pool for parallel bootstrap

### Technical Implementation

```typescript
interface BootstrapValidation {
  runs: number; // Number of bootstrap samples
  segmentAppearances: Map<string, number>; // How often each segment appears
  effectVariability: Map<string, number[]>; // Effect estimates across runs
  stability: number; // Overall stability score
}

class SegmentValidator {
  constructor(private workerPool: WorkerPool) {}

  async validateSegments(
    segments: Segment[],
    data: ExperimentData,
    method: 'causal_tree' | 'manual',
    runs: number = 100
  ): Promise<BootstrapValidation> {
    // Create bootstrap tasks
    const tasks: WorkerTask<BootstrapParams, BootstrapResult>[] = Array.from(
      { length: runs },
      (_, i) => ({
        id: `bootstrap-${i}`,
        operation: 'bootstrap-validation',
        params: {
          data: this.serializeData(data),
          segments: this.serializeSegments(segments),
          method,
          seed: i, // For reproducibility
        },
        timeout: 10000,
      })
    );

    // Run in parallel
    const results = await this.workerPool.executeMany(tasks, {
      maxConcurrency: 4,
      onProgress: (completed, total) => {
        console.log(`Bootstrap: ${completed}/${total}`);
      },
    });

    // Aggregate results
    return this.aggregateResults(results, segments);
  }

  private aggregateResults(
    results: BootstrapResult[],
    originalSegments: Segment[]
  ): BootstrapValidation {
    const appearances = new Map<string, number>();
    const effects = new Map<string, number[]>();

    // Count appearances and collect effects
    for (const run of results) {
      for (const segment of run.discoveredSegments) {
        // Match to original segments
        const matched = this.matchSegment(segment, originalSegments);
        if (matched) {
          appearances.set(matched.id, (appearances.get(matched.id) || 0) + 1);

          if (!effects.has(matched.id)) {
            effects.set(matched.id, []);
          }
          effects.get(matched.id)!.push(segment.effect!.estimate);
        }
      }
    }

    // Calculate overall stability
    const stability = this.calculateStability(appearances, effects, results.length);

    return {
      runs: results.length,
      segmentAppearances: appearances,
      effectVariability: effects,
      stability,
    };
  }

  private calculateStability(
    appearances: Map<string, number>,
    effects: Map<string, number[]>,
    totalRuns: number
  ): number {
    let stabilityScore = 0;
    let segmentCount = 0;

    for (const [segmentId, count] of appearances) {
      const appearanceRate = count / totalRuns;
      const effectEstimates = effects.get(segmentId) || [];

      if (effectEstimates.length > 0) {
        const effectCV = this.coefficientOfVariation(effectEstimates);

        // High appearance rate + low effect variability = stable
        const segmentStability = appearanceRate * (1 - Math.min(effectCV, 1));
        stabilityScore += segmentStability;
        segmentCount++;
      }
    }

    return segmentCount > 0 ? stabilityScore / segmentCount : 0;
  }

  private coefficientOfVariation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    return Math.abs(std / mean);
  }
}

// Worker implementation
async function performBootstrap(params: BootstrapParams): Promise<BootstrapResult> {
  // Resample data with replacement
  const resampledData = resampleExperimentData(params.data, params.seed);

  if (params.method === 'causal_tree') {
    // Rebuild tree on resampled data
    const tree = await rebuildCausalTree(resampledData);
    const segments = extractSegmentsFromTree(tree);

    return {
      discoveredSegments: segments,
      tree,
    };
  } else {
    // Re-analyze manual segments on resampled data
    const segments = await reanalyzeSegments(params.segments, resampledData);

    return {
      discoveredSegments: segments,
    };
  }
}
```

### Files to Create

- `src/domain/hte/SegmentValidator.ts`
- `src/domain/hte/bootstrap-utils.ts`
- `src/workers/bootstrap.worker.ts`
- `src/tests/hte/validation.test.ts`

---

## Issue 58: Update ExperimentResult.discoverSegments()

**Priority**: P1: High  
**Labels**: `sprint-5`, `integration`, `api`  
**Size**: S (Small)  
**Depends on**: Issue 1

### Description

Connect the HTE analysis to ExperimentResult so users can discover segments from any experiment result.

### Acceptance Criteria

- [ ] Implement discoverSegments() method
- [ ] Support options for manual vs automatic discovery
- [ ] Return HTEResult with all segments
- [ ] Cache results for repeated calls
- [ ] Clear error for insufficient data

### Technical Implementation

```typescript
class ExperimentResult extends AnalysisResult {
  private cachedHTE?: HTEResult;

  async discoverSegments(options?: {
    method?: 'auto' | 'causal_tree';
    config?: CausalTreeConfig;
  }): Promise<HTEResult> {
    // Check cache
    if (this.cachedHTE && !options) {
      return this.cachedHTE;
    }

    // Get experiment data (stored in metadata)
    const experimentData = this.metadata.experimentData;
    if (!experimentData) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'Experiment data required for segment discovery'
      );
    }

    // Check data has features
    const hasFeatures = this.checkFeatureAvailability(experimentData);
    if (!hasFeatures) {
      throw new TycheError(
        ErrorCode.INVALID_DATA,
        'User features required for automatic segment discovery',
        {
          suggestion: 'Use manual segments or ensure UserLevelData includes features',
        }
      );
    }

    // Create analyzer with worker pool
    const analyzer = new HTEAnalyzer(getWorkerPool());

    // Discover segments based on method
    let segments: Segment[] | undefined;

    if (options?.method === 'causal_tree' || options?.method === 'auto') {
      // Build causal tree
      const builder = new CausalTreeBuilder(options.config);
      const tree = await builder.buildTree(experimentData, this);
      segments = this.extractSegmentsFromTree(tree);

      // Analyze with discovered segments
      const result = await analyzer.analyze(this, experimentData, segments);
      result.tree = tree;

      // Cache if using defaults
      if (!options) {
        this.cachedHTE = result;
      }

      return result;
    }

    throw new TycheError(ErrorCode.INVALID_DATA, 'Must specify discovery method for HTE analysis');
  }

  async analyzeSegments(segments: Segment[]): Promise<HTEResult> {
    // Get experiment data
    const experimentData = this.metadata.experimentData;
    if (!experimentData) {
      throw new TycheError(ErrorCode.INVALID_DATA, 'Experiment data required for segment analysis');
    }

    // Create analyzer
    const analyzer = new HTEAnalyzer(getWorkerPool());

    // Analyze provided segments
    return analyzer.analyze(this, experimentData, segments);
  }

  private checkFeatureAvailability(data: ExperimentData): boolean {
    for (const variant of Object.values(data.variants)) {
      if (variant.users) {
        return variant.users.some((u) => u.features && Object.keys(u.features).length > 0);
      }
    }
    return false;
  }
}

// Usage examples
// Automatic discovery
const segments = await result.discoverSegments({
  method: 'causal_tree',
  config: {
    maxDepth: 3,
    minSegmentSize: 0.1,
    features: ['device', 'dayOfWeek'],
  },
});

// Manual segments
const manualSegments = await result.analyzeSegments([
  SegmentBuilder.device('mobile'),
  SegmentBuilder.device('desktop'),
  SegmentBuilder.timeOfWeek(['Saturday', 'Sunday']),
]);
```

### Files to Modify

- `src/domain/results/ExperimentResult.ts`
- `src/tests/results/experiment-result.test.ts`

---

## Sprint Success Criteria

- [ ] Unified segment analysis working
- [ ] Manual segments can be defined and analyzed
- [ ] Causal tree discovers meaningful segments
- [ ] Bootstrap validation ensures stability
- [ ] Clear distinction from mixture components
- [ ] Integration with existing result objects
- [ ] All tests passing

## Performance Targets

- Manual segment analysis: < 1s for 5 segments
- Causal tree building: < 30s for typical data
- Bootstrap validation: < 60s for 100 runs

## Note on Dependence Research (Phase 2.5)

The dependence research mentioned in the roadmap remains as a spike task. Current implementation assumes independence between frequency and severity in compound models.

## Next Sprint Preview

Sprint 6 (Phase 4) will add:

- Export functionality (PDF, notebooks)
- Natural language insights
- Progress tracking improvements
- Error recovery strategies
- Demo application
