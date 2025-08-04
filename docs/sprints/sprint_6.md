# Sprint 6: Polish & Integration (Week 7)

## Sprint Goal

Polish the user experience with export capabilities, natural language insights, and a complete demo application. This sprint makes Tyche ready for real users.

## Context

- Core functionality is complete
- Need to make results shareable and understandable
- Demo app showcases the full progressive analysis journey
- Error handling and recovery make it production-ready

## Dependencies

- ✅ All previous sprints
- ✅ Complete analysis pipeline working
- ✅ UnifiedDistributionViz already exists in codebase

---

## Issue 59: Create embeddable visualization bundle

**Priority**: P0: Critical  
**Labels**: `sprint-6`, `export`, `visualization`  
**Size**: L (Large)

### Context

Analysis results are only valuable if they can be shared effectively. Users need to embed Tyche visualizations in reports, dashboards, presentations, and external websites without requiring the full Tyche application or forcing viewers to click through to another tool.

### What This Enables

A lightweight, embeddable bundle that renders Tyche visualizations anywhere HTML/JavaScript can run. The same rich distributional visualizations that work in the main app become available as a simple script tag embed, maintaining full interactivity while integrating seamlessly with existing workflows.

### Design Constraints

The bundle must be small enough for fast loading (<200KB), work without React on the host page, and handle cross-origin data sharing securely. It reuses the existing UnifiedDistributionViz component rather than reimplementing visualization logic.

### Implementation Requirements

- [ ] Standalone bundle using existing UnifiedDistributionViz component
- [ ] Self-contained (bundles React, no external dependencies on host page)
- [ ] Simple embed API (TycheEmbed.renderDistribution())
- [ ] Configurable styling for brand consistency
- [ ] All visualization modes (density, histogram, comparison)
- [ ] Secure cross-origin data handling
- [ ] <200KB bundle size through optimization

### Technical Implementation

```typescript
// Embeddable API wrapper
class TycheEmbed {
  static async renderDistribution(
    container: string | HTMLElement,
    data: any,
    options?: EmbedOptions
  ): Promise<void> {
    const element = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!element) throw new Error('Container not found');

    // Create React root and render
    const root = createRoot(element);
    root.render(
      <UnifiedDistributionViz
        distributions={data.distributions}
        display={options?.display || { mode: 'density' }}
        width={options?.width || element.clientWidth}
        height={options?.height || 400}
      />
    );
  }

  static async renderComparison(
    container: string | HTMLElement,
    control: any,
    treatment: any,
    options?: EmbedOptions
  ): Promise<void> {
    const distributions = [
      { id: 'control', label: 'Control', posterior: control },
      { id: 'treatment', label: 'Treatment', posterior: treatment }
    ];

    await this.renderDistribution(container, { distributions }, {
      ...options,
      comparison: { show: true, type: 'difference' }
    });
  }
}

// Usage on external site:
// <script src="https://cdn.tyche.ai/embed.js"></script>
// <div id="tyche-plot"></div>
// <script>
//   TycheEmbed.renderDistribution('#tyche-plot', tycheData);
// </script>

// Webpack config for embeddable bundle
module.exports = {
  entry: './src/embed/index.ts',
  output: {
    filename: 'tyche-embed.js',
    library: 'TycheEmbed',
    libraryTarget: 'umd'
  },
  externals: {
    // Bundle React with the embed
  },
  optimization: {
    minimize: true,
    usedExports: true
  }
};
```

### Files to Create

- `src/embed/index.ts`
- `src/embed/TycheEmbed.ts`
- `webpack.embed.config.js`
- `src/tests/embed/embed.test.ts`

---

## Issue 60: Implement export functionality

**Priority**: P0: Critical  
**Labels**: `sprint-6`, `export`, `results`  
**Size**: L (Large)

### Description

Add ability to export results in multiple formats for sharing and further analysis.

### Acceptance Criteria

- [ ] Export to JSON with full posteriors
- [ ] Export to CSV with summary statistics
- [ ] Export to Python code (basic script)
- [ ] Export to R code (basic script)
- [ ] Export to PDF report
- [ ] Include visualizations in exports where applicable
- [ ] Preserve all metadata

### Technical Implementation

