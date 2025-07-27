// src/ui/visualizations/ParameterSpaceVisualizer.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Posterior, CompoundDataInput, DataInput, UserData } from '../../inference/base/types';

interface ParameterSpaceVisualizerProps {
  /** Raw data to visualize */
  data: DataInput | CompoundDataInput;
  
  /** Posterior distribution */
  posterior: Posterior | any; // Allow compound posteriors
  
  /** X-axis variable (for compound: 'index', 'segment', etc.) */
  xVariable?: 'index' | 'segment' | 'time';
  
  /** Y-axis parameter to visualize */
  yParameter?: 'conversion' | 'revenue' | 'value';
  
  /** Number of posterior samples to draw for uncertainty */
  nPosteriorSamples?: number;
  
  /** Whether to show individual posterior draws */
  showPosteriorDraws?: boolean;
  
  /** Number of posterior draws to show */
  numPosteriorDraws?: number;
  
  /** Chart dimensions */
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  
  /** Value formatter */
  formatValue?: (v: number) => string;
  
  /** Labels */
  xLabel?: string;
  yLabel?: string;
  title?: string;
  
  /** Color scheme */
  colors?: {
    data: string;
    posteriorMean: string;
    ci80: string;
    ci95: string;
    posteriorDraws: string;
  };
}

