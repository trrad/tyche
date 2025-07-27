// Core visualization components
export { DistributionPlot } from './DistributionPlot';
export type { DistributionPlotProps } from './DistributionPlot';

export { UpliftGraph } from './UpliftGraph';
export type { UpliftGraphProps } from './UpliftGraph';

export { ComparisonPlot } from './ComparisonPlot';
export type { ComparisonPlotProps } from './ComparisonPlot';

// Safe wrappers with error handling
export { SafeDistributionPlot } from './SafeDistributionPlot';
export { SafeUpliftGraph } from './SafeUpliftGraph';

// Sync inference visualization components (legacy)
export { PPCVisualizer } from './PPCVisualizer';
export { PPCDiagnostics } from './PPCDiagnostics';
export { ParameterSpaceVisualizer } from './ParameterSpaceVisualizer';
export { DiagnosticsPanel } from './DiagnosticsPanel';
export { PosteriorSummary } from './PosteriorSummary';

// Async visualization components (recommended)
export { AsyncViolinPlot } from './AsyncViolinPlot';
export { AsyncPPCVisualizer } from './AsyncPPCVisualizer';
export { AsyncPPCDiagnostics } from './AsyncPPCDiagnostics';
export { AsyncPosteriorSummary } from './AsyncPosteriorSummary';
// export { AsyncParameterSpaceVisualizer } from './AsyncParameterSpaceVisualizer'; // When implemented

// Unified displays (use async components internally)
export { UnifiedPPCDisplay } from './UnifiedPPCDisplay';
export { UnifiedParameterSpaceDisplay } from './UnifiedParameterSpaceDisplay';

// Base visualization utilities
export * from './base';
export { useAsyncPosterior, usePosteriorStats } from './base/useAsyncPosterior';
export type { AsyncPosteriorState, UseAsyncPosteriorOptions } from './base/useAsyncPosterior';
export { AsyncBaseVisualization, withAsyncPosterior } from './base/AsyncBaseVisualization';
export type { AsyncVisualizationProps } from './base/AsyncBaseVisualization';

// Violin plot and utilities
export { ViolinPlot } from './ViolinPlot';
export type { ViolinPlotProps, ViolinPlotSpec, ViolinData } from './ViolinPlot';
export { SimpleViolinPlot } from './SimpleViolinExample';

// Utility functions
export * from './utils/statistics';