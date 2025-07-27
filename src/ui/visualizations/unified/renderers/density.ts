import * as d3 from 'd3';
import { 
  RenderContext, 
  DistributionState, 
  DisplayConfig,
  ComparisonConfig,
  ComparisonResult 
} from '../types';
import { calculateKDE } from '../../utils/statistics';
import { getVariantColor } from '../../base/colors';

export function renderDensityPlot(
  context: RenderContext,
  data: (DistributionState | ComparisonResult)[],
  display: DisplayConfig,
  comparison?: ComparisonConfig
) {
  const { container, xScale, yScale, width, height, formatValue } = context;
  
  // Calculate KDE for each distribution
  const kdeData = data.map((d, i) => {
    if (!('samples' in d) || !d.samples) return null;
    
    const kde = calculateKDE(d.samples, 100);
    const color = 'color' in d ? d.color : getVariantColor(d.id, i);
    const isBaseline = 'metadata' in d && d.metadata?.isBaseline;
    const isObserved = 'metadata' in d && d.metadata?.isObserved;
    
    return {
      id: d.id,
      label: d.label,
      kde,
      color,
      isBaseline,
      isObserved,
      stats: 'stats' in d ? d.stats : null
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null);
  
  // Update y scale based on max density
  const maxDensity = Math.max(...kdeData.flatMap(d => d.kde.map(p => p.density)));
  yScale.domain([0, maxDensity * 1.1]);
  
  // Create gradient definitions for fills
  const defs = container.append('defs');
  kdeData.forEach((d, i) => {
    const gradientId = `gradient-${d.id}`;
    const gradient = defs.append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('x2', '0%')
      .attr('y1', '0%')
      .attr('y2', '100%');
    
    gradient.append('stop')
      .attr('offset', '0%')
      .style('stop-color', d.color || '#3b82f6')
      .style('stop-opacity', 0.6);
    
    gradient.append('stop')
      .attr('offset', '100%')
      .style('stop-color', d.color || '#3b82f6')
      .style('stop-opacity', 0.1);
  });
  
  // Render each distribution
  kdeData.forEach((d, i) => {
    const g = container.append('g')
      .attr('class', `distribution distribution-${d.id}`);
    
    // Draw credible intervals if requested
    if (display.showCI && d.stats && 'ci95' in d.stats) {
      const ciLevels = display.ciLevels || [0.8, 0.5];
      
      ciLevels.forEach((level, idx) => {
        if (!d.stats) return;
        
        let ci: [number, number];
        if (level === 0.95) {
          ci = d.stats.ci95;
        } else if (level === 0.8) {
          ci = d.stats.ci80;
        } else if (level === 0.5) {
          ci = d.stats.ci50;
        } else {
          // Fallback for other levels - use 80% CI
          ci = d.stats.ci80;
        }
        g.append('rect')
          .attr('x', xScale(ci[0]))
          .attr('y', 0)
          .attr('width', xScale(ci[1]) - xScale(ci[0]))
          .attr('height', height)
          .attr('fill', d.color || '#3b82f6')
          .attr('opacity', 0.05 + idx * 0.05);
      });
    }
    
    // Create area generator
    const area = d3.area<{ value: number; density: number }>()
      .x(d => xScale(d.value))
      .y0(height)
      .y1(d => yScale(d.density))
      .curve(d3.curveMonotoneX);
    
    // Draw filled area
    g.append('path')
      .datum(d.kde)
      .attr('fill', `url(#gradient-${d.id})`)
      .attr('opacity', d.isObserved ? 0.5 : 0.7)
      .attr('d', area);
    
    // Draw line
    const line = d3.line<{ value: number; density: number }>()
      .x(d => xScale(d.value))
      .y(d => yScale(d.density))
      .curve(d3.curveMonotoneX);
    
    g.append('path')
      .datum(d.kde)
      .attr('fill', 'none')
      .attr('stroke', d.color || '#3b82f6')
      .attr('stroke-width', 2)
      .attr('opacity', 0.9)
      .attr('stroke-dasharray', d.isObserved ? '5,5' : null)
      .attr('d', line);
    
    // Draw mean/median lines
    if (display.showMean && d.stats && 'mean' in d.stats) {
      g.append('line')
        .attr('x1', xScale(d.stats.mean))
        .attr('x2', xScale(d.stats.mean))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', d.color || '#3b82f6')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.8);
    }
    
    if (display.showMedian && d.stats && 'median' in d.stats) {
      g.append('line')
        .attr('x1', xScale(d.stats.median))
        .attr('x2', xScale(d.stats.median))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', d.color || '#3b82f6')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,2')
        .attr('opacity', 0.8);
    }
  });
  
  // Add zero line for comparison plots
  if (comparison?.mode === 'difference' || comparison?.mode === 'log-ratio') {
    container.append('line')
      .attr('x1', xScale(0))
      .attr('x2', xScale(0))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#6b7280')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.5);
  }
} 