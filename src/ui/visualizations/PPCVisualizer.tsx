// src/ui/visualizations/PPCVisualizer.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Posterior } from '../../inference/base/types';

interface PPCVisualizerProps {
  /** Observed data values */
  observedData: number[];
  
  /** Posterior to sample from */
  posterior: Posterior;
  
  /** Number of posterior samples to draw */
  nSamples?: number;
  
  /** Number of samples for CI computation */
  nCISamples?: number;
  
  /** Whether to show credible intervals */
  showCI?: boolean;
  
  /** CI levels to display */
  ciLevels?: number[];
  
  /** Chart dimensions */
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  
  /** Value formatter (e.g., for currency) */
  formatValue?: (v: number) => string;
  
  /** Label for x-axis */
  xLabel?: string;
  
  /** Color scheme */
  colors?: {
    observed: string;
    predicted: string;
    ci80: string;
    ci95: string;
  };
}

export const PPCVisualizer: React.FC<PPCVisualizerProps> = ({
  observedData,
  posterior,
  nSamples = 5000,
  nCISamples = 100,
  showCI = true,
  ciLevels = [0.8, 0.95],
  width = 800,
  height = 400,
  margin = { top: 40, right: 40, bottom: 60, left: 60 },
  formatValue = (v: number) => v.toFixed(1),
  xLabel = 'Value',
  colors = {
    observed: '#FF6B6B', // Coral red
    predicted: '#9B59B6', // Purple
    ci80: '#9B59B6',
    ci95: '#9B59B6'
  }
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isGeneratingSamples, setIsGeneratingSamples] = useState(true);
  
  // Generate posterior samples
  const posteriorSamples = useMemo(() => {
    const samples: number[] = [];
    for (let i = 0; i < nSamples; i++) {
      const sample = posterior.sample()[0];
      if (!isNaN(sample) && isFinite(sample)) {
        samples.push(sample);
      }
    }
    setIsGeneratingSamples(false);
    return samples;
  }, [posterior, nSamples]);
  
  // Compute density with uncertainty bands
  const densityData = useMemo(() => {
    if (posteriorSamples.length === 0) return null;
    
    // Determine x-range from both observed and predicted
    const allData = [...observedData, ...posteriorSamples];
    const xMin = Math.min(...allData);
    const xMax = Math.max(...allData);
    const range = xMax - xMin;
    
    // Create evaluation points
    const nPoints = 150;
    const xValues: number[] = [];
    for (let i = 0; i <= nPoints; i++) {
      xValues.push(xMin - range * 0.1 + (range * 1.2) * i / nPoints);
    }
    
    if (showCI) {
      // Compute density bands with uncertainty
      const densityBands = xValues.map(x => {
        const densities: number[] = [];
        
        // Generate multiple density estimates to capture uncertainty
        for (let i = 0; i < nCISamples; i++) {
          // Draw a fresh set of samples
          const samples: number[] = [];
          const sampleSize = Math.min(1000, nSamples);
          for (let j = 0; j < sampleSize; j++) {
            const s = posterior.sample()[0];
            if (!isNaN(s) && isFinite(s)) {
              samples.push(s);
            }
          }
          
          // Compute KDE at this point
          const bandwidth = computeBandwidth(samples);
          let density = 0;
          for (const xi of samples) {
            const z = (x - xi) / bandwidth;
            density += Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
          }
          density /= (samples.length * bandwidth);
          densities.push(density);
        }
        
        // Sort to get quantiles
        densities.sort((a, b) => a - b);
        
        // Extract CI bounds
        const result: any = { x, median: densities[Math.floor(densities.length / 2)] };
        ciLevels.forEach(level => {
          const alpha = (1 - level) / 2;
          result[`ci${level * 100}_lower`] = densities[Math.floor(alpha * densities.length)];
          result[`ci${level * 100}_upper`] = densities[Math.floor((1 - alpha) * densities.length)];
        });
        
        return result;
      });
      
      return { type: 'bands' as const, data: densityBands };
    } else {
      // Simple KDE without CI
      const bandwidth = computeBandwidth(posteriorSamples);
      const density = xValues.map(x => {
        let d = 0;
        for (const xi of posteriorSamples) {
          const z = (x - xi) / bandwidth;
          d += Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
        }
        return { x, density: d / (posteriorSamples.length * bandwidth) };
      });
      
      return { type: 'simple' as const, data: density };
    }
  }, [observedData, posteriorSamples, showCI, ciLevels, nCISamples, posterior, nSamples]);
  
  // Main visualization
  useEffect(() => {
    if (!svgRef.current || isGeneratingSamples || !densityData) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Compute scales
    const allData = [...observedData, ...posteriorSamples];
    const xExtent = d3.extent(allData) as [number, number];
    const xPadding = (xExtent[1] - xExtent[0]) * 0.1;
    
    const x = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, innerWidth]);
    
    // Create histogram for observed data with better binning logic
    // Use more bins and base on observed data range to handle wide posterior tails
    const numBins = Math.min(50, Math.max(15, Math.ceil(observedData.length / 3)));
    
    // Use observed data range for histogram, not the full x-axis range
    // This ensures we have enough detail even when posterior has long tails
    const observedExtent = d3.extent(observedData) as [number, number];
    const observedRange = observedExtent[1] - observedExtent[0];
    
    // Create histogram based on observed data range
    const bins = d3.histogram()
      .domain(observedExtent)
      .thresholds(numBins)(observedData);
    
    // Compute y-scale for density and histogram
    let maxDensity = 0;
    if (densityData.type === 'bands') {
      maxDensity = d3.max(densityData.data, d => 
        Math.max(d.median, d.ci80_upper || 0, d.ci95_upper || 0)
      ) || 0;
    } else {
      maxDensity = d3.max(densityData.data, d => d.density) || 0;
    }
    
    // Scale histogram to match density scale, but only for the observed data range
    const maxHistogramDensity = d3.max(bins, (d: any) => d.length / (observedData.length * (d.x1! - d.x0!))) || 0;
    const scaleFactor = maxDensity / maxHistogramDensity;
    
    const y = d3.scaleLinear()
      .domain([0, maxDensity * 1.1])
      .range([innerHeight, 0]);
    
    // Add x-axis
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d => formatValue(d as number)));
    
    // Add x-axis label
    xAxis.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 40)
      .attr('fill', 'black')
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .text(xLabel);
    
    // Add y-axis
    g.append('g')
      .call(d3.axisLeft(y).tickFormat(d => d3.format('.3f')(d as number)))
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'black')
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .text('Density');
    
    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickSize(-innerHeight).tickFormat(() => ''))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);
    
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(() => ''))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);
    
    // Draw density visualization
    if (densityData.type === 'bands') {
      // Draw CI bands
      ciLevels.slice().reverse().forEach((level, i) => {
        const area = d3.area<any>()
          .x(d => x(d.x))
          .y0(d => y(d[`ci${level * 100}_lower`]))
          .y1(d => y(d[`ci${level * 100}_upper`]))
          .curve(d3.curveMonotoneX);
        
        g.append('path')
          .datum(densityData.data)
          .attr('fill', i === 0 ? colors.ci95 : colors.ci80)
          .attr('opacity', i === 0 ? 0.2 : 0.3)
          .attr('d', area);
      });
      
      // Draw median line
      const medianLine = d3.line<any>()
        .x(d => x(d.x))
        .y(d => y(d.median))
        .curve(d3.curveMonotoneX);
      
      g.append('path')
        .datum(densityData.data)
        .attr('fill', 'none')
        .attr('stroke', colors.predicted)
        .attr('stroke-width', 3)
        .attr('d', medianLine);
    } else {
      // Simple density line
      const line = d3.line<any>()
        .x(d => x(d.x))
        .y(d => y(d.density))
        .curve(d3.curveMonotoneX);
      
      g.append('path')
        .datum(densityData.data)
        .attr('fill', 'none')
        .attr('stroke', colors.predicted)
        .attr('stroke-width', 3)
        .attr('d', line);
    }
    
    // Draw observed data histogram with visual separation
    g.selectAll('.bar')
      .data(bins)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.x0!) + 1) // 1px gap on left
      .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2)) // 2px total gap
      .attr('y', d => y((d.length / (observedData.length * (d.x1! - d.x0!))) * scaleFactor))
      .attr('height', d => innerHeight - y((d.length / (observedData.length * (d.x1! - d.x0!))) * scaleFactor))
      .attr('fill', colors.observed)
      .attr('opacity', 0.7)
      .attr('stroke', colors.observed)
      .attr('stroke-width', 0.5);
    
    // Add legend
    const legend = g.append('g')
      .attr('transform', `translate(${innerWidth - 150}, 0)`);
    
    const legendItems: Array<{
      label: string;
      color: string;
      opacity: number;
      type: 'rect' | 'line' | 'area';
    }> = [
      { label: 'Observed Data (Histogram)', color: colors.observed, opacity: 0.7, type: 'rect' },
      { label: 'Posterior Predictive', color: colors.predicted, opacity: 1, type: 'line' }
    ];
    
    if (showCI) {
      legendItems.push(
        { label: '80% CI', color: colors.ci80, opacity: 0.3, type: 'area' },
        { label: '95% CI', color: colors.ci95, opacity: 0.2, type: 'area' }
      );
    }
    
    legendItems.forEach((item, i) => {
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
    
  }, [observedData, posteriorSamples, densityData, showCI, ciLevels, width, height, margin, formatValue, xLabel, colors, isGeneratingSamples]);
  
  if (isGeneratingSamples) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <div className="text-gray-600">Generating posterior samples...</div>
      </div>
    );
  }
  
  return <svg ref={svgRef} width={width} height={height} />;
};

// Helper function
function computeBandwidth(data: number[]): number {
  const std = d3.deviation(data) || 1;
  return 1.06 * std * Math.pow(data.length, -0.2);
}