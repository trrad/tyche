import * as d3 from 'd3';
import { 
  RenderContext, 
  DistributionState, 
  DisplayConfig,
  ComparisonConfig,
  ComparisonResult,
  BRAND_COLORS
} from '../types';
import { calculateHistogram } from '../../utils/statistics';
import { getVariantColor } from '../../base/colors';

export function renderHistogramPlot(
  context: RenderContext,
  data: (DistributionState | ComparisonResult)[],
  display: DisplayConfig,
  comparison?: ComparisonConfig
) {
  const { container, xScale, yScale, width, height } = context;
  const binCount = display.binCount || 30;
  
  // Create histogram data
  const histogramData = data.map((d, i) => {
    if (!('samples' in d) || !d.samples) return null;
    
    // Create bins
    const histogram = d3.histogram()
      .domain(xScale.domain() as [number, number])
      .thresholds(binCount);
    
    const bins = histogram(d.samples);
    
    // Convert to density
    const totalArea = d.samples.length * (bins[0].x1! - bins[0].x0!);
    const densityBins = bins.map(bin => ({
      ...bin,
      density: bin.length / totalArea
    }));
    
    const color = 'color' in d ? d.color : getVariantColor(d.id, i);
    const isObserved = 'metadata' in d && d.metadata?.isObserved;
    
    return {
      id: d.id,
      label: d.label,
      bins: densityBins,
      color,
      isObserved,
      stats: 'stats' in d ? d.stats : null
    };
  }).filter((d): d is NonNullable<typeof d> => d !== null);
  
  // Update y scale
  const maxDensity = Math.max(...histogramData.flatMap(d => 
    d.bins.map(b => b.density)
  ));
  yScale.domain([0, maxDensity * 1.1]);
  
  // Determine bar width and offset for multiple distributions
  const barWidth = (xScale(histogramData[0].bins[0].x1!) - 
                   xScale(histogramData[0].bins[0].x0!)) / histogramData.length;
  
  // Render histograms
  histogramData.forEach((d, i) => {
    const g = container.append('g')
      .attr('class', `histogram histogram-${d.id}`);
    
    // Special styling for observed data (with gaps)
    if (d.isObserved) {
      g.selectAll('.bar')
        .data(d.bins)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', (bin: any) => xScale(bin.x0!) + 1) // 1px gap on left
        .attr('width', (bin: any) => Math.max(0, xScale(bin.x1!) - xScale(bin.x0!) - 2)) // 2px total gap
        .attr('y', (bin: any) => yScale(bin.density))
        .attr('height', (bin: any) => height - yScale(bin.density))
        .attr('fill', d.color || BRAND_COLORS.observed)
        .attr('opacity', 0.7)
        .attr('stroke', d.color || BRAND_COLORS.observed)
        .attr('stroke-width', 0.5);
    } else {
      // Regular histogram without gaps
      g.selectAll('.bar')
        .data(d.bins)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', (bin: any) => xScale(bin.x0!))
        .attr('width', (bin: any) => xScale(bin.x1!) - xScale(bin.x0!))
        .attr('y', (bin: any) => yScale(bin.density))
        .attr('height', (bin: any) => height - yScale(bin.density))
        .attr('fill', d.color || '#3b82f6')
        .attr('opacity', 0.5)
        .attr('stroke', d.color || '#3b82f6')
        .attr('stroke-width', 0.5);
    }
    
    // Add mean line
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
  });
} 