import * as d3 from 'd3';
import { 
  RenderContext, 
  DistributionState, 
  DisplayConfig,
  ComparisonConfig,
  ComparisonResult,
  BRAND_COLORS
} from '../types';
import { calculateKDE } from '../../utils/statistics';

/**
 * Render mixed mode: histogram for observed data, density for predictions
 * This recreates the visual style of the old PPC visualizer
 */
export function renderMixedPlot(
  context: RenderContext,
  data: (DistributionState | ComparisonResult)[],
  display: DisplayConfig,
  comparison?: ComparisonConfig
) {
  const { container, xScale, yScale, width, height, formatValue } = context;
  
  // Separate observed and predicted data
  const observed = data.filter(d => 'metadata' in d && d.metadata?.isObserved);
  const predicted = data.filter(d => !('metadata' in d && d.metadata?.isObserved));
  
  // Calculate density for all distributions
  const densityData = data.map((d, i) => {
    if (!('samples' in d) || !d.samples) return null;
    
    const kde = calculateKDE(d.samples, 150);
    const color = 'color' in d ? d.color : 
                  ('metadata' in d && d.metadata?.isObserved) ? BRAND_COLORS.observed : BRAND_COLORS.predicted;
    const isObserved = 'metadata' in d && d.metadata?.isObserved;
    
    return {
      id: d.id,
      label: d.label,
      kde,
      samples: d.samples,
      color,
      isObserved,
      stats: 'stats' in d ? d.stats : null
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null);
  
  // Calculate histogram for observed data
  const histogramData = observed.map(d => {
    if (!('samples' in d) || !d.samples) return null;
    
    // Smart binning based on data size
    const numBins = Math.min(50, Math.max(15, Math.ceil(d.samples.length / 3)));
    const histogram = d3.histogram()
      .domain(xScale.domain() as [number, number])
      .thresholds(numBins);
    
    const bins = histogram(d.samples);
    
    // Convert to density
    const totalArea = d.samples.length * (bins[0].x1! - bins[0].x0!);
    const densityBins = bins.map(bin => ({
      ...bin,
      density: bin.length / totalArea
    }));
    
    return {
      id: d.id,
      bins: densityBins,
      color: 'color' in d ? d.color : BRAND_COLORS.observed
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null);
  
  // Update y scale based on max density
  const maxKdeDensity = Math.max(...densityData.flatMap(d => d.kde.map(p => p.density)));
  const maxHistDensity = Math.max(...histogramData.flatMap(d => d.bins.map(b => b.density)));
  const maxDensity = Math.max(maxKdeDensity, maxHistDensity);
  yScale.domain([0, maxDensity * 1.1]);
  
  // Render histogram for observed data
  histogramData.forEach(d => {
    const g = container.append('g')
      .attr('class', `histogram histogram-${d.id}`);
    
    g.selectAll('.bar')
      .data(d.bins)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (bin: any) => xScale(bin.x0!) + 1)
      .attr('width', (bin: any) => Math.max(0, xScale(bin.x1!) - xScale(bin.x0!) - 2))
      .attr('y', (bin: any) => yScale(bin.density))
      .attr('height', (bin: any) => height - yScale(bin.density))
      .attr('fill', d.color || BRAND_COLORS.observed)
      .attr('opacity', 0.7)
      .attr('stroke', d.color || BRAND_COLORS.observed)
      .attr('stroke-width', 0.5);
  });
  
  // Render density with CI bands for predicted data
  densityData.filter(d => !d.isObserved).forEach((d, i) => {
    const g = container.append('g')
      .attr('class', `distribution distribution-${d.id}`);
    
    // Draw simple CI bands if requested
    if (display.showCI && d.stats && display.ciLevels) {
      display.ciLevels.slice().reverse().forEach((level, idx) => {
        let ci: [number, number] | undefined;
        
        if (level === 0.95 && d.stats?.ci95) {
          ci = d.stats.ci95;
        } else if (level === 0.80 && d.stats?.ci80) {
          ci = d.stats.ci80;
        } else if (level === 0.50 && d.stats?.ci50) {
          ci = d.stats.ci50;
        }
        
        if (ci) {
          // Simple vertical rectangle for CI
          g.append('rect')
            .attr('x', xScale(ci[0]))
            .attr('y', 0)
            .attr('width', Math.max(0, xScale(ci[1]) - xScale(ci[0])))
            .attr('height', height)
            .attr('fill', d.color || BRAND_COLORS.predicted)
            .attr('opacity', 0.15 - idx * 0.05)
            .attr('class', `ci-band ci-${Math.round(level * 100)}`);
        }
      });
    }
    
    // Draw main density line
    const line = d3.line<{ value: number; density: number }>()
      .x(d => xScale(d.value))
      .y(d => yScale(d.density))
      .curve(d3.curveMonotoneX)
      .defined(d => !isNaN(d.value) && !isNaN(d.density));
    
    g.append('path')
      .datum(d.kde)
      .attr('fill', 'none')
      .attr('stroke', d.color || BRAND_COLORS.predicted)
      .attr('stroke-width', 3)
      .attr('d', line);
  });
  
  // Add legend with better styling
  const legendItems: Array<{
    label: string;
    color: string;
    opacity: number;
    type: 'rect' | 'line' | 'area';
  }> = [];
  
  if (observed.length > 0) {
    legendItems.push({ 
      label: 'Observed Data', 
      color: BRAND_COLORS.observed, 
      opacity: 0.7, 
      type: 'rect' 
    });
  }
  
  if (predicted.length > 0) {
    legendItems.push({ 
      label: 'Posterior Predictive', 
      color: BRAND_COLORS.predicted, 
      opacity: 1, 
      type: 'line' 
    });
    
    if (display.showCI) {
      display.ciLevels?.forEach(level => {
        legendItems.push({
          label: `${level * 100}% CI`,
          color: BRAND_COLORS.predicted,
          opacity: level === 0.95 ? 0.2 : 0.3,
          type: 'area'
        });
      });
    }
  }
  
  renderEnhancedLegend(container, legendItems, width - 150, 0);
}



// Enhanced legend rendering
function renderEnhancedLegend(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  items: Array<{label: string; color: string; opacity: number; type: string}>,
  x: number,
  y: number
) {
  const legend = container.append('g')
    .attr('transform', `translate(${x}, ${y})`);
  
  items.forEach((item, i) => {
    const legendRow = legend.append('g')
      .attr('transform', `translate(0, ${i * 20})`);
    
    if (item.type === 'rect') {
      legendRow.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', item.color)
        .attr('opacity', item.opacity);
    } else if (item.type === 'line') {
      legendRow.append('line')
        .attr('x1', 0)
        .attr('x2', 15)
        .attr('y1', 7.5)
        .attr('y2', 7.5)
        .attr('stroke', item.color)
        .attr('stroke-width', 3)
        .attr('opacity', item.opacity);
    } else {
      legendRow.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', item.color)
        .attr('opacity', item.opacity);
    }
    
    legendRow.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .style('font-size', '12px')
      .text(item.label);
  });
} 