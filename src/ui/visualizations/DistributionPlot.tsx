// src/visualizations/DistributionPlot.tsx
import React, { useMemo } from 'react';
import { scaleLinear } from 'd3-scale';

export interface DistributionPlotProps {
  samples: number[];
  width?: number;
  height?: number;
  bins?: number;
  color?: string;
  label?: string;
  credibleLevel?: number;
  showMean?: boolean;
  showMedian?: boolean;
  showCredibleInterval?: boolean;
  isCurrency?: boolean; // Add this prop to format as currency
}

interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
  density: number;
}

// Utility functions extracted from combined-demo
const createHistogram = (samples: number[], numBins: number = 30): HistogramBin[] => {
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const binWidth = (max - min) / numBins;
  
  // Initialize bins
  const bins: HistogramBin[] = Array(numBins).fill(0).map((_, i) => ({
    x0: min + i * binWidth,
    x1: min + (i + 1) * binWidth,
    count: 0,
    density: 0
  }));
  
  // Count samples in each bin
  samples.forEach(value => {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), numBins - 1);
    if (binIndex >= 0 && binIndex < numBins) {
      bins[binIndex].count++;
    }
  });
  
  // Convert to density
  const totalArea = samples.length * binWidth;
  bins.forEach(bin => {
    bin.density = bin.count / totalArea;
  });
  
  return bins;
};

const getCredibleInterval = (samples: number[], level: number = 0.95) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const lowerIdx = Math.floor(alpha * samples.length);
  const upperIdx = Math.floor((1 - alpha) * samples.length);
  
  return {
    lower: sorted[lowerIdx],
    upper: sorted[upperIdx],
    median: sorted[Math.floor(samples.length / 2)],
    mean: samples.reduce((a, b) => a + b) / samples.length
  };
};

export const DistributionPlot: React.FC<DistributionPlotProps> = ({
  samples,
  width = 400,
  height = 200,
  bins = 30,
  color = '#FF6B6B', // Zenith Data coral
  label,
  credibleLevel = 0.95,
  showMean = true,
  showMedian = false,
  showCredibleInterval = true
}) => {
  const margin = { top: 20, right: 20, bottom: 40, left: 40 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  
  // Compute histogram and statistics
  const { histogram, stats } = useMemo(() => {
    const hist = createHistogram(samples, bins);
    const interval = getCredibleInterval(samples, credibleLevel);
    return { histogram: hist, stats: interval };
  }, [samples, bins, credibleLevel]);
  
  // Create scales
  const xScale = useMemo(() => {
    const extent = [
      Math.min(...histogram.map(d => d.x0)),
      Math.max(...histogram.map(d => d.x1))
    ];
    return scaleLinear()
      .domain(extent)
      .range([0, innerWidth])
      .nice();
  }, [histogram, innerWidth]);
  
  const yScale = useMemo(() => {
    const maxDensity = Math.max(...histogram.map(d => d.density));
    return scaleLinear()
      .domain([0, maxDensity * 1.1])
      .range([innerHeight, 0]);
  }, [histogram, innerHeight]);
  
  return (
    <div className="distribution-plot">
      {label && <h4 className="text-sm font-semibold mb-2">{label}</h4>}
      <svg width={width} height={height}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Histogram bars */}
          {histogram.map((bin, i) => (
            <rect
              key={i}
              x={xScale(bin.x0)}
              y={yScale(bin.density)}
              width={xScale(bin.x1) - xScale(bin.x0) - 1}
              height={innerHeight - yScale(bin.density)}
              fill={color}
              fillOpacity={0.7}
            />
          ))}
          
          {/* Credible interval */}
          {showCredibleInterval && (
            <g>
              <rect
                x={xScale(stats.lower)}
                y={0}
                width={xScale(stats.upper) - xScale(stats.lower)}
                height={innerHeight}
                fill={color}
                fillOpacity={0.1}
                stroke={color}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <text
                x={xScale(stats.lower)}
                y={innerHeight + 15}
                fontSize={10}
                textAnchor="middle"
                fill="#666"
              >
                {stats.lower.toFixed(3)}
              </text>
              <text
                x={xScale(stats.upper)}
                y={innerHeight + 15}
                fontSize={10}
                textAnchor="middle"
                fill="#666"
              >
                {stats.upper.toFixed(3)}
              </text>
            </g>
          )}
          
          {/* Mean line */}
          {showMean && (
            <line
              x1={xScale(stats.mean)}
              x2={xScale(stats.mean)}
              y1={0}
              y2={innerHeight}
              stroke="#E11D48"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          )}
          
          {/* Median line */}
          {showMedian && (
            <line
              x1={xScale(stats.median)}
              x2={xScale(stats.median)}
              y1={0}
              y2={innerHeight}
              stroke="#10B981"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          )}
          
          {/* X axis */}
          <line
            x1={0}
            x2={innerWidth}
            y1={innerHeight}
            y2={innerHeight}
            stroke="#E5E7EB"
          />
          
          {/* Y axis */}
          <line
            x1={0}
            x2={0}
            y1={0}
            y2={innerHeight}
            stroke="#E5E7EB"
          />
        </g>
      </svg>
      
      {/* Legend */}
      <div className="flex gap-4 mt-2 text-xs">
        {showMean && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-red-500"></div>
            <span>Mean: {stats.mean.toFixed(3)}</span>
          </div>
        )}
        {showMedian && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-green-500"></div>
            <span>Median: {stats.median.toFixed(3)}</span>
          </div>
        )}
        {showCredibleInterval && (
          <div className="flex items-center gap-1">
            <div className="w-4 h-2 bg-blue-500 opacity-20 border border-blue-500"></div>
            <span>{(credibleLevel * 100).toFixed(0)}% CI</span>
          </div>
        )}
      </div>
    </div>
  );
};