```typescript
interface ExportOptions {
  format: 'json' | 'csv' | 'pdf' | 'python' | 'r';

  // What to include
  include: {
    posteriors?: boolean; // Full posterior samples
    visualizations?: boolean; // Charts and plots
    segments?: boolean; // HTE analysis if available
    diagnostics?: boolean; // Convergence, etc.
    interpretation?: boolean; // Natural language insights
  };

  // Format-specific options
  json?: {
    pretty?: boolean;
    samplesCount?: number; // How many posterior samples
  };

  csv?: {
    delimiter?: string;
    nested?: 'flatten' | 'separate-files';
  };

  pdf?: {
    template?: 'executive' | 'technical' | 'full';
  };
}

abstract class Exporter {
  abstract export(result: ExperimentResult, options: ExportOptions): Promise<Blob>;
}

class JSONExporter extends Exporter {
  async export(result: ExperimentResult, options: ExportOptions): Promise<Blob> {
    const data: any = {
      metadata: result.metadata,
      summary: result.summary(),
      variants: {},
    };

    // Export each variant
    for (const [name, variantResult] of result.getVariantResults()) {
      data.variants[name] = {
        summary: variantResult.summary(),
        decomposition: variantResult.getDecomposition(),
        components: variantResult.getComponents(),
      };

      // Include posterior samples if requested
      if (options.include.posteriors) {
        const samples = await variantResult
          .getPosterior()
          .sample(options.json?.samplesCount || 1000);
        data.variants[name].posteriorSamples = samples;
      }
    }

    // Include segments if available
    if (options.include.segments && result.cachedHTE) {
      data.segments = result.cachedHTE;
    }

    const json = options.json?.pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);

    return new Blob([json], { type: 'application/json' });
  }
}

class PythonCodeExporter extends Exporter {
  async export(result: ExperimentResult, options: ExportOptions): Promise<Blob> {
    const summary = result.summary();

    // Generate basic Python script
    const code = `#!/usr/bin/env python3
"""
Tyche Analysis Results
Experiment: ${result.metadata.experimentName || 'Untitled'}
Generated: ${new Date().toISOString()}
"""

import numpy as np
import matplotlib.pyplot as plt
from scipy import stats

# Summary statistics
control_mean = ${summary.variants.get('control')?.mean || 0}
treatment_mean = ${summary.variants.get('treatment')?.mean || 0}
lift = ${summary.primaryComparison.lift.estimate}
ci_lower = ${summary.primaryComparison.lift.uncertainty[0]}
ci_upper = ${summary.primaryComparison.lift.uncertainty[1]}
probability_positive = ${summary.primaryComparison.lift.probabilityPositive}

# Results
print(f"Control mean: {control_mean:.4f}")
print(f"Treatment mean: {treatment_mean:.4f}")
print(f"Lift: {lift:.2%} [{ci_lower:.2%}, {ci_upper:.2%}]")
print(f"Probability of improvement: {probability_positive:.1%}")

${options.include.posteriors ? this.generatePosteriorCode(result) : ''}

${options.include.visualizations ? this.generateVisualizationCode(result) : ''}
`;

    return new Blob([code], { type: 'text/plain' });
  }

  private generatePosteriorCode(result: ExperimentResult): string {
    return `
# Posterior samples (subset)
# Note: Full posterior analysis requires the original data
# These samples are for illustration only
`;
  }

  private generateVisualizationCode(result: ExperimentResult): string {
    return `
# Visualization
fig, ax = plt.subplots(figsize=(10, 6))

# Plot effect size with CI
ax.bar(['Effect'], [lift], yerr=[[lift - ci_lower], [ci_upper - lift]], 
       capsize=10, color='steelblue', alpha=0.7)
ax.axhline(y=0, color='black', linestyle='--', alpha=0.5)
ax.set_ylabel('Relative Effect')
ax.set_title(f'Treatment Effect: {lift:.1%} [{ci_lower:.1%}, {ci_upper:.1%}]')

plt.tight_layout()
plt.show()
`;
  }
}

class PDFExporter extends Exporter {
  async export(result: ExperimentResult, options: ExportOptions): Promise<Blob> {
    // Use a library like jsPDF or pdfmake
    const doc = new PDFDocument();

    // Add content based on template
    const template = options.pdf?.template || 'executive';

    switch (template) {
      case 'executive':
        await this.addExecutiveSummary(doc, result);
        break;
      case 'technical':
        await this.addTechnicalDetails(doc, result);
        break;
      case 'full':
        await this.addExecutiveSummary(doc, result);
        await this.addTechnicalDetails(doc, result);
        await this.addAppendix(doc, result);
        break;
    }

    return doc.toBlob();
  }
}

// Export manager
class ExportManager {
  private exporters = new Map<string, Exporter>([
    ['json', new JSONExporter()],
    ['csv', new CSVExporter()],
    ['pdf', new PDFExporter()],
    ['python', new PythonCodeExporter()],
    ['r', new RCodeExporter()],
  ]);

  async export(result: ExperimentResult, options: ExportOptions): Promise<Blob> {
    const exporter = this.exporters.get(options.format);
    if (!exporter) {
      throw new Error(`Unknown export format: ${options.format}`);
    }

    return exporter.export(result, options);
  }
}
```

### Files to Create

- `src/domain/export/ExportManager.ts`
- `src/domain/export/exporters/JSONExporter.ts`
- `src/domain/export/exporters/CSVExporter.ts`
- `src/domain/export/exporters/PDFExporter.ts`
- `src/domain/export/exporters/PythonCodeExporter.ts`
- `src/domain/export/exporters/RCodeExporter.ts`
- `src/tests/export/*.test.ts`

---

## Issue 61: Add natural language insights

**Priority**: P1: High  
**Labels**: `sprint-6`, `insights`, `nlg`  
**Size**: M (Medium)

### Description

Generate human-readable insights from analysis results to make findings accessible to non-statisticians.

### Acceptance Criteria

- [ ] Generate key findings summary
- [ ] Explain statistical concepts in plain language
- [ ] Highlight practical significance
- [ ] Warn about potential issues
- [ ] Customize language for audience level
- [ ] Support multiple languages (start with English)

