// src/visualizations/UpliftGraph.tsx
import React, { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';

interface UpliftGraphProps {
  controlSamples: number[];
  treatmentSamples: number[];
  width?: number;
  height?: number;
  credibleLevel?: number;
  title?: string;
  showDensity?: boolean;
  bins?: number;
}

interface UpliftResult {
  upliftSamples: number[];
  stats: {
    mean: number;
    median: number;
    lower: number;
    upper: number;
    probPositive: number;
  };
}

export const UpliftGraph: React.FC<UpliftGraphProps> = ({
  controlSamples,
  treatmentSamples,
  width = 400,
  height = 250,
  credibleLevel = 0.95,
  title = "Relative Uplift",
  showDensity = true,
  bins = 40
}) => {
  const margin = { top: 40, right: 40, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  
  // Calculate uplift samples and statistics
  const upliftData: UpliftResult = useMemo(() => {
    // Ensure equal sample sizes
    const sampleSize = Math.min(controlSamples.length, treatmentSamples.length);
    
    // Calculate relative uplift for each pair of samples
    const upliftSamples = [];
    for (let i = 0; i < sampleSize; i++) {
      const control = controlSamples[i];
      const treatment = treatmentSamples[i];
      if (control > 0) { // Avoid division by zero
        upliftSamples.push((treatment - control) / control);
      }
    }
    
    // Sort for quantile calculations
    const sorted = [...upliftSamples].sort((a, b) => a - b);
    const alpha = (1 - credibleLevel) / 2;
    const lowerIdx = Math.floor(alpha * sorted.length);
    const upperIdx = Math.floor((1 - alpha) * sorted.length);
    
    return {
      upliftSamples,
      stats: {
        mean: upliftSamples.reduce((a, b) => a + b, 0) / upliftSamples.length,
        median: sorted[Math.floor(sorted.length / 2)],
        lower: sorted[lowerIdx],
        upper: sorted[upperIdx],
        probPositive: upliftSamples.filter(x => x > 0).length / upliftSamples.length
      }
    };
  }, [controlSamples, treatmentSamples, credibleLevel]);
  
  // Create histogram for density plot
  const histogram = useMemo(() => {
    if (!showDensity) return [];
    
    const { upliftSamples } = upliftData;
    const min = Math.min(...upliftSamples);
    const max = Math.max(...upliftSamples);
    const binWidth = (max - min) / bins;
    
    const hist = Array(bins).fill(0).map((_, i) => ({
      x: min + i * binWidth + binWidth / 2,
      count: 0,
      density: 0
    }));
    
    upliftSamples.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      if (binIndex >= 0) hist[binIndex].count++;
    });
    
    const totalArea = upliftSamples.length * binWidth;
    hist.forEach(bin => {
      bin.density = bin.count / totalArea;
    });
    
    return hist;
  }, [upliftData, bins, showDensity]);
  
  // Create scales
  const xScale = useMemo(() => {
    const { stats } = upliftData;
    const padding = Math.abs(stats.upper - stats.lower) * 0.2;
    const domain = [
      Math.min(stats.lower - padding, -0.1),
      Math.max(stats.upper + padding, 0.1)
    ];
    return scaleLinear().domain(domain).range([0, innerWidth]);
  }, [upliftData, innerWidth]);
  
  const yScale = useMemo(() => {
    if (!showDensity || histogram.length === 0) {
      return scaleLinear().domain([0, 1]).range([innerHeight, 0]);
    }
    const maxDensity = Math.max(...histogram.map(d => d.density));
    return scaleLinear()
      .domain([0, maxDensity * 1.2])
      .range([innerHeight, 0]);
  }, [histogram, innerHeight, showDensity]);
  
  // Format percentage
  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  
  return (
    <div className="uplift-graph">
      <svg width={width} height={height}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Title */}
          <text
            x={innerWidth / 2}
            y={-20}
            textAnchor="middle"
            className="text-sm font-semibold"
          >
            {title}
          </text>
          
          {/* Density plot */}
          {showDensity && histogram.map((bin, i) => (
            <rect
              key={i}
              x={xScale(bin.x - (histogram[1]?.x - histogram[0]?.x || 0) / 2)}
              y={yScale(bin.density)}
              width={Math.max(1, (innerWidth / bins) - 1)}
              height={innerHeight - yScale(bin.density)}
              fill="#3B82F6"
              fillOpacity={0.6}
            />
          ))}
          
          {/* Zero line */}
          <line
            x1={xScale(0)}
            x2={xScale(0)}
            y1={0}
            y2={innerHeight}
            stroke="#6B7280"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          
          {/* Credible interval */}
          <g>
            <rect
              x={xScale(upliftData.stats.lower)}
              y={innerHeight * 0.4}
              width={xScale(upliftData.stats.upper) - xScale(upliftData.stats.lower)}
              height={innerHeight * 0.2}
              fill="#10B981"
              fillOpacity={0.2}
              stroke="#10B981"
              strokeWidth={2}
            />
            <line
              x1={xScale(upliftData.stats.mean)}
              x2={xScale(upliftData.stats.mean)}
              y1={innerHeight * 0.3}
              y2={innerHeight * 0.7}
              stroke="#DC2626"
              strokeWidth={3}
            />
          </g>
          
          {/* X axis */}
          <g transform={`translate(0,${innerHeight})`}>
            <line x1={0} x2={innerWidth} y1={0} y2={0} stroke="#E5E7EB" />
            {xScale.ticks(5).map(tick => (
              <g key={tick} transform={`translate(${xScale(tick)},0)`}>
                <line y1={0} y2={5} stroke="#E5E7EB" />
                <text
                  y={20}
                  textAnchor="middle"
                  className="text-xs fill-gray-600"
                >
                  {formatPercent(tick)}
                </text>
              </g>
            ))}
            <text
              x={innerWidth / 2}
              y={40}
              textAnchor="middle"
              className="text-sm fill-gray-700"
            >
              Relative Uplift
            </text>
          </g>
          
          {/* Y axis label */}
          {showDensity && (
            <text
              transform={`translate(-40,${innerHeight / 2}) rotate(-90)`}
              textAnchor="middle"
              className="text-sm fill-gray-700"
            >
              Density
            </text>
          )}
        </g>
      </svg>
      
      {/* Summary statistics */}
      <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-gray-600">Mean Uplift:</span>
            <span className="ml-2 font-semibold">{formatPercent(upliftData.stats.mean)}</span>
          </div>
          <div>
            <span className="text-gray-600">P(Improvement):</span>
            <span className="ml-2 font-semibold text-green-600">
              {formatPercent(upliftData.stats.probPositive)}
            </span>
          </div>
          <div className="col-span-2">
            <span className="text-gray-600">{formatPercent(credibleLevel)} CI:</span>
            <span className="ml-2 font-semibold">
              [{formatPercent(upliftData.stats.lower)}, {formatPercent(upliftData.stats.upper)}]
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};