import React, { useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { 
  useD3Visualization, 
  BaseVisualizationProps, 
  D3Context
} from './base';
import { getVariantColor } from './base/colors';
import { Formatters } from './base/formatters';
import { calculateKDE, calculateViolinStats } from './utils/statistics';

// Types for violin plot data
export interface ViolinDataPoint {
  value: number;
  density: number;
  quantile?: number;
}

export interface ViolinData {
  variantId: string;
  variantName: string;
  densityPoints: ViolinDataPoint[];
  statistics: {
    mean: number;
    median: number;
    q1: number;
    q3: number;
    ci95Lower: number;
    ci95Upper: number;
    min: number;
    max: number;
  };
  visual: {
    color: string;
    isBaseline?: boolean;
  };
}

export interface ViolinPlotSpec {
  title: string;
  layout: 'grouped' | 'faceted';
  violins: ViolinData[];
  axes: {
    x: { label: string; type: 'categorical' };
    y: { 
      label: string;
      transform?: 'linear' | 'log' | 'percentage';
    };
  };
  visual: {
    violinWidth: number;
    showBoxPlot: boolean;
    showDataPoints: boolean;
    showMean: boolean;
    bandwidthMethod: 'scott' | 'silverman';
    kernelType: 'gaussian';
  };
}

export interface ViolinPlotProps extends BaseVisualizationProps {
  spec: ViolinPlotSpec;
  width?: number;
  height?: number;
}

/**
 * Violin plot for visualizing posterior distributions
 */
export const ViolinPlot: React.FC<ViolinPlotProps> = ({
  spec,
  width = 800,
  height = 400,
  ...baseProps
}) => {
  // Main render function
  const renderViolin = useCallback((context: D3Context, plotSpec: ViolinPlotSpec) => {
    const { g, innerWidth, innerHeight } = context;
    const { violins, axes, visual } = plotSpec;

    // Create scales
    const xScale = d3.scaleBand()
      .domain(violins.map(v => v.variantId))
      .range([0, innerWidth])
      .padding(0.2);

    // Find y domain across all violins
    let min = Infinity;
    let max = -Infinity;
    
    violins.forEach(violin => {
      min = Math.min(min, violin.statistics.min);
      max = Math.max(max, violin.statistics.max);
    });
    
    // Add padding
    const padding = (max - min) * 0.1;
    const yDomain = [min - padding, max + padding];

    const yScale = d3.scaleLinear()
      .domain(yDomain)
      .range([innerHeight, 0])
      .nice();

    // Create axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale)
      .tickFormat((d: any) => {
        if (axes.y.transform === 'percentage') {
          return Formatters.percentage(1)(d);
        }
        return Formatters.auto(d, axes.y.label);
      });

    // Add x-axis
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(xAxis)
      .append("text")
      .attr("x", innerWidth / 2)
      .attr("y", 40)
      .attr("text-anchor", "middle")
      .text(axes.x.label);

    // Add y-axis with gridlines
    g.append("g")
      .call(yAxis)
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").clone()
        .attr("x2", innerWidth)
        .attr("stroke-opacity", 0.1))
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -60)
      .attr("x", -innerHeight / 2)
      .attr("text-anchor", "middle")
      .text(axes.y.label);

    // Add title
    if (plotSpec.title) {
      g.append("text")
        .attr("x", innerWidth / 2)
        .attr("y", -20)
        .attr("text-anchor", "middle")
        .style("font-size", "16px")
        .style("font-weight", "bold")
        .text(plotSpec.title);
    }

    // Render each violin
    violins.forEach((violin, index) => {
      const x = xScale(violin.variantId)!;
      const violinWidth = xScale.bandwidth() * visual.violinWidth;

      renderSingleViolin(
        g,
        violin,
        x + xScale.bandwidth() / 2,
        yScale,
        violinWidth,
        visual,
        index
      );
    });
  }, []);

  // Use the base hook
  const { svgRef, containerRef } = useD3Visualization(
    renderViolin,
    spec,
    { width, height, ...baseProps }
  );

  return (
    <div ref={containerRef} className={baseProps.className}>
      <svg ref={svgRef} />
    </div>
  );
};

/**
 * Render a single violin
 */
