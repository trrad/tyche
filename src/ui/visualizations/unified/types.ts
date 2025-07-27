import { Posterior } from '../../../inference/base/types';
import { PosteriorProxy } from '../../../workers/PosteriorProxy';

/**
 * A distribution to visualize - can be observed data or a posterior
 */
export interface Distribution {
  id: string;
  label: string;
  
  // Data source (one of these must be provided)
  posterior?: Posterior | PosteriorProxy;
  samples?: number[];
  
  // Visual customization
  color?: string;
  opacity?: number;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  
  // Metadata for special handling
  metadata?: {
    variantIndex?: number;      // For consistent coloring
    isBaseline?: boolean;       // For comparison plots
    isObserved?: boolean;       // For PPC-style plots
    segmentId?: string;         // For future segment analysis
    timestamp?: number;         // For temporal analysis
  };
}

// Brand colors for better visual design
export const BRAND_COLORS = {
  observed: '#FF6B6B',   // Coral red for observed data
  predicted: '#9B59B6',  // Purple for predictions
  primary: '#3b82f6',    // Blue
  success: '#10b981',    // Green
  warning: '#f59e0b',    // Amber
  danger: '#ef4444',     // Red
  info: '#8b5cf6'        // Violet
};

/**
 * Display configuration for the visualization
 */
export interface DisplayConfig {
  // Visual representation
  mode: 'density' | 'histogram' | 'ridge' | 'dots' | 'ecdf' | 'mixed';
  
  // Statistical elements to show
  showMean?: boolean;
  showMedian?: boolean;
  showMode?: boolean;
  showCI?: boolean;
  ciLevels?: number[];
  
  // Display parameters
  binCount?: number;           // For histograms
  bandwidth?: number;          // For KDE
  opacity?: number;            // Global opacity
  showGrid?: boolean;          // Show grid lines
  
  // Ridge plot specific
  ridgeOverlap?: number;       // 0-1, how much ridges overlap
  ridgeScale?: number;         // Height scaling for ridges
}

/**
 * Comparison configuration when multiple distributions
 */
export interface ComparisonConfig {
  // How to compare distributions
  mode?: 'overlay' | 'difference' | 'ratio' | 'log-ratio' | 'percentage-change';
  
  // Baseline for comparison (if not specified, use first distribution)
  baseline?: string;
  
  // Statistical comparisons
  showProbabilityOfImprovement?: boolean;
  showExpectedImprovement?: boolean;
  showProbabilityOfPracticalImprovement?: boolean;
  practicalThreshold?: number; // e.g., "5% lift matters"
  
  // Visual options
  probabilityGradient?: boolean; // Show continuous probability coloring
}

/**
 * Main component props
 */
export interface UnifiedDistributionVizProps {
  // Core data
  distributions: Distribution[];
  
  // Display configuration
  display?: DisplayConfig;
  
  // Comparison configuration (when multiple distributions)
  comparison?: ComparisonConfig;
  
  // Standard viz props
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  
  // Formatting
  formatValue?: (v: number) => string;
  formatPercent?: (v: number) => string;
  formatDifference?: (v: number) => string;
  
  // Labels
  title?: string;
  subtitle?: string;
  xLabel?: string;
  yLabel?: string;
  
  // Performance
  nSamples?: number;
  cacheSamples?: boolean;
  adaptiveSampling?: boolean;
  
  // Interactivity (future)
  onHover?: (distribution: Distribution, value: number) => void;
  onClick?: (distribution: Distribution) => void;
  onBrush?: (selection: [number, number]) => void;
}

/**
 * Internal state for a distribution with its samples
 */
export interface DistributionState extends Omit<Distribution, 'samples'> {
  samples: number[] | null;
  loading: boolean;
  error: string | null;
  progress: number;
  
  // Computed statistics (cached)
  stats?: {
    mean: number;
    median: number;
    mode?: number;
    std: number;
    ci95: [number, number];
    ci80: [number, number];
    ci50: [number, number];
    quantiles: {
      q01: number;
      q05: number;
      q10: number;
      q25: number;
      q50: number;
      q75: number;
      q90: number;
      q95: number;
      q99: number;
    };
    min: number;
    max: number;
  };
  
  // Computed display data (cached)
  kde?: Array<{ value: number; density: number }>;
  histogram?: Array<{
    x0: number;
    x1: number;
    count: number;
    density: number;
  }>;
}

/**
 * Comparison result between two distributions
 */
export interface ComparisonResult {
  id: string;
  label: string;
  baselineId: string;
  comparisonId: string;
  
  // Comparison samples
  samples: number[];
  
  // Summary statistics
  stats: {
    mean: number;
    median: number;
    ci95: [number, number];
    ci80: [number, number];
    ci50: [number, number];
    
    // Continuous probability measures
    probabilityOfImprovement: number;
    expectedImprovement: number;
    
    // Risk metrics
    valueAtRisk05: number; // 5th percentile (worst case)
    conditionalValueAtRisk05: number; // Expected value in worst 5%
    
    // Exceedance probabilities for different thresholds
    exceedanceProbabilities: Map<number, number>;
    
    // For ratio comparisons
    probabilityOfIncrease?: number;
    medianRatio?: number;
  };
}

/**
 * Configuration for rendering functions
 */
export interface RenderContext {
  container: d3.Selection<SVGGElement, unknown, null, undefined>;
  xScale: d3.ScaleLinear<number, number>;
  yScale: d3.ScaleLinear<number, number>;
  width: number;
  height: number;
  formatValue: (v: number) => string;
  formatPercent: (v: number) => string;
}

/**
 * A/B/n test specific types for future extension
 */
export interface ExperimentDistributions {
  control: Distribution;
  treatments: Distribution[];
  segments?: SegmentedDistributions[];
}

export interface SegmentedDistributions {
  segmentId: string;
  segmentName: string;
  distributions: Distribution[];
}

// Default configurations
export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  mode: 'density',
  showMean: true,
  showCI: true,
  ciLevels: [0.8, 0.5], // Show multiple levels of uncertainty
  binCount: 30,
  opacity: 0.8
};

export const DEFAULT_COMPARISON_CONFIG: ComparisonConfig = {
  mode: 'overlay',
  showProbabilityOfImprovement: true,
  probabilityGradient: true
}; 