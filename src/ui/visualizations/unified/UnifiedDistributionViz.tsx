import React, { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { 
  Distribution, 
  DistributionState, 
  UnifiedDistributionVizProps,
  ComparisonResult,
  DEFAULT_DISPLAY_CONFIG,
  DEFAULT_COMPARISON_CONFIG
} from './types';
import { useDistributionStates } from './hooks/useDistributionStates';
import { useComparisonData } from './hooks/useComparisonData';
import { 
  renderDensityPlot,
  renderHistogramPlot,
  renderRidgePlot,
  renderECDFPlot,
  renderMixedPlot
} from './renderers';
import { renderLegend, renderComparisonAnnotations } from './annotations';
import { getVariantColor } from '../base/colors';

export const UnifiedDistributionViz: React.FC<UnifiedDistributionVizProps> = ({
  distributions,
  display = DEFAULT_DISPLAY_CONFIG,
  comparison = DEFAULT_COMPARISON_CONFIG,
  width = 800,
  height = 400,
  margin = { top: 60, right: 150, bottom: 60, left: 80 },
  formatValue = (v: number) => v.toFixed(3),
  formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`,
  formatDifference = (v: number) => v > 0 ? `+${formatValue(v)}` : formatValue(v),
  title,
  subtitle,
  xLabel = 'Value',
  yLabel = 'Density',
  nSamples = 10000,  // Default to 10k samples!
  cacheSamples = true,
  adaptiveSampling = false,
  onHover,
  onClick,
  onBrush
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Process distributions to get their samples and statistics
  const distributionStates = useDistributionStates({
    distributions,
    nSamples,
    cacheSamples,
    adaptiveSampling
  });
  
  // Compute comparison data if needed
  const comparisonData = useComparisonData({
    distributionStates,
    comparison,
    enabled: distributions.length > 1 && !!comparison?.mode
  });
  
  // Check loading states
  const isLoading = distributionStates.some(d => d.loading);
  const errors = distributionStates.filter(d => d.error);
  const hasData = distributionStates.some(d => d.samples && d.samples.length > 0);
  
  // Auto-select display mode if not specified
  const effectiveDisplayMode = useMemo(() => {
    if (display.mode) return display.mode;
    
    // Auto-select based on data characteristics
    const nDists = distributions.length;
    const hasObserved = distributions.some(d => d.metadata?.isObserved);
    const hasPredicted = distributions.some(d => !d.metadata?.isObserved);
    
    if (nDists === 1) return 'density';
    if (hasObserved && hasPredicted) return 'mixed'; // PPC style
    if (nDists === 2 && hasObserved) return 'mixed'; // PPC style
    if (nDists > 4) return 'ridge';
    return 'density';
  }, [display.mode, distributions]);
  
  // Main rendering effect
  useEffect(() => {
    if (!svgRef.current || !hasData) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create main group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Determine what data to plot
    const dataToPlot = comparisonData && comparison?.mode !== 'overlay' 
      ? comparisonData 
      : distributionStates.filter(d => d.samples);
    
    if (dataToPlot.length === 0) return;
    
    // Create scales
    const allSamples = dataToPlot.flatMap(d => 
      'samples' in d ? (d.samples || []) : []
    );
    
    if (allSamples.length === 0) return;
    
    const xDomain = d3.extent(allSamples) as [number, number];
    const xScale = d3.scaleLinear()
      .domain(xDomain)
      .range([0, innerWidth])
      .nice();
    
    // Y scale depends on display mode
    let yScale: d3.ScaleLinear<number, number>;
    if (effectiveDisplayMode === 'ridge') {
      yScale = d3.scaleLinear()
        .domain([0, dataToPlot.length])
        .range([innerHeight, 0]);
    } else {
      // For density/histogram, we'll compute after calculating densities
      yScale = d3.scaleLinear()
        .domain([0, 1])
        .range([innerHeight, 0]);
    }
    
    // Render context for all renderers
    const renderContext = {
      container: g,
      xScale,
      yScale,
      width: innerWidth,
      height: innerHeight,
      formatValue,
      formatPercent
    };
    
    // Render based on display mode
    switch (effectiveDisplayMode) {
      case 'density':
        renderDensityPlot(renderContext, dataToPlot, display, comparison);
        break;
      case 'histogram':
        renderHistogramPlot(renderContext, dataToPlot, display, comparison);
        break;
      case 'mixed':
        renderMixedPlot(renderContext, dataToPlot, display, comparison);
        break;
      case 'ridge':
        renderRidgePlot(renderContext, dataToPlot, display, comparison);
        break;
      case 'ecdf':
        renderECDFPlot(renderContext, dataToPlot, display, comparison);
        break;
    }
    
    // Add grid lines if requested
    if (display.showGrid) {
      g.append('g')
        .attr('class', 'grid grid-x')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale)
          .tickSize(-innerHeight)
          .tickFormat(() => ''))
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3);
      
      g.append('g')
        .attr('class', 'grid grid-y')
        .call(d3.axisLeft(yScale)
          .tickSize(-innerWidth)
          .tickFormat(() => ''))
        .style('stroke-dasharray', '3,3')
        .style('opacity', 0.3);
    }
    
    // Add axes
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(d => formatValue(d as number)))
      .append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 40)
      .attr('fill', 'black')
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .text(xLabel);
    
    if (effectiveDisplayMode !== 'ridge') {
      g.append('g')
        .attr('class', 'y-axis')
        .call(d3.axisLeft(yScale).tickFormat(d => {
          if (effectiveDisplayMode === 'ecdf') {
            return formatPercent(d as number);
          }
          return d3.format('.3f')(d as number);
        }))
        .append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -50)
        .attr('x', -innerHeight / 2)
        .attr('fill', 'black')
        .style('text-anchor', 'middle')
        .style('font-size', '14px')
        .text(yLabel);
    }
    
    // Add title and subtitle
    if (title) {
      g.append('text')
        .attr('class', 'title')
        .attr('x', innerWidth / 2)
        .attr('y', -35)
        .attr('text-anchor', 'middle')
        .style('font-size', '18px')
        .style('font-weight', 'bold')
        .text(title);
    }
    
    if (subtitle) {
      g.append('text')
        .attr('class', 'subtitle')
        .attr('x', innerWidth / 2)
        .attr('y', -15)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#6b7280')
        .text(subtitle);
    }
    
    // Add legend for multiple distributions
    if (distributionStates.length > 1) {
      renderLegend({
        container: g,
        distributions: distributionStates,
        x: innerWidth + 20,
        y: 20,
        formatValue,
        formatPercent,
        showStats: display.showMean || display.showCI
      });
    }
    
    // Add comparison annotations if applicable
    if (comparisonData && comparison?.showProbabilityOfImprovement) {
      renderComparisonAnnotations({
        container: g,
        comparisons: comparisonData,
        width: innerWidth,
        height: innerHeight,
        formatPercent,
        formatDifference
      });
    }
    
    // Add practical threshold annotation if specified
    if (comparisonData && comparison?.practicalThreshold) {
      // This would show P(effect > threshold) for each comparison
      // Implementation depends on specific needs
    }
    
    // Set up interactions if provided
    if (onHover || onClick) {
      // Add invisible rect for capturing mouse events
      g.append('rect')
        .attr('class', 'interaction-layer')
        .attr('width', innerWidth)
        .attr('height', innerHeight)
        .attr('fill', 'none')
        .attr('pointer-events', 'all')
        .on('mousemove', function(event) {
          if (!onHover) return;
          const [x] = d3.pointer(event);
          const value = xScale.invert(x);
          // Find closest distribution
          // TODO: Implement hover logic
        })
        .on('click', function(event) {
          if (!onClick) return;
          // TODO: Implement click logic
        });
    }
    
  }, [distributionStates, comparisonData, effectiveDisplayMode, display, comparison,
      width, height, margin, formatValue, formatPercent, formatDifference,
      title, subtitle, xLabel, yLabel, onHover, onClick]);
  
  // Loading state
  if (isLoading) {
    const progress = distributionStates.reduce((sum, d) => sum + d.progress, 0) / 
                    distributionStates.length;
    
    return (
      <div 
        ref={containerRef}
        className="flex flex-col items-center justify-center" 
        style={{ width, height }}
      >
        <div className="text-center">
          <div className="text-gray-600 mb-2">
            Generating distributions...
          </div>
          <div className="w-64 bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-sm text-gray-500">
            Processing {distributions.length} distribution{distributions.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>
    );
  }
  
  // Error state
  if (errors.length > 0) {
    return (
      <div 
        ref={containerRef}
        className="flex items-center justify-center" 
        style={{ width, height }}
      >
        <div className="text-center">
          <div className="text-red-600 font-semibold mb-2">
            Error loading distributions
          </div>
          {errors.map((e, i) => (
            <div key={i} className="text-sm text-red-500">
              {e.label}: {e.error}
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // No data state
  if (!hasData) {
    return (
      <div 
        ref={containerRef}
        className="flex items-center justify-center" 
        style={{ width, height }}
      >
        <div className="text-gray-500">
          No data to display
        </div>
      </div>
    );
  }
  
  return (
    <div ref={containerRef} style={{ width, height }}>
      <svg ref={svgRef} width={width} height={height} />
    </div>
  );
}; 