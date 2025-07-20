import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export interface ComparisonPlotProps {
  controlSamples: number[];
  treatmentSamples: number[];
  controlLabel?: string;
  treatmentLabel?: string;
  metric: 'conversion' | 'revenue';
  showRawData?: boolean;
  rawData?: {
    control: number[];
    treatment: number[];
  };
}

/**
 * Side-by-side comparison plot with shared axes
 * Shows posterior distributions and optionally raw data
 */
export const ComparisonPlot: React.FC<ComparisonPlotProps> = ({
  controlSamples,
  treatmentSamples,
  controlLabel = 'Control',
  treatmentLabel = 'Treatment',
  metric = 'conversion',
  showRawData = false,
  rawData
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  
  useEffect(() => {
    if (!svgRef.current || controlSamples.length === 0 || treatmentSamples.length === 0) return;
    
    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();
    
    // Set up dimensions
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    const plotHeight = height / 2 - 20; // Space for two plots
    
    const svg = d3.select(svgRef.current)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Calculate shared scale bounds
    const allSamples = [...controlSamples, ...treatmentSamples];
    const xExtent = d3.extent(allSamples) as [number, number];
    const xPadding = (xExtent[1] - xExtent[0]) * 0.1;
    
    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, width]);
    
    // Create bins for histograms
    const histogram = d3.histogram()
      .domain(xScale.domain() as [number, number])
      .thresholds(30);
    
    const controlBins = histogram(controlSamples);
    const treatmentBins = histogram(treatmentSamples);
    
    // Y scales for each plot
    const yScaleControl = d3.scaleLinear()
      .domain([0, d3.max(controlBins, d => d.length) || 1])
      .range([plotHeight, 0]);
    
    const yScaleTreatment = d3.scaleLinear()
      .domain([0, d3.max(treatmentBins, d => d.length) || 1])
      .range([plotHeight, 0]);
    
    // Draw control histogram
    const controlGroup = svg.append('g')
      .attr('transform', 'translate(0, 0)');
    
    controlGroup.append('text')
      .attr('x', 0)
      .attr('y', -5)
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text(controlLabel);
    
    controlGroup.selectAll('rect')
      .data(controlBins)
      .enter().append('rect')
      .attr('x', d => xScale(d.x0 || 0))
      .attr('y', d => yScaleControl(d.length))
      .attr('width', d => xScale(d.x1 || 0) - xScale(d.x0 || 0) - 1)
      .attr('height', d => plotHeight - yScaleControl(d.length))
      .attr('fill', '#3B82F6')
      .attr('opacity', 0.7);
    
    // Draw treatment histogram
    const treatmentGroup = svg.append('g')
      .attr('transform', `translate(0, ${plotHeight + 40})`);
    
    treatmentGroup.append('text')
      .attr('x', 0)
      .attr('y', -5)
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .text(treatmentLabel);
    
    treatmentGroup.selectAll('rect')
      .data(treatmentBins)
      .enter().append('rect')
      .attr('x', d => xScale(d.x0 || 0))
      .attr('y', d => yScaleTreatment(d.length))
      .attr('width', d => xScale(d.x1 || 0) - xScale(d.x0 || 0) - 1)
      .attr('height', d => plotHeight - yScaleTreatment(d.length))
      .attr('fill', '#10B981')
      .attr('opacity', 0.7);
    
    // Add statistics overlay
    const controlStats = calculateStats(controlSamples);
    const treatmentStats = calculateStats(treatmentSamples);
    
    // Control CI line
    controlGroup.append('line')
      .attr('x1', xScale(controlStats.ci80[0]))
      .attr('x2', xScale(controlStats.ci80[1]))
      .attr('y1', plotHeight + 5)
      .attr('y2', plotHeight + 5)
      .attr('stroke', '#1E40AF')
      .attr('stroke-width', 3);
    
    // Control mean line
    controlGroup.append('line')
      .attr('x1', xScale(controlStats.mean))
      .attr('x2', xScale(controlStats.mean))
      .attr('y1', 0)
      .attr('y2', plotHeight)
      .attr('stroke', '#DC2626')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,2');
    
    // Treatment CI line
    treatmentGroup.append('line')
      .attr('x1', xScale(treatmentStats.ci80[0]))
      .attr('x2', xScale(treatmentStats.ci80[1]))
      .attr('y1', plotHeight + 5)
      .attr('y2', plotHeight + 5)
      .attr('stroke', '#059669')
      .attr('stroke-width', 3);
    
    // Treatment mean line
    treatmentGroup.append('line')
      .attr('x1', xScale(treatmentStats.mean))
      .attr('x2', xScale(treatmentStats.mean))
      .attr('y1', 0)
      .attr('y2', plotHeight)
      .attr('stroke', '#DC2626')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4,2');
    
    // Shared X axis
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => {
        const val = d as number;
        if (metric === 'conversion') {
          return `${(val * 100).toFixed(0)}%`;
        } else {
          return `$${val.toFixed(0)}`;
        }
      });
    
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);
    
    // Add raw data overlay if requested
    if (showRawData && rawData) {
      // Add semi-transparent overlay for raw data
      const rawControlBins = histogram(rawData.control.filter(v => !isNaN(v)));
      const rawTreatmentBins = histogram(rawData.treatment.filter(v => !isNaN(v)));
      
      // Overlay raw data with different style
      controlGroup.selectAll('.raw-rect')
        .data(rawControlBins)
        .enter().append('rect')
        .attr('class', 'raw-rect')
        .attr('x', d => xScale(d.x0 || 0))
        .attr('y', d => yScaleControl(d.length))
        .attr('width', d => xScale(d.x1 || 0) - xScale(d.x0 || 0) - 1)
        .attr('height', d => plotHeight - yScaleControl(d.length))
        .attr('fill', 'none')
        .attr('stroke', '#6B7280')
        .attr('stroke-width', 1);
      
      treatmentGroup.selectAll('.raw-rect')
        .data(rawTreatmentBins)
        .enter().append('rect')
        .attr('class', 'raw-rect')
        .attr('x', d => xScale(d.x0 || 0))
        .attr('y', d => yScaleTreatment(d.length))
        .attr('width', d => xScale(d.x1 || 0) - xScale(d.x0 || 0) - 1)
        .attr('height', d => plotHeight - yScaleTreatment(d.length))
        .attr('fill', 'none')
        .attr('stroke', '#6B7280')
        .attr('stroke-width', 1);
    }
    
  }, [controlSamples, treatmentSamples, metric, showRawData, rawData]);
  
  // Calculate summary statistics
  const controlStats = calculateStats(controlSamples);
  const treatmentStats = calculateStats(treatmentSamples);
  const probBetter = calculateProbability(controlSamples, treatmentSamples);
  
  const format = (v: number) => {
    if (metric === 'conversion') {
      return `${(v * 100).toFixed(1)}%`;
    } else {
      return `$${v.toFixed(2)}`;
    }
  };
  
  return (
    <div className="w-full space-y-4">
      <svg ref={svgRef} width="100%" height="300" className="bg-white rounded border" />
      
      {/* Summary Statistics */}
      <div className="bg-blue-50 rounded p-4 space-y-2">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold text-gray-700">{controlLabel}</p>
            <p>Mean: {format(controlStats.mean)}</p>
            <p className="text-xs text-gray-600">
              80% CI: [{format(controlStats.ci80[0])}, {format(controlStats.ci80[1])}]
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-700">{treatmentLabel}</p>
            <p>Mean: {format(treatmentStats.mean)}</p>
            <p className="text-xs text-gray-600">
              80% CI: [{format(treatmentStats.ci80[0])}, {format(treatmentStats.ci80[1])}]
            </p>
          </div>
        </div>
        
        <div className="pt-2 border-t">
          <p className="text-sm">
            <span className="font-semibold">Relative Difference:</span>{' '}
            {((treatmentStats.mean / controlStats.mean - 1) * 100).toFixed(1)}%
          </p>
          <p className="text-sm text-gray-600">
            P({treatmentLabel} &gt; {controlLabel}) = {probBetter.toFixed(1)}%
          </p>
        </div>
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 bg-blue-500 opacity-70"></div>
          <span>{controlLabel} Posterior</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 bg-green-500 opacity-70"></div>
          <span>{treatmentLabel} Posterior</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-red-600"></div>
          <span>Mean</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-1 bg-blue-800"></div>
          <span>80% CI</span>
        </div>
        {showRawData && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-3 border border-gray-500"></div>
            <span>Raw Data</span>
          </div>
        )}
      </div>
    </div>
  );
};

function calculateStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const ci80 = [
    sorted[Math.floor(0.1 * samples.length)],
    sorted[Math.floor(0.9 * samples.length)]
  ];
  const ci95 = [
    sorted[Math.floor(0.025 * samples.length)],
    sorted[Math.floor(0.975 * samples.length)]
  ];
  
  return { mean, ci80, ci95, median: sorted[Math.floor(0.5 * samples.length)] };
}

function calculateProbability(controlSamples: number[], treatmentSamples: number[]): number {
  let count = 0;
  const n = Math.min(controlSamples.length, treatmentSamples.length);
  
  for (let i = 0; i < n; i++) {
    if (treatmentSamples[i] > controlSamples[i]) {
      count++;
    }
  }
  
  return (count / n) * 100;
}