### Technical Implementation

```typescript
interface InsightOptions {
  audience: 'executive' | 'analyst' | 'technical';
  language?: 'en' | 'es' | 'fr'; // Start with English

  focus?: Array<'effect-size' | 'uncertainty' | 'segments' | 'recommendations'>;

  includeWarnings?: boolean;
  includeMethodology?: boolean;
}

interface Insight {
  type: 'finding' | 'warning' | 'recommendation' | 'explanation';
  priority: 'high' | 'medium' | 'low';
  text: string;

  // Optional structured data
  data?: {
    metric?: string;
    value?: number;
    confidence?: number;
    segment?: string;
  };
}

class InsightGenerator {
  generateInsights(
    result: ExperimentResult,
    options: InsightOptions = { audience: 'analyst' }
  ): Insight[] {
    const insights: Insight[] = [];

    // Primary findings
    insights.push(...this.generatePrimaryFindings(result, options));

    // Uncertainty communication
    insights.push(...this.generateUncertaintyInsights(result, options));

    // Segment insights if available
    if (result.cachedHTE) {
      insights.push(...this.generateSegmentInsights(result.cachedHTE, options));
    }

    // Warnings and caveats
    if (options.includeWarnings) {
      insights.push(...this.generateWarnings(result, options));
    }

    // Recommendations
    insights.push(...this.generateRecommendations(result, options));

    // Sort by priority
    return insights.sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority];
    });
  }

  private generatePrimaryFindings(result: ExperimentResult, options: InsightOptions): Insight[] {
    const insights: Insight[] = [];
    const summary = result.summary();

    // Main effect
    const lift = summary.primaryComparison.lift;
    const effectText = this.formatEffect(lift, options.audience);

    insights.push({
      type: 'finding',
      priority: 'high',
      text: effectText,
      data: {
        metric: 'primary',
        value: lift.estimate,
        confidence: lift.probabilityPositive,
      },
    });

    // Practical significance
    if (Math.abs(lift.estimate) < 0.02) {
      insights.push({
        type: 'finding',
        priority: 'medium',
        text:
          options.audience === 'executive'
            ? 'The difference between variants is too small to matter for business decisions.'
            : `The effect size (${(lift.estimate * 100).toFixed(1)}%) is below typical thresholds for practical significance.`,
      });
    }

    return insights;
  }

  private formatEffect(
    effect: EffectEstimate,
    audience: 'executive' | 'analyst' | 'technical'
  ): string {
    const percentage = (effect.estimate * 100).toFixed(1);
    const direction = effect.estimate > 0 ? 'increase' : 'decrease';
    const confidence = (effect.probabilityPositive * 100).toFixed(0);

    switch (audience) {
      case 'executive':
        if (effect.probabilityPositive > 0.95) {
          return `The treatment shows a ${percentage}% ${direction}. We're confident this is a real effect.`;
        } else if (effect.probabilityPositive > 0.8) {
          return `The treatment likely shows a ${percentage}% ${direction}, but we'd recommend more data to be certain.`;
        } else {
          return `We cannot determine if the treatment has a meaningful effect. The data is inconclusive.`;
        }

      case 'analyst':
        return `Treatment effect: ${percentage}% ${direction} (${confidence}% probability of improvement, 95% CI: [${(effect.uncertainty[0] * 100).toFixed(1)}%, ${(effect.uncertainty[1] * 100).toFixed(1)}%])`;

      case 'technical':
        return `Posterior mean effect: ${effect.estimate.toFixed(4)} (95% HDI: [${effect.uncertainty[0].toFixed(4)}, ${effect.uncertainty[1].toFixed(4)}], P(effect > 0) = ${effect.probabilityPositive.toFixed(3)})`;
    }
  }

  private generateSegmentInsights(hte: HTEResult, options: InsightOptions): Insight[] {
    const insights: Insight[] = [];

    // Find most responsive segment
    const sorted = [...hte.segments].sort(
      (a, b) => Math.abs(b.effect!.estimate) - Math.abs(a.effect!.estimate)
    );

    if (sorted.length > 0 && sorted[0].effect) {
      const best = sorted[0];
      const diff = best.effect.estimate - hte.segments[0].effect!.estimate;

      if (Math.abs(diff) > 0.05) {
        insights.push({
          type: 'finding',
          priority: 'high',
          text:
            options.audience === 'executive'
              ? `${best.name} respond ${(Math.abs(diff) * 100).toFixed(0)}% better to the treatment than average.`
              : `Strong heterogeneity detected: ${best.name} show ${(diff * 100).toFixed(1)}% stronger treatment effect (${(segmentProbability * 100).toFixed(0)}% probability this difference is real).`,
          data: {
            segment: best.name,
            value: diff,
          },
        });
      }
    }

    // Stability warning if needed
    if (hte.validation.stability < 0.7) {
      insights.push({
        type: 'warning',
        priority: 'medium',
        text: 'The identified segments show moderate variability. Consider collecting more data before targeting based on these segments.',
      });
    }

    return insights;
  }

  private generateRecommendations(result: ExperimentResult, options: InsightOptions): Insight[] {
    const insights: Insight[] = [];
    const summary = result.summary();

    // Clear winner
    if (summary.primaryComparison.lift.probabilityPositive > 0.95) {
      insights.push({
        type: 'recommendation',
        priority: 'high',
        text:
          options.audience === 'executive'
            ? `Recommend rolling out the ${summary.primaryComparison.treatment} to all users.`
            : `Strong evidence supports adopting ${summary.primaryComparison.treatment} (${(summary.primaryComparison.lift.probabilityPositive * 100).toFixed(1)}% probability of improvement).`,
      });
    }
    // Needs more data
    else if (summary.primaryComparison.lift.probabilityPositive > 0.7) {
      insights.push({
        type: 'recommendation',
        priority: 'medium',
        text: 'Continue experiment to gather more evidence. Current results are promising but not conclusive.',
      });
    }
    // No effect
    else if (Math.abs(summary.primaryComparison.lift.estimate) < 0.01) {
      insights.push({
        type: 'recommendation',
        priority: 'high',
        text:
          options.audience === 'executive'
            ? 'No meaningful difference between variants. Consider testing more dramatic changes.'
            : 'Effect size near zero with tight credible intervals. Recommend exploring alternative approaches.',
      });
    }

    return insights;
  }
}