export const ParameterSpaceVisualizer: React.FC<ParameterSpaceVisualizerProps> = ({
  data,
  posterior,
  xVariable = 'index',
  yParameter = 'value',
  nPosteriorSamples = 500,
  showPosteriorDraws = false,
  numPosteriorDraws = 50,
  width = 800,
  height = 400,
  margin = { top: 40, right: 40, bottom: 60, left: 80 },
  formatValue = (v: number) => {
    // Smart formatting based on parameter type
    if (yParameter === 'conversion') return (v * 100).toFixed(1) + '%';
    if (yParameter === 'revenue' || yParameter === 'value') return '$' + v.toFixed(0);
    return v.toFixed(2);
  },
  xLabel = xVariable === 'index' ? 'User Index' : xVariable.charAt(0).toUpperCase() + xVariable.slice(1),
  yLabel = yParameter.charAt(0).toUpperCase() + yParameter.slice(1),
  title = 'Parameter Space Analysis',
  colors = {
    data: '#FF6B6B',      // Zenith Data coral
    posteriorMean: '#9B59B6', // Zenith Data lilac
    ci80: '#9B59B6',
    ci95: '#9B59B6',
    posteriorDraws: '#9B59B6'
  }
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isProcessing, setIsProcessing] = useState(true);
  
  // Process data points
  const dataPoints = useMemo(() => {
    const points: Array<{ x: number; y: number; type: string }> = [];
    
    console.log('ParameterSpaceVisualizer: Input data:', data);
    console.log('ParameterSpaceVisualizer: Data type:', typeof data);
    console.log('ParameterSpaceVisualizer: Is array:', Array.isArray(data));
    if (Array.isArray(data) && data.length > 0) {
      console.log('ParameterSpaceVisualizer: First element:', data[0]);
      console.log('ParameterSpaceVisualizer: First element type:', typeof data[0]);
      if (typeof data[0] === 'object' && data[0] !== null) {
        console.log('ParameterSpaceVisualizer: First element keys:', Object.keys(data[0]));
      }
    }
    
    // Handle different data formats
    if (Array.isArray(data)) {
      // Direct array format
      const dataArray = data;
      console.log('ParameterSpaceVisualizer: Direct array format, length:', dataArray.length);
      
      if (dataArray.length === 0) {
        console.log('ParameterSpaceVisualizer: Empty data array');
        return points;
      }
      
      // Check if this is user data (compound model)
      if (typeof dataArray[0] === 'object' && dataArray[0] !== null && 'converted' in dataArray[0]) {
        console.log('ParameterSpaceVisualizer: Processing compound data');
        const userData = dataArray as UserData[];
        
        userData.forEach((user, idx) => {
          let x = idx;
          let y = 0;
          
          // Determine y value based on parameter
          if (yParameter === 'conversion') {
            y = user.converted ? 1 : 0;
          } else if ((yParameter === 'revenue' || yParameter === 'value') && user.converted) {
            y = user.value;
          }
          
          if (y > 0 || yParameter === 'conversion') {
            points.push({ x, y, type: user.converted ? 'converted' : 'not-converted' });
          }
        });
      } else if (typeof dataArray[0] === 'number') {
        console.log('ParameterSpaceVisualizer: Processing numeric array');
        dataArray.forEach((value, idx) => {
          points.push({ x: idx, y: value as number, type: 'observed' });
        });
      } else {
        console.log('ParameterSpaceVisualizer: Unknown data format, first element:', dataArray[0]);
      }
    } else if ('data' in data && Array.isArray(data.data)) {
      // Wrapped array format
      const dataArray = data.data;
      console.log('ParameterSpaceVisualizer: Wrapped array format, length:', dataArray.length);
      
      if (dataArray.length === 0) {
        console.log('ParameterSpaceVisualizer: Empty data array');
        return points;
      }
      
      // Check if this is user data (compound model)
      if (typeof dataArray[0] === 'object' && dataArray[0] !== null && 'converted' in dataArray[0]) {
        console.log('ParameterSpaceVisualizer: Processing compound data');
        const userData = dataArray as UserData[];
        
        userData.forEach((user, idx) => {
          let x = idx;
          let y = 0;
          
          // Determine y value based on parameter
          if (yParameter === 'conversion') {
            y = user.converted ? 1 : 0;
          } else if ((yParameter === 'revenue' || yParameter === 'value') && user.converted) {
            y = user.value;
          }
          
          if (y > 0 || yParameter === 'conversion') {
            points.push({ x, y, type: user.converted ? 'converted' : 'not-converted' });
          }
        });
      } else if (typeof dataArray[0] === 'number') {
        console.log('ParameterSpaceVisualizer: Processing numeric array');
        dataArray.forEach((value, idx) => {
          points.push({ x: idx, y: value as number, type: 'observed' });
        });
      } else {
        console.log('ParameterSpaceVisualizer: Unknown data format, first element:', dataArray[0]);
      }
    } else if ('successes' in data && 'trials' in data) {
      // Beta-binomial format
      console.log('ParameterSpaceVisualizer: Processing beta-binomial data');
      const rate = (data as any).successes / (data as any).trials;
      points.push({ x: 0, y: rate, type: 'conversion-rate' });
    } else {
      console.log('ParameterSpaceVisualizer: No recognized data format found');
    }
    
    console.log('ParameterSpaceVisualizer: Processed data points:', points.length);
    return points;
  }, [data, xVariable, yParameter]);
  
  // Generate posterior predictions
  const posteriorPredictions = useMemo(() => {
    if (dataPoints.length === 0) return null;
    
    try {
    
    // For compound posteriors
    const isCompound = 'frequency' in posterior && 'severity' in posterior;
    
    // Get x range
    const xMin = Math.min(...dataPoints.map(d => d.x));
    const xMax = Math.max(...dataPoints.map(d => d.x));
    
    // Handle single data point (like beta-binomial)
    let xValues: number[];
    if (xMin === xMax) {
      xValues = Array.from({ length: 50 }, (_, i) => xMin - 1 + 2 * i / 49);
    } else {
      xValues = Array.from({ length: 50 }, (_, i) => xMin + (xMax - xMin) * i / 49);
    }
    
    // Generate a single set of samples for all x values (much more efficient)
    const allSamples: number[] = [];
    for (let i = 0; i < nPosteriorSamples; i++) {
      if (isCompound) {
        if (yParameter === 'conversion') {
          allSamples.push(posterior.frequency.sample()[0]);
        } else if (yParameter === 'revenue') {
          const p = posterior.frequency.sample()[0];
          const v = posterior.severity.sample()[0];
          allSamples.push(p * v);
        } else if (yParameter === 'value') {
          allSamples.push(posterior.severity.sample()[0]);
        }
      } else {
        allSamples.push(posterior.sample()[0]);
      }
    }
    
    // Sort samples once
    allSamples.sort((a, b) => a - b);
    
    // Calculate statistics once
    const mean = allSamples.reduce((a, b) => a + b) / allSamples.length;
    const ci80Lower = allSamples[Math.floor(allSamples.length * 0.1)];
    const ci80Upper = allSamples[Math.floor(allSamples.length * 0.9)];
    const ci95Lower = allSamples[Math.floor(allSamples.length * 0.025)];
    const ci95Upper = allSamples[Math.floor(allSamples.length * 0.975)];
    
    // Create predictions (same for all x values since we're showing constant posterior)
    const predictions = xValues.map(x => ({
      x,
      mean,
      ci80: [ci80Lower, ci80Upper],
      ci95: [ci95Lower, ci95Upper],
      samples: showPosteriorDraws ? allSamples.slice(0, numPosteriorDraws) : []
    }));
    
    console.log('ParameterSpaceVisualizer: Generated predictions:', predictions.length, 'samples:', allSamples.length);
    setIsProcessing(false);
    return predictions;
    
    } catch (error) {
      console.error('Error generating posterior predictions:', error);
      setIsProcessing(false);
      return null;
    }
  }, [dataPoints, yParameter, nPosteriorSamples, showPosteriorDraws, numPosteriorDraws, 
      // Only depend on posterior identity, not the object itself
      posterior?.constructor?.name, 
      'frequency' in posterior, 
      'severity' in posterior]);
  
  // D3 Visualization
  useEffect(() => {
    if (!svgRef.current || !posteriorPredictions || dataPoints.length === 0) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
    
    // Scales
    const xExtent = d3.extent([...dataPoints.map(d => d.x), ...posteriorPredictions.map(p => p.x)]) as [number, number];
    const yExtent = d3.extent([
      ...dataPoints.map(d => d.y),
      ...posteriorPredictions.flatMap(p => [p.ci95[0], p.ci95[1]])
    ]) as [number, number];
    
    // Add padding to y-axis
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1;
    
    const xScale = d3.scaleLinear()
      .domain(xExtent)
      .range([0, chartWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([Math.max(0, yExtent[0] - yPadding), yExtent[1] + yPadding])
      .range([chartHeight, 0]);
    
    // Axes
    g.append("g")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale))
      .append("text")
      .attr("x", chartWidth / 2)
      .attr("y", 40)
      .attr("fill", "black")
      .style("text-anchor", "middle")
      .text(xLabel);
    
    g.append("g")
      .call(d3.axisLeft(yScale).tickFormat(d => formatValue(d as number)))
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -50)
      .attr("x", -chartHeight / 2)
      .attr("fill", "black")
      .style("text-anchor", "middle")
      .text(yLabel);
    
    // Title
    g.append("text")
      .attr("x", chartWidth / 2)
      .attr("y", -20)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .text(title);
    
    // Draw posterior draws (if enabled)
    if (showPosteriorDraws) {
      posteriorPredictions.forEach(pred => {
        pred.samples.forEach(sample => {
          g.append("line")
            .attr("x1", xScale(xExtent[0]))
            .attr("y1", yScale(sample))
            .attr("x2", xScale(xExtent[1]))
            .attr("y2", yScale(sample))
            .attr("stroke", colors.posteriorDraws)
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.1);
        });
      });
    }
    
    // Area generators for confidence intervals
    const area95 = d3.area<any>()
      .x(d => xScale(d.x))
      .y0(d => yScale(d.ci95[0]))
      .y1(d => yScale(d.ci95[1]))
      .curve(d3.curveMonotoneX);
    
    const area80 = d3.area<any>()
      .x(d => xScale(d.x))
      .y0(d => yScale(d.ci80[0]))
      .y1(d => yScale(d.ci80[1]))
      .curve(d3.curveMonotoneX);
    
    // Draw confidence intervals
    g.append("path")
      .datum(posteriorPredictions)
      .attr("fill", colors.ci95)
      .attr("opacity", 0.2)
      .attr("d", area95);
    
    g.append("path")
      .datum(posteriorPredictions)
      .attr("fill", colors.ci80)
      .attr("opacity", 0.3)
      .attr("d", area80);
    
    // Draw posterior mean line
    const line = d3.line<any>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.mean))
      .curve(d3.curveMonotoneX);
    
    g.append("path")
      .datum(posteriorPredictions)
      .attr("fill", "none")
      .attr("stroke", colors.posteriorMean)
      .attr("stroke-width", 3)
      .attr("d", line);
    
    // Draw data points
    g.selectAll(".data-point")
      .data(dataPoints)
      .enter()
      .append("circle")
      .attr("class", "data-point")
      .attr("cx", d => xScale(d.x))
      .attr("cy", d => yScale(d.y))
      .attr("r", 3)
      .attr("fill", colors.data)
      .attr("opacity", 0.6)
      .on("mouseover", function(event, d) {
        // Tooltip
        const tooltip = g.append("g")
          .attr("id", "tooltip");
        
        const rect = tooltip.append("rect")
          .attr("x", xScale(d.x) + 5)
          .attr("y", yScale(d.y) - 20)
          .attr("width", 100)
          .attr("height", 20)
          .attr("fill", "white")
          .attr("stroke", "black")
          .attr("stroke-width", 1)
          .attr("rx", 3);
        
        tooltip.append("text")
          .attr("x", xScale(d.x) + 10)
          .attr("y", yScale(d.y) - 5)
          .text(formatValue(d.y))
          .style("font-size", "12px");
      })
      .on("mouseout", function() {
        g.select("#tooltip").remove();
      });
    
    // Legend
    const legend = g.append("g")
      .attr("transform", `translate(${chartWidth - 150}, 20)`);
    
    const legendItems = [
      { label: "Observed Data", color: colors.data, type: "circle" },
      { label: "Posterior Mean", color: colors.posteriorMean, type: "line" },
      { label: "80% CI", color: colors.ci80, type: "rect" },
      { label: "95% CI", color: colors.ci95, type: "rect" }
    ];
    
    legendItems.forEach((item, i) => {
      const legendRow = legend.append("g")
        .attr("transform", `translate(0, ${i * 20})`);
      
      if (item.type === "circle") {
        legendRow.append("circle")
          .attr("r", 4)
          .attr("cx", 5)
          .attr("cy", 5)
          .attr("fill", item.color)
          .attr("opacity", 0.6);
      } else if (item.type === "line") {
        legendRow.append("line")
          .attr("x1", 0)
          .attr("y1", 5)
          .attr("x2", 10)
          .attr("y2", 5)
          .attr("stroke", item.color)
          .attr("stroke-width", 3);
      } else {
        legendRow.append("rect")
          .attr("width", 10)
          .attr("height", 10)
          .attr("fill", item.color)
          .attr("opacity", item.label.includes("80") ? 0.3 : 0.2);
      }
      
      legendRow.append("text")
        .attr("x", 15)
        .attr("y", 9)
        .text(item.label)
        .style("font-size", "12px");
    });
    
  }, [posteriorPredictions, dataPoints, width, height, margin, formatValue, xLabel, yLabel, title, colors, showPosteriorDraws]);
  
  if (isProcessing) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-600 animate-pulse">Generating posterior predictions...</div>
      </div>
    );
  }
  
  if (dataPoints.length === 0) {
    return (
      <div className="p-4 bg-yellow-50 text-yellow-800 rounded">
        <div className="font-semibold">No data to visualize</div>
        <div className="text-sm mt-1">Check that your data contains valid values for the selected parameter.</div>
      </div>
    );
  }
  
  return <svg ref={svgRef}></svg>;
}; 