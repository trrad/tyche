import * as d3 from 'd3';

/**
 * Consistent color schemes
 */
export const ColorSchemes = {
  // Zenith Data brand colors
  categorical: [
    '#FF6B6B', // Coral (primary)
    '#9B59B6', // Lilac
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
  ],
  
  // For comparisons (baseline vs treatments)
  comparison: {
    baseline: '#6B7280',    // Gray
    treatment1: '#3B82F6',  // Blue
    treatment2: '#10B981',  // Green
    treatment3: '#F59E0B',  // Yellow
    treatment4: '#EF4444',  // Red
  },
  
  // For uncertainty visualization
  uncertainty: {
    ci95: 'rgba(155, 89, 182, 0.2)',  // Light lilac
    ci80: 'rgba(155, 89, 182, 0.3)',  // Medium lilac
    mean: '#9B59B6',                   // Solid lilac
  },
  
  // Sequential for heatmaps
  sequential: {
    positive: d3.interpolateBlues,
    negative: d3.interpolateReds,
    diverging: d3.interpolateRdBu
  }
} as const;

export function getVariantColor(variantId: string, index: number = 0): string {
  if (variantId === 'control' || variantId === 'baseline') {
    return ColorSchemes.comparison.baseline;
  }
  return ColorSchemes.categorical[index % ColorSchemes.categorical.length];
} 