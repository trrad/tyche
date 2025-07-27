import React, { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import { Posterior } from '../../inference/base/types';
import { PosteriorProxy } from '../../workers/PosteriorProxy';

interface AsyncPPCVisualizerProps {
  observedData: number[];
  posterior: Posterior | PosteriorProxy;
  nSamples?: number;
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

type VisualizationState = 'idle' | 'loading' | 'ready' | 'error';

export const AsyncPPCVisualizer: React.FC<AsyncPPCVisualizerProps> = ({
  observedData,
  posterior,
  nSamples = 5000,
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
  const [state, setState] = useState<VisualizationState>('idle');
  const [posteriorSamples, setPosteriorSamples] = useState<number[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const previousPosteriorRef = useRef<any>(null);
  const generationIdRef = useRef(0);
  
  // Generate posterior samples
  useEffect(() => {
    if (posterior === previousPosteriorRef.current) {
      return;
    }
    
    previousPosteriorRef.current = posterior;
    
    if (!posterior) {
      setState('idle');
      return;
    }
    
    const newGenerationId = ++generationIdRef.current;
    
    Promise.resolve().then(async () => {
      setState('loading');
      setProgress(0);
      
      try {
        let samples: number[];
        
        if (posterior instanceof PosteriorProxy || (posterior as any).sample.constructor.name === 'AsyncFunction') {
          // Async posterior - use batched sampling for large counts
          samples = [];
          const batchSize = 1000;
          const batches = Math.ceil(nSamples / batchSize);
          
          for (let i = 0; i < batches; i++) {
            if (newGenerationId !== generationIdRef.current) return;
            
            const currentBatchSize = Math.min(batchSize, nSamples - i * batchSize);
            const batch = await posterior.sample(currentBatchSize);
            samples.push(...(Array.isArray(batch) ? batch : [batch]));
            
            setProgress(((i + 1) / batches) * 100);
          }
        } else {
          // Sync posterior - fallback
          samples = [];
          for (let i = 0; i < nSamples; i++) {
            samples.push(posterior.sample()[0]);
            if (i % 100 === 0) {
              setProgress((i / nSamples) * 100);
            }
          }
        }
        
        if (newGenerationId === generationIdRef.current) {
          setPosteriorSamples(samples);
          setState('ready');
        }
      } catch (err) {
        if (newGenerationId === generationIdRef.current) {
          console.error('Failed to generate samples:', err);
          setError(err instanceof Error ? err.message : 'Unknown error');
          setState('error');
        }
      }
    });
  }, [posterior, nSamples]);
  
  // Visualization rendering effect
  useEffect(() => {
    if (state !== 'ready' || !posteriorSamples || !svgRef.current) return;
    
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
    if (showCI && posteriorSamples) {
      const sorted = [...posteriorSamples].sort((a, b) => a - b);
      const q25 = d3.quantile(sorted, 0.25) || 0;
      const q75 = d3.quantile(sorted, 0.75) || 0;
      const mean = d3.mean(sorted) || 0;
      
      // 80% CI
      g.append('rect')
        .attr('x', xScale(q25))
        .attr('y', 0)
        .attr('width', xScale(q75) - xScale(q25))
        .attr('height', innerHeight)
        .attr('fill', colors.ci80)
        .attr('opacity', 0.1);
      
      // 95% CI
      g.append('rect')
        .attr('x', xScale(q25 - (q75 - q25) * 0.025)) // Adjust for 95% CI
        .attr('y', 0)
        .attr('width', xScale(q75 + (q75 - q25) * 0.025) - xScale(q25 - (q75 - q25) * 0.025)) // Adjust for 95% CI
        .attr('height', innerHeight)
        .attr('fill', colors.ci95)
        .attr('opacity', 0.05);
      
      // Add mean line
      g.append('line')
        .attr('x1', xScale(mean))
        .attr('x2', xScale(mean))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', colors.predicted)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5');
    }
  }, [state, posteriorSamples, observedData, showCI, ciLevels, width, height, margin, formatValue, xLabel, colors]);
  
  // Render based on state
  switch (state) {
    case 'idle':
      return (
        <div style={{ width, height }} className="flex items-center justify-center text-gray-500">
          Waiting for posterior...
        </div>
      );
      
    case 'loading':
      return (
        <div style={{ width, height }} className="flex flex-col items-center justify-center">
          <div className="text-gray-600 mb-2">Generating posterior predictive samples...</div>
          <div className="w-64 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      );
      
    case 'error':
      return (
        <div style={{ width, height }} className="flex items-center justify-center text-red-600">
          Error: {error}
        </div>
      );
      
    case 'ready':
      return <svg ref={svgRef} width={width} height={height} />;
  }
}; 