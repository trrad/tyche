import React, { useEffect, useState, useMemo, useRef, useTransition } from 'react';
import * as d3 from 'd3';
import { Posterior } from '../../inference/base/types';
import { PosteriorProxy } from '../../workers/PosteriorProxy';

interface AsyncPPCVisualizerProps {
  observedData: number[];
  posterior: Posterior | any; // Allow PosteriorProxy
  nSamples?: number;
  nCISamples?: number;
  showCI?: boolean;
  ciLevels?: number[];
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  formatValue?: (v: number) => string;
  xLabel?: string;
  colors?: {
    observed: string;
    predicted: string;
    ci80: string;
    ci95: string;
  };
}

export const AsyncPPCVisualizer: React.FC<AsyncPPCVisualizerProps> = ({
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
    observed: '#FF6B6B',
    predicted: '#9B59B6',
    ci80: '#9B59B6',
    ci95: '#9B59B6'
  }
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [posteriorSamples, setPosteriorSamples] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isPending, startTransition] = useTransition();
  
  // Generate posterior samples
  useEffect(() => {
    let cancelled = false;
    
    const generateSamples = async () => {
      setLoading(true);
      setProgress(0);
      
      try {
        let samples: number[];
        if (posterior instanceof PosteriorProxy) {
          // Async proxy - use batching
          samples = await posterior.sample(nSamples);
        } else {
          // Sync posterior - generate all at once
          samples = posterior.sample(nSamples);
        }
        
        if (!cancelled) {
          setProgress(100);
          startTransition(() => {
            setPosteriorSamples(samples);
            setLoading(false);
          });
        }
      } catch (error) {
        console.error('AsyncPPCVisualizer: Failed to generate samples:', error);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    generateSamples();
    
    return () => {
      cancelled = true;
    };
  }, [posterior, nSamples]);
  
  // Compute statistics when samples are ready
  const stats = useMemo(() => {
    if (!posteriorSamples) return null;
    
    const sorted = [...posteriorSamples].sort((a, b) => a - b);
    const n = sorted.length;
    
    return {
      mean: d3.mean(sorted) || 0,
      median: d3.median(sorted) || 0,
      q1: d3.quantile(sorted, 0.25) || 0,
      q3: d3.quantile(sorted, 0.75) || 0,
      ci80: [
        d3.quantile(sorted, 0.1) || 0,
        d3.quantile(sorted, 0.9) || 0
      ],
      ci95: [
        d3.quantile(sorted, 0.025) || 0,
        d3.quantile(sorted, 0.975) || 0
      ]
    };
  }, [posteriorSamples]);
  
  // Render visualization
  useEffect(() => {
    if (!svgRef.current || !posteriorSamples || !stats) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    
    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, Math.max(...observedData, ...posteriorSamples)])
      .range([0, innerWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);
    
    // Create histogram for observed data
    const histogram = d3.histogram<number, number>()
      .domain(xScale.domain() as [number, number])
      .thresholds(xScale.ticks(20));
    
    const observedHistogram = histogram(observedData);
    const maxObservedCount = d3.max(observedHistogram, d => d?.length || 0) || 0;
    
    // Create histogram for posterior samples
    const posteriorHistogram = histogram(posteriorSamples);
    const maxPosteriorCount = d3.max(posteriorHistogram, d => d?.length || 0) || 0;
    const maxCount = Math.max(maxObservedCount, maxPosteriorCount);
    
    // Normalize counts to [0, 1]
    const normalizedObserved = observedHistogram.map(d => ({
      x0: d.x0,
      x1: d.x1,
      length: d.length,
      normalizedCount: (d?.length || 0) / maxCount
    }));
    
    const normalizedPosterior = posteriorHistogram.map(d => ({
      x0: d.x0,
      x1: d.x1,
      length: d.length,
      normalizedCount: (d?.length || 0) / maxCount
    }));
    
    // Create groups
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Add axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);
    
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis);
    
    g.append('g')
      .call(yAxis);
    
    // Add axis labels
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + margin.bottom - 10)
      .attr('text-anchor', 'middle')
      .text(xLabel);
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -margin.left + 20)
      .attr('text-anchor', 'middle')
      .text('Density');
    
    // Draw posterior histogram
    g.selectAll('.posterior-bar')
      .data(normalizedPosterior)
      .enter()
      .append('rect')
      .attr('class', 'posterior-bar')
      .attr('x', d => xScale(d.x0 || 0))
      .attr('y', d => yScale(d.normalizedCount))
      .attr('width', d => xScale(d.x1 || 0) - xScale(d.x0 || 0))
      .attr('height', d => innerHeight - yScale(d.normalizedCount))
      .attr('fill', colors.predicted)
      .attr('opacity', 0.3);
    
    // Draw observed data as points
    g.selectAll('.observed-point')
      .data(observedData)
      .enter()
      .append('circle')
      .attr('class', 'observed-point')
      .attr('cx', d => xScale(d))
      .attr('cy', innerHeight + 10)
      .attr('r', 3)
      .attr('fill', colors.observed);
    
    // Add confidence intervals if requested
    if (showCI && stats) {
      // 80% CI
      g.append('rect')
        .attr('x', xScale(stats.ci80[0]))
        .attr('y', 0)
        .attr('width', xScale(stats.ci80[1]) - xScale(stats.ci80[0]))
        .attr('height', innerHeight)
        .attr('fill', colors.ci80)
        .attr('opacity', 0.1);
      
      // 95% CI
      g.append('rect')
        .attr('x', xScale(stats.ci95[0]))
        .attr('y', 0)
        .attr('width', xScale(stats.ci95[1]) - xScale(stats.ci95[0]))
        .attr('height', innerHeight)
        .attr('fill', colors.ci95)
        .attr('opacity', 0.05);
      
      // Add mean line
      g.append('line')
        .attr('x1', xScale(stats.mean))
        .attr('x2', xScale(stats.mean))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', colors.predicted)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5');
    }
    
  }, [posteriorSamples, stats, observedData, width, height, margin, colors, showCI]);
  
  if (loading || isPending) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width, height }}>
        <div className="text-gray-600 mb-2">Generating posterior predictive samples...</div>
        <div className="w-64 bg-gray-200 rounded-full h-2">
          <div 
            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }
  
  if (!posteriorSamples) {
    return <div className="text-red-600">Failed to generate samples</div>;
  }
  
  return (
    <svg ref={svgRef} width={width} height={height}>
      {/* Visualization is rendered via D3 in useEffect */}
    </svg>
  );
}; 