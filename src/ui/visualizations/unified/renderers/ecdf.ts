import * as d3 from 'd3';
import { 
  RenderContext, 
  DistributionState, 
  DisplayConfig,
  ComparisonConfig,
  ComparisonResult 
} from '../types';
import { getVariantColor } from '../../base/colors';

export function renderECDFPlot(
  context: RenderContext,
  data: (DistributionState | ComparisonResult)[],
  display: DisplayConfig,
  comparison?: ComparisonConfig
) {
  const { container, xScale, yScale, width, height } = context;
  
  // Update y scale for ECDF (0 to 1)
  yScale.domain([0, 1]);
  
  data.forEach((d, i) => {
    if (!('samples' in d) || !d.samples) return;
    
    const color = 'color' in d ? d.color : getVariantColor(d.id, i);
    const sorted = [...d.samples].sort((a, b) => a - b);
    const n = sorted.length;
    
    // Create ECDF points
    const ecdfPoints = sorted.map((value, idx) => ({
      value,
      probability: (idx + 1) / n
    }));
    
    // Create step function
    const line = d3.line<{ value: number; probability: number }>()
      .x(d => xScale(d.value))
      .y(d => yScale(d.probability))
      .curve(d3.curveStepAfter);
    
    const g = container.append('g')
      .attr('class', `ecdf ecdf-${d.id}`);
    
    // Draw ECDF line
    g.append('path')
      .datum(ecdfPoints)
      .attr('fill', 'none')
      .attr('stroke', color || '#3b82f6')
      .attr('stroke-width', 2)
      .attr('d', line);
    
    // Add median line
    if (display.showMedian && 'stats' in d && d.stats && 'median' in d.stats) {
      g.append('line')
        .attr('x1', xScale(d.stats.median))
        .attr('x2', xScale(d.stats.median))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', color || '#3b82f6')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.5);
      
      // Add horizontal line at 0.5
      g.append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', yScale(0.5))
        .attr('y2', yScale(0.5))
        .attr('stroke', '#6b7280')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.3);
    }
  });
} 