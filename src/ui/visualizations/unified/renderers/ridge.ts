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

export function renderRidgePlot(
  context: RenderContext,
  data: (DistributionState | ComparisonResult)[],
  display: DisplayConfig,
  comparison?: ComparisonConfig
) {
  const { container, xScale, width, height } = context;
  const overlap = display.ridgeOverlap || 0.5;
  const ridgeScale = display.ridgeScale || 1;
  
  // Calculate ridge height
  const ridgeHeight = height / (data.length * (1 - overlap) + overlap);
  
  // Render each ridge
  data.forEach((d, i) => {
    if (!('samples' in d) || !d.samples) return;
    
    const yOffset = i * ridgeHeight * (1 - overlap);
    const color = 'color' in d ? d.color : getVariantColor(d.id, i);
    
    // Calculate KDE for this distribution
    const kde = calculateKDE(d.samples, 100);
    const maxDensity = Math.max(...kde.map(p => p.density));
    
    // Local y scale for this ridge
    const yScale = d3.scaleLinear()
      .domain([0, maxDensity])
      .range([ridgeHeight, 0]);
    
    const g = container.append('g')
      .attr('transform', `translate(0,${yOffset})`);
    
    // Create area
    const area = d3.area<{ value: number; density: number }>()
      .x(d => xScale(d.value))
      .y0(ridgeHeight)
      .y1(d => yScale(d.density) * ridgeScale)
      .curve(d3.curveMonotoneX);
    
    // Draw filled area
    g.append('path')
      .datum(kde)
      .attr('fill', color || '#3b82f6')
      .attr('opacity', 0.7)
      .attr('stroke', color || '#3b82f6')
      .attr('stroke-width', 1)
      .attr('d', area);
    
    // Add label
    g.append('text')
      .attr('x', -10)
      .attr('y', ridgeHeight / 2)
      .attr('text-anchor', 'end')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '12px')
      .text(d.label);
    
    // Add mean line if requested
    if (display.showMean && 'stats' in d && d.stats && 'mean' in d.stats) {
      g.append('line')
        .attr('x1', xScale(d.stats.mean))
        .attr('x2', xScale(d.stats.mean))
        .attr('y1', 0)
        .attr('y2', ridgeHeight)
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .attr('opacity', 0.8);
    }
  });
} 