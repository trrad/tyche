// src/ui/visualizations/index.ts

// NEW: Unified Distribution Visualization (RECOMMENDED)
export * from './unified';

// Core visualization components (DEPRECATED - use UnifiedDistributionViz)
export { DistributionPlot } from './DistributionPlot';
export type { DistributionPlotProps } from './DistributionPlot';

export { UpliftGraph } from './UpliftGraph';
export type { UpliftGraphProps } from './UpliftGraph';

export { ComparisonPlot } from './ComparisonPlot';
export type { ComparisonPlotProps } from './ComparisonPlot';

// Safe wrappers with error handling (DEPRECATED)
export { SafeDistributionPlot } from './SafeDistributionPlot';
export { SafeUpliftGraph } from './SafeUpliftGraph';

// Sync inference visualization components (DEPRECATED - use async versions)
export { PPCVisualizer } from './PPCVisualizer';
export { PPCDiagnostics } from './PPCDiagnostics';
export { ParameterSpaceVisualizer } from './ParameterSpaceVisualizer';
export { DiagnosticsPanel } from './DiagnosticsPanel';
export { PosteriorSummary } from './PosteriorSummary';

// Async visualization components
// AsyncViolinPlot and AsyncPPCVisualizer are DEPRECATED - use UnifiedDistributionViz
export { AsyncViolinPlot } from './AsyncViolinPlot';
export { AsyncPPCVisualizer } from './AsyncPPCVisualizer';
// These are still maintained:
export { AsyncPPCDiagnostics } from './AsyncPPCDiagnostics';
export { AsyncPosteriorSummary } from './AsyncPosteriorSummary';

// Unified displays (DEPRECATED - use UnifiedDistributionViz directly)
export { UnifiedPPCDisplay } from './UnifiedPPCDisplay';
export { UnifiedParameterSpaceDisplay } from './UnifiedParameterSpaceDisplay';

// Base visualization utilities
export * from './base';
export { useAsyncPosterior, usePosteriorStats } from './base/useAsyncPosterior';
export type { AsyncPosteriorState, UseAsyncPosteriorOptions } from './base/useAsyncPosterior';
export { AsyncBaseVisualization, withAsyncPosterior } from './base/AsyncBaseVisualization';
export type { AsyncVisualizationProps } from './base/AsyncBaseVisualization';

// Violin plot and utilities (DEPRECATED - use UnifiedDistributionViz with mode='ridge')
export { ViolinPlot } from './ViolinPlot';
export type { ViolinPlotProps, ViolinPlotSpec, ViolinData } from './ViolinPlot';
export { SimpleViolinPlot } from './SimpleViolinExample';

// Utility functions
export * from './utils/statistics';

// Migration helpers - temporary aliases for easy migration
export { 
  UnifiedDistributionViz as RecommendedDistributionPlot,
  UnifiedDistributionViz as RecommendedPPCVisualizer,
  UnifiedDistributionViz as RecommendedComparisonPlot,
  UnifiedDistributionViz as RecommendedViolinPlot
} from './unified';