// Template system for complex reports
class InsightTemplate {
  static executiveSummary(insights: Insight[]): string {
    const high = insights.filter((i) => i.priority === 'high');
    const findings = high.filter((i) => i.type === 'finding');
    const recommendations = high.filter((i) => i.type === 'recommendation');

    return `
## Executive Summary

### Key Findings
${findings.map((f) => `- ${f.text}`).join('\n')}

### Recommendations  
${recommendations.map((r) => `- ${r.text}`).join('\n')}

### Next Steps
Based on these results, we recommend...
    `.trim();
  }
}
```

### Files to Create

- `src/domain/insights/InsightGenerator.ts`
- `src/domain/insights/templates.ts`
- `src/domain/insights/formatters.ts`
- `src/tests/insights/*.test.ts`

---

## Issue 62: Enhance visualizations with interactivity

**Priority**: P1: High  
**Labels**: `sprint-6`, `visualization`, `ux`  
**Size**: L (Large)

### Description

Add interactive features to the existing UnifiedDistributionViz component based on Phase 4 plans from the roadmap.

### Acceptance Criteria

- [ ] Add brush selection for conditional statistics
- [ ] Interactive tooltips showing exact values
- [ ] Range selection for "what-if" analysis
- [ ] Click-to-compare functionality
- [ ] Mobile-optimized interactions
- [ ] Export selected views
- [ ] Maintain performance with large datasets

### Technical Implementation

```typescript
// Extend UnifiedDistributionViz with interactivity
interface InteractiveConfig extends DisplayConfig {
  interactive?: {
    brush?: boolean;
    tooltips?: boolean;
    rangeSelection?: boolean;
    clickToCompare?: boolean;
  };

  onRangeSelect?: (range: [number, number], stats: ConditionalStats) => void;
  onPointHover?: (point: DataPoint) => void;
}

// Add to UnifiedDistributionViz
class UnifiedDistributionViz {
  private brush?: d3.BrushBehavior<any>;
  private tooltip?: d3.Selection<HTMLDivElement>;

  private addInteractivity(): void {
    if (this.config.interactive?.brush) {
      this.addBrushSelection();
    }

    if (this.config.interactive?.tooltips) {
      this.addTooltips();
    }

    if (this.config.interactive?.rangeSelection) {
      this.addRangeSelector();
    }
  }

  private addBrushSelection(): void {
    this.brush = d3
      .brushX()
      .extent([
        [0, 0],
        [this.width, this.height],
      ])
      .on('end', this.onBrushEnd.bind(this));

    this.svg.append('g').attr('class', 'brush').call(this.brush);
  }

  private onBrushEnd(event: d3.BrushEvent): void {
    if (!event.selection) return;

    const [x0, x1] = event.selection.map(this.xScale.invert);

    // Calculate conditional statistics
    const stats = this.calculateConditionalStats(x0, x1);

    // Update visualization
    this.highlightRange(x0, x1);
    this.showConditionalStats(stats);

    // Callback
    this.config.onRangeSelect?.(x0, x1, stats);
  }

  private calculateConditionalStats(min: number, max: number): ConditionalStats {
    const results: Record<string, any> = {};

    for (const dist of this.distributions) {
      const samples = dist.samples.filter((s) => s >= min && s <= max);
      const probability = samples.length / dist.samples.length;

      results[dist.id] = {
        probability,
        conditionalMean: mean(samples),
        conditionalMedian: median(samples),
        sampleCount: samples.length,
      };
    }

    return {
      range: [min, max],
      distributions: results,
      comparison: this.compareConditional(results),
    };
  }

  private addTooltips(): void {
    this.tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'tyche-tooltip')
      .style('opacity', 0);

    // Add hover interactions to paths/bars
    this.svg
      .selectAll('.distribution-path, .histogram-bar')
      .on('mouseover', this.onMouseOver.bind(this))
      .on('mousemove', this.onMouseMove.bind(this))
      .on('mouseout', this.onMouseOut.bind(this));
  }

  private onMouseMove(event: MouseEvent): void {
    const [x, y] = d3.pointer(event);
    const value = this.xScale.invert(x);

    // Get density/probability at this point for each distribution
    const info = this.distributions.map((dist) => ({
      name: dist.label,
      density: this.getDensityAt(dist, value),
      percentile: this.getPercentileAt(dist, value),
    }));

    // Update tooltip
    this.tooltip
      .html(this.formatTooltipContent(value, info))
      .style('left', `${event.pageX + 10}px`)
      .style('top', `${event.pageY - 10}px`)
      .style('opacity', 1);
  }
}

// Mobile optimization
class MobileInteractions {
  static optimize(viz: UnifiedDistributionViz): void {
    // Larger touch targets
    viz.svg
      .selectAll('.interactive-element')
      .style('stroke-width', '20px')
      .style('stroke-opacity', 0);

    // Simplified gestures
    const hammer = new Hammer(viz.container);
    hammer.on('pan', (e) => viz.handlePan(e));
    hammer.on('pinch', (e) => viz.handleZoom(e));

    // Responsive layout
    if (window.innerWidth < 768) {
      viz.config.height = window.innerHeight * 0.5;
      viz.config.margin = { top: 20, right: 20, bottom: 40, left: 40 };
    }
  }
}
```

### Files to Modify

- `src/ui/visualizations/unified/UnifiedDistributionViz.tsx`
- `src/ui/visualizations/unified/interactions.ts`
- `src/ui/visualizations/unified/mobile.ts`
- `src/tests/visualizations/interactivity.test.ts`

---

## Issue 63: Create demo application

**Priority**: P0: Critical  
**Labels**: `sprint-6`, `demo`, `showcase`  
**Size**: XL (Extra Large)

### Description

Build a complete demo application that showcases the progressive analysis journey from simple A/B test to HTE discovery.

### Acceptance Criteria

- [ ] Interactive data upload or use sample datasets
- [ ] Progressive UI revealing features as needed
- [ ] All major features demonstrated
- [ ] Mobile responsive design
- [ ] Shareable results via URL
- [ ] Export in all formats
- [ ] Natural language insights displayed

### Technical Implementation

```typescript
import { UnifiedDistributionViz } from '@/ui/visualizations/unified';

// Main app structure
const DemoApp: React.FC = () => {
  const [stage, setStage] = useState<
    'upload' | 'basic' | 'advanced' | 'segments' | 'export'
  >('upload');

  const [experimentData, setExperimentData] = useState<ExperimentData>();
  const [result, setResult] = useState<ExperimentResult>();
  const [segments, setSegments] = useState<HTEResult>();

  return (
    <div className="tyche-demo">
      <Header />

      <ProgressIndicator stage={stage} />

      <main>
        {stage === 'upload' && (
          <DataUploadStage
            onComplete={(data) => {
              setExperimentData(data);
              setStage('basic');
            }}
          />
        )}

        {stage === 'basic' && experimentData && (
          <BasicAnalysisStage
            data={experimentData}
            onComplete={(result) => {
              setResult(result);
              setStage('advanced');
            }}
          />
        )}

        {stage === 'advanced' && result && (
          <AdvancedAnalysisStage
            result={result}
            onSegmentDiscovery={(segments) => {
              setSegments(segments);
              setStage('segments');
            }}
          />
        )}

        {stage === 'segments' && segments && (
          <SegmentExplorationStage
            segments={segments}
            result={result!}
            onExport={() => setStage('export')}
          />
        )}

        {stage === 'export' && result && (
          <ExportStage
            result={result}
            segments={segments}
          />
        )}
      </main>
    </div>
  );
};

// Data upload component
const DataUploadStage: React.FC<{
  onComplete: (data: ExperimentData) => void;
}> = ({ onComplete }) => {
  const [uploadMethod, setUploadMethod] = useState<'file' | 'sample' | 'manual'>();

  return (
    <div className="stage-container">
      <h2>Let's analyze your experiment</h2>

      <div className="upload-options">
        <button
          className="option-card"
          onClick={() => setUploadMethod('file')}
        >
          <Upload size={48} />
          <h3>Upload Data</h3>
          <p>CSV or JSON file with your experiment results</p>
        </button>

        <button
          className="option-card"
          onClick={() => setUploadMethod('sample')}
        >
          <Database size={48} />
          <h3>Use Sample Data</h3>
          <p>Explore Tyche with pre-loaded examples</p>
        </button>

        <button
          className="option-card"
          onClick={() => setUploadMethod('manual')}
        >
          <Edit size={48} />
          <h3>Enter Manually</h3>
          <p>Input summary statistics directly</p>
        </button>
      </div>

      {uploadMethod === 'file' && (
        <FileUploader onUpload={handleFileUpload} />
      )}

      {uploadMethod === 'sample' && (
        <SampleDataSelector onSelect={handleSampleSelect} />
      )}

      {uploadMethod === 'manual' && (
        <ManualDataEntry onComplete={handleManualEntry} />
      )}
    </div>
  );
};

// Basic analysis stage
const BasicAnalysisStage: React.FC<{
  data: ExperimentData;
  onComplete: (result: ExperimentResult) => void;
}> = ({ data, onComplete }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ExperimentResult>();
  const [insights, setInsights] = useState<Insight[]>();

  useEffect(() => {
    analyzeExperiment();
  }, [data]);

  const analyzeExperiment = async () => {
    setAnalyzing(true);

    try {
      // Detect metric type
      const metricType = detectMetricType(data);

      // Run analysis
      const result = await tyche
        .experiment(data)
        .forMetric(metricType)
        .analyze();

      setResult(result);

      // Generate insights
      const generator = new InsightGenerator();
      const insights = generator.generateInsights(result, {
        audience: 'analyst'
      });
      setInsights(insights);

    } finally {
      setAnalyzing(false);
    }
  };

  if (analyzing) {
    return <AnalysisProgress />;
  }

  return (
    <div className="stage-container">
      <h2>Analysis Results</h2>

      {/* Summary cards */}
      <div className="summary-cards">
        <SummaryCard
          title="Sample Size"
          value={result?.summary().totalSamples}
          icon={<Users />}
        />

        <SummaryCard
          title="Treatment Effect"
          value={formatEffect(result?.summary().primaryComparison.lift)}
          icon={<TrendingUp />}
          highlight
        />

        <SummaryCard
          title="Confidence"
          value={formatConfidence(result?.summary().primaryComparison.lift)}
          icon={<Shield />}
        />
      </div>

      {/* Visualization */}
      <div className="visualization-section">
        <UnifiedDistributionViz
          distributions={[
            {
              id: 'control',
              label: 'Control',
              posterior: result?.getVariantResult('control')?.getPosterior()
            },
            {
              id: 'treatment',
              label: 'Treatment',
              posterior: result?.getVariantResult('treatment')?.getPosterior()
            }
          ]}
          display={{ mode: 'density', showMean: true, showCI: true }}
          comparison={{ show: true, type: 'difference' }}
          width={800}
          height={400}
        />
      </div>

      {/* Insights */}
      <div className="insights-section">
        <h3>Key Insights</h3>
        {insights?.map((insight, i) => (
          <InsightCard key={i} insight={insight} />
        ))}
      </div>

      {/* Actions */}
      <div className="actions">
        <button
          className="secondary"
          onClick={() => setStage('upload')}
        >
          Analyze Another
        </button>

        <button
          className="primary"
          onClick={() => onComplete(result!)}
        >
          Explore Further →
        </button>
      </div>
    </div>
  );
};