function renderSingleViolin(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  violin: ViolinData,
  x: number,
  yScale: d3.ScaleLinear<number, number>,
  maxWidth: number,
  visual: ViolinPlotSpec['visual'],
  colorIndex: number
) {
  const violinG = g.append("g")
    .attr("class", `violin violin-${violin.variantId}`)
    .attr("transform", `translate(${x}, 0)`);

  // Create density scale
  const maxDensity = Math.max(...violin.densityPoints.map(d => d.density));
  const densityScale = d3.scaleLinear()
    .domain([0, maxDensity])
    .range([0, maxWidth / 2]);

  // Create area generator for violin shape
  const areaLeft = d3.area<ViolinDataPoint>()
    .x0(d => -densityScale(d.density))
    .x1(0)
    .y(d => yScale(d.value))
    .curve(d3.curveBasis);

  const areaRight = d3.area<ViolinDataPoint>()
    .x0(0)
    .x1(d => densityScale(d.density))
    .y(d => yScale(d.value))
    .curve(d3.curveBasis);

  // Draw violin shape
  const violinPath = violinG.append("g")
    .attr("class", "violin-shape");

  violinPath.append("path")
    .datum(violin.densityPoints)
    .attr("d", areaLeft)
    .attr("fill", violin.visual.color)
    .attr("fill-opacity", 0.6);

  violinPath.append("path")
    .datum(violin.densityPoints)
    .attr("d", areaRight)
    .attr("fill", violin.visual.color)
    .attr("fill-opacity", 0.6);

  // Add box plot overlay if requested
  if (visual.showBoxPlot) {
    const boxWidth = maxWidth * 0.3;
    const { q1, q3, median } = violin.statistics;

    // Box
    violinG.append("rect")
      .attr("x", -boxWidth / 2)
      .attr("y", yScale(q3))
      .attr("width", boxWidth)
      .attr("height", yScale(q1) - yScale(q3))
      .attr("fill", "white")
      .attr("stroke", violin.visual.color)
      .attr("stroke-width", 2);

    // Median line
    violinG.append("line")
      .attr("x1", -boxWidth / 2)
      .attr("x2", boxWidth / 2)
      .attr("y1", yScale(median))
      .attr("y2", yScale(median))
      .attr("stroke", violin.visual.color)
      .attr("stroke-width", 2);

    // Whiskers
    const { ci95Lower, ci95Upper } = violin.statistics;
    
    violinG.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", yScale(q3))
      .attr("y2", yScale(ci95Upper))
      .attr("stroke", violin.visual.color)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");

    violinG.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", yScale(q1))
      .attr("y2", yScale(ci95Lower))
      .attr("stroke", violin.visual.color)
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "2,2");
  }

  // Add mean point if requested
  if (visual.showMean) {
    violinG.append("circle")
      .attr("cx", 0)
      .attr("cy", yScale(violin.statistics.mean))
      .attr("r", 4)
      .attr("fill", "white")
      .attr("stroke", violin.visual.color)
      .attr("stroke-width", 2);
  }
}

/**
 * Transform posterior into violin data
 */
export function posteriorToViolin(
  variantId: string,
  variantName: string,
  posterior: any, // Posterior type
  nSamples: number = 1000,
  colorIndex: number = 0
): ViolinData {
  // Debug: Check if posterior has sample method
  console.log('🔍 Posterior debug:', {
    variantId,
    type: typeof posterior,
    hasSample: typeof posterior.sample === 'function',
    keys: Object.keys(posterior),
    sampleMethod: posterior.sample
  });
  
  if (typeof posterior.sample !== 'function') {
    console.error('❌ Posterior does not have sample method:', posterior);
    throw new Error(`Posterior for ${variantId} does not have sample method`);
  }
  
  // Generate samples
  const samples: number[] = [];
  for (let i = 0; i < nSamples; i++) {
    const sample = posterior.sample()[0];
    if (!isNaN(sample) && isFinite(sample)) {
      samples.push(sample);
    }
  }
  
  // Calculate density
  const densityPoints = calculateKDE(samples, 50);
  
  // Calculate statistics
  const statistics = calculateViolinStats(samples);
  
  return {
    variantId,
    variantName,
    densityPoints,
    statistics,
    visual: {
      color: getVariantColor(variantId, colorIndex),
      isBaseline: variantId === 'control' || variantId === 'baseline'
    }
  };
} 