// src/ui/visualizations/index.ts

// PRIMARY: Unified Distribution Visualization System
export * from './unified';

// CORE: Essential visualization components
export { AsyncPosteriorSummary } from './AsyncPosteriorSummary';
export { AsyncPPCDiagnostics } from './AsyncPPCDiagnostics';
export { DiagnosticsPanel } from './DiagnosticsPanel';

// BASE: Foundation utilities and types
export * from './base';
export { useAsyncPosterior, usePosteriorStats } from './base/useAsyncPosterior';
export type { AsyncPosteriorState, UseAsyncPosteriorOptions } from './base/useAsyncPosterior';
export { AsyncBaseVisualization, withAsyncPosterior } from './base/AsyncBaseVisualization';
export type { AsyncVisualizationProps } from './base/AsyncBaseVisualization';

// UTILS: Statistical utilities
export * from './utils/statistics';

// RECOMMENDED: Use UnifiedDistributionViz for all visualization needs
// 
// Examples:
// - Distribution plots: <UnifiedDistributionViz distributions={[...]} />
// - PPC visualizations: <UnifiedDistributionViz mode="mixed" />
// - Comparison plots: <UnifiedDistributionViz comparison={{mode: 'overlay'}} />
// - Ridge plots: <UnifiedDistributionViz mode="ridge" />
//
// The unified system handles:
// - Async posterior sampling
// - Multiple display modes (density, histogram, ridge, mixed, ecdf)
// - Comparison analysis
// - PPC diagnostics
// - Interactive features (future)
// - Error boundaries and loading states