// Sample datasets
const SAMPLE_DATASETS = [
  {
    id: 'ecommerce-conversion',
    name: 'E-commerce Checkout',
    description: 'A/B test of simplified checkout flow',
    metric: 'conversion',
    data: generateEcommerceData()
  },
  {
    id: 'saas-revenue',
    name: 'SaaS Pricing Test',
    description: 'Testing new pricing tier',
    metric: 'revenue',
    data: generateSaaSData()
  },
  {
    id: 'content-engagement',
    name: 'Content Recommendation',
    description: 'ML vs rule-based recommendations',
    metric: 'engagement',
    data: generateContentData()
  }
];

// Shareable results
const ShareableResults: React.FC<{ result: ExperimentResult }> = ({ result }) => {
  const [shareUrl, setShareUrl] = useState<string>();

  const generateShareUrl = async () => {
    // Compress and encode result
    const compressed = await compressResult(result);
    const encoded = base64url.encode(compressed);

    // Create shareable URL
    const url = `${window.location.origin}/shared/${encoded}`;
    setShareUrl(url);

    // Copy to clipboard
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="share-section">
      <button onClick={generateShareUrl}>
        <Share2 /> Share Results
      </button>

      {shareUrl && (
        <div className="share-url">
          <input value={shareUrl} readOnly />
          <span className="copied">Copied!</span>
        </div>
      )}
    </div>
  );
};
```

### Files to Create

- `src/demo/App.tsx`
- `src/demo/components/stages/*.tsx`
- `src/demo/components/visualizations/*.tsx`
- `src/demo/components/common/*.tsx`
- `src/demo/data/sampleDatasets.ts`
- `src/demo/utils/sharing.ts`
- `src/demo/styles/demo.css`

---

## Issue 64: Add progress tracking and cancellation

**Priority**: P2: Medium  
**Labels**: `sprint-6`, `ux`, `performance`  
**Size**: M (Medium)

### Description

Improve UX for long-running operations with progress tracking and ability to cancel.

### Acceptance Criteria

- [ ] Progress bars for all operations > 1s
- [ ] Meaningful progress messages
- [ ] Cancel button for worker operations
- [ ] Graceful cleanup on cancellation
- [ ] Time estimates when possible
- [ ] Progress persists across component remounts

### Technical Implementation

```typescript
interface ProgressTracker {
  id: string;
  operation: string;

  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'error';

  progress: {
    current: number;
    total?: number;
    percentage?: number;
    message?: string;
  };

  timing: {
    startTime: Date;
    estimatedCompletion?: Date;
    elapsedMs: number;
  };

  cancellable: boolean;
  cancel?: () => void;
}

class ProgressManager {
  private trackers = new Map<string, ProgressTracker>();
  private listeners = new Set<(trackers: ProgressTracker[]) => void>();

  track<T>(
    operation: string,
    task: Promise<T>,
    options?: {
      cancellable?: boolean;
      estimateFrom?: number;  // Historical duration
    }
  ): TrackedPromise<T> {
    const id = generateId();

    const tracker: ProgressTracker = {
      id,
      operation,
      status: 'running',
      progress: {
        current: 0,
        message: 'Starting...'
      },
      timing: {
        startTime: new Date(),
        elapsedMs: 0
      },
      cancellable: options?.cancellable || false
    };

    if (options?.estimateFrom) {
      tracker.timing.estimatedCompletion = new Date(
        Date.now() + options.estimateFrom
      );
    }

    this.trackers.set(id, tracker);
    this.notifyListeners();

    // Wrap the promise
    const tracked = this.wrapPromise(task, tracker);

    return {
      promise: tracked,
      trackerId: id,
      cancel: tracker.cancellable ? () => this.cancel(id) : undefined
    };
  }

  updateProgress(
    trackerId: string,
    update: Partial<ProgressTracker['progress']>
  ): void {
    const tracker = this.trackers.get(trackerId);
    if (!tracker || tracker.status !== 'running') return;

    tracker.progress = { ...tracker.progress, ...update };
    tracker.timing.elapsedMs = Date.now() - tracker.timing.startTime.getTime();

    // Update estimate if we have total
    if (update.current && tracker.progress.total) {
      const rate = update.current / tracker.timing.elapsedMs;
      const remaining = (tracker.progress.total - update.current) / rate;
      tracker.timing.estimatedCompletion = new Date(Date.now() + remaining);
    }

    this.notifyListeners();
  }

  cancel(trackerId: string): void {
    const tracker = this.trackers.get(trackerId);
    if (!tracker || !tracker.cancellable) return;

    tracker.status = 'cancelled';
    tracker.cancel?.();

    this.notifyListeners();
  }

  subscribe(listener: (trackers: ProgressTracker[]) => void): () => void {
    this.listeners.add(listener);
    listener(Array.from(this.trackers.values()));

    return () => this.listeners.delete(listener);
  }
}

// React hook
function useProgress(): {
  trackers: ProgressTracker[];
  track: <T>(operation: string, task: Promise<T>) => TrackedPromise<T>;
  cancel: (trackerId: string) => void;
} {
  const [trackers, setTrackers] = useState<ProgressTracker[]>([]);
  const manager = useRef(new ProgressManager());

  useEffect(() => {
    return manager.current.subscribe(setTrackers);
  }, []);

  return {
    trackers,
    track: (op, task) => manager.current.track(op, task),
    cancel: (id) => manager.current.cancel(id)
  };
}

// Progress UI component
const ProgressOverlay: React.FC = () => {
  const { trackers } = useProgress();
  const activeTrackers = trackers.filter(t => t.status === 'running');

  if (activeTrackers.length === 0) return null;

  return (
    <div className="progress-overlay">
      {activeTrackers.map(tracker => (
        <ProgressItem key={tracker.id} tracker={tracker} />
      ))}
    </div>
  );
};

const ProgressItem: React.FC<{ tracker: ProgressTracker }> = ({ tracker }) => {
  const { cancel } = useProgress();

  return (
    <div className="progress-item">
      <div className="progress-header">
        <span className="operation">{tracker.operation}</span>
        {tracker.cancellable && (
          <button
            className="cancel"
            onClick={() => cancel(tracker.id)}
          >
            Cancel
          </button>
        )}
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${tracker.progress.percentage || 0}%`
          }}
        />
      </div>

      <div className="progress-details">
        <span className="message">
          {tracker.progress.message}
        </span>

        {tracker.timing.estimatedCompletion && (
          <span className="eta">
            ETA: {formatDuration(
              tracker.timing.estimatedCompletion.getTime() - Date.now()
            )}
          </span>
        )}
      </div>
    </div>
  );
};

// Integration with analysis
const analyzeWithProgress = async (data: ExperimentData) => {
  const { track } = useProgress();

  const result = await track(
    'Analyzing experiment',
    tyche.experiment(data).forMetric('revenue').analyze(),
    {
      cancellable: true,
      estimateFrom: 5000  // 5s estimate
    }
  ).promise;

  return result;
};
```

### Files to Create

- `src/infrastructure/progress/ProgressManager.ts`
- `src/hooks/useProgress.ts`
- `src/components/progress/ProgressOverlay.tsx`
- `src/tests/progress/*.test.ts`

---

## Issue 65: Error recovery strategies

**Priority**: P2: Medium  
**Labels**: `sprint-6`, `error-handling`, `ux`  
**Size**: S (Small)  
**Depends on**: TycheError from Sprint 0

### Description

Implement graceful error recovery to help users fix issues without losing work.

### Acceptance Criteria

- [ ] Detect common errors and suggest fixes
- [ ] Allow retry for transient failures
- [ ] Save partial results when possible
- [ ] Clear error messages with next steps
- [ ] Recovery suggestions based on error type

### Technical Implementation

```typescript
interface RecoveryStrategy {
  canHandle(error: Error): boolean;
  suggest(error: Error): RecoverySuggestion;
  recover?(error: Error, context: any): Promise<any>;
}

interface RecoverySuggestion {
  message: string;
  actions: RecoveryAction[];
  canAutoRecover: boolean;
}

interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  primary?: boolean;
}

class RecoveryManager {
  private strategies: RecoveryStrategy[] = [
    new InsufficientDataRecovery(),
    new ConvergenceFailureRecovery(),
    new WorkerTimeoutRecovery(),
    new DataQualityRecovery()
  ];

  async handleError(
    error: Error,
    context: any
  ): Promise<RecoverySuggestion | null> {
    // Find applicable strategy
    const strategy = this.strategies.find(s => s.canHandle(error));
    if (!strategy) return null;

    const suggestion = strategy.suggest(error);

    // Add auto-recovery if available
    if (strategy.recover && suggestion.canAutoRecover) {
      suggestion.actions.unshift({
        label: 'Try automatic recovery',
        action: async () => {
          await strategy.recover!(error, context);
        },
        primary: true
      });
    }

    return suggestion;
  }
}

// Example strategies
class InsufficientDataRecovery implements RecoveryStrategy {
  canHandle(error: Error): boolean {
    return error instanceof TycheError &&
           error.code === ErrorCode.INSUFFICIENT_DATA;
  }

  suggest(error: TycheError): RecoverySuggestion {
    const context = error.context as { sampleSize: number; minimum: number };

    return {
      message: `Need at least ${context.minimum} samples for reliable analysis. You have ${context.sampleSize}.`,
      actions: [
        {
          label: 'Collect more data',
          action: () => window.location.href = '/guide/sample-size'
        },
        {
          label: 'Use simpler model',
          action: () => {
            // Suggest beta-binomial instead of complex model
          }
        }
      ],
      canAutoRecover: false
    };
  }
}

class ConvergenceFailureRecovery implements RecoveryStrategy {
  canHandle(error: Error): boolean {
    return error instanceof TycheError &&
           error.code === ErrorCode.CONVERGENCE_FAILED;
  }

  suggest(error: TycheError): RecoverySuggestion {
    return {
      message: 'The model failed to converge. This often happens with unusual data patterns.',
      actions: [
        {
          label: 'Try simpler model',
          action: async () => {
            // Reduce components or change model type
          }
        },
        {
          label: 'Check data quality',
          action: () => {
            // Show data quality diagnostics
          }
        }
      ],
      canAutoRecover: true
    };
  }

  async recover(error: TycheError, context: any): Promise<any> {
    // Try with reduced components
    if (context.modelConfig.components > 1) {
      return await context.retry({
        ...context.modelConfig,
        components: 1
      });
    }

    // Try different model type
    if (context.modelConfig.type === 'lognormal') {
      return await context.retry({
        ...context.modelConfig,
        type: 'gamma'
      });
    }

    throw error;  // Can't recover
  }
}

// React component for error display
const ErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [error, setError] = useState<Error>();
  const [suggestion, setSuggestion] = useState<RecoverySuggestion>();

  useEffect(() => {
    if (error) {
      const manager = new RecoveryManager();
      manager.handleError(error, {}).then(setSuggestion);
    }
  }, [error]);

  if (error && suggestion) {
    return (
      <div className="error-container">
        <div className="error-icon">
          <AlertCircle size={48} />
        </div>

        <h3>Something went wrong</h3>
        <p>{suggestion.message}</p>

        <div className="error-actions">
          {suggestion.actions.map((action, i) => (
            <button
              key={i}
              className={action.primary ? 'primary' : 'secondary'}
              onClick={action.action}
            >
              {action.label}
            </button>
          ))}
        </div>

        <details className="error-details">
          <summary>Technical details</summary>
          <pre>{error.stack}</pre>
        </details>
      </div>
    );
  }

  return <>{children}</>;
};
```

### Files to Create

- `src/infrastructure/recovery/RecoveryManager.ts`
- `src/infrastructure/recovery/strategies/*.ts`
- `src/components/errors/ErrorBoundary.tsx`
- `src/tests/recovery/*.test.ts`

---

## Sprint Success Criteria

- [ ] Export working in all formats
- [ ] Natural language insights generating useful explanations
- [ ] Demo app showcases full journey
- [ ] Progress tracking for long operations
- [ ] Graceful error recovery
- [ ] Mobile responsive throughout
- [ ] All tests passing
- [ ] Embeddable visualization bundle < 200KB
- [ ] Interactive visualizations enhance understanding

## Performance Targets

- Export generation: < 2s for typical results
- Insight generation: < 500ms
- Demo app load: < 3s
- Progress updates: 60fps smooth

## Polish Checklist

- [ ] Consistent design system
- [ ] Helpful tooltips throughout
- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] Print-friendly exports
- [ ] Cross-browser testing

## Final Deliverable

A complete, production-ready Bayesian A/B testing tool that:

- Makes complex statistics accessible
- Finds actionable customer segments
- Runs entirely in the browser
- Exports to common formats
- Guides users to insights
