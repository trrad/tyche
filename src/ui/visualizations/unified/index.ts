// Main component
export { UnifiedDistributionViz } from './UnifiedDistributionViz';

// New unified PPC display
export { UnifiedPPCDisplay } from './UnifiedPPCDisplay';

// Types
export type {
  Distribution,
  DistributionState,
  DisplayConfig,
  ComparisonConfig,
  ComparisonResult,
  UnifiedDistributionVizProps,
  RenderContext,
  ExperimentDistributions,
  SegmentedDistributions
} from './types';

// Import Distribution type for internal use
import type { Distribution } from './types';

// Hooks
export { useDistributionStates } from './hooks/useDistributionStates';
export { useComparisonData } from './hooks/useComparisonData';

// Renderers
export {
  renderDensityPlot,
  renderHistogramPlot,
  renderRidgePlot,
  renderECDFPlot
} from './renderers';

// Annotations
export {
  renderLegend,
  renderComparisonAnnotations,
  renderStatisticalSummary,
  createTooltipContent,
  renderProbabilityAnnotation
} from './annotations';

// Utility function for creating distributions from experiment data
export function createDistributionsFromExperiment(
  variants: Map<string, any> | Record<string, any>,
  options?: {
    baseline?: string;
    colors?: string[];
    labels?: Record<string, string>;
  }
): Distribution[] {
  const entries = variants instanceof Map 
    ? Array.from(variants.entries())
    : Object.entries(variants);
  
  return entries.map(([id, posterior], index) => ({
    id,
    label: options?.labels?.[id] || id.charAt(0).toUpperCase() + id.slice(1),
    posterior,
    color: options?.colors?.[index],
    metadata: {
      variantIndex: index,
      isBaseline: id === options?.baseline || index === 0
    }
  }));
} 