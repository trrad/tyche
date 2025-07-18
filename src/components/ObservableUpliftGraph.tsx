import React, { useRef, useEffect, useState } from 'react';
import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';
import { beta } from '../core/distributions/Beta';

interface UpliftGraphProps {
  controlConversions: number;
  controlTotal: number;
  treatmentConversions: number;
  treatmentTotal: number;
  iterations?: number;
  credibleLevel?: number;
}

/**
 * Interactive uplift distribution graph using Observable Plot
 * Shows:
 * - Full uplift distribution
 * - Credible interval
 * - Probability of improvement
 * - Interactive hover details
 */
export function ObservableUpliftGraph({
  controlConversions,
  controlTotal,
  treatmentConversions,
  treatmentTotal,
  iterations = 10000,
  credibleLevel = 0.95
}: UpliftGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const [selectedRange, setSelectedRange] = useState<[number, number] | null>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Generate uplift samples
    const controlDist = beta(1 + controlConversions, 1 + controlTotal - controlConversions);
    const treatmentDist = beta(1 + treatmentConversions, 1 + treatmentTotal - treatmentConversions);
    
    const upliftSamples = [];
    for (let i = 0; i < iterations; i++) {
      const controlSample = controlDist.sample();
      const treatmentSample = treatmentDist.sample();
      const uplift = controlSample > 0 ? (treatmentSample - controlSample) / controlSample : 0;
      upliftSamples.push(uplift);
    }
    
    // Calculate statistics
    upliftSamples.sort((a, b) => a - b);
    const probImprovement = upliftSamples.filter(x => x > 0).length / iterations;
    const expectedUplift = d3.mean(upliftSamples) || 0;
    const lowerBound = upliftSamples[Math.floor((1 - credibleLevel) / 2 * iterations)];
    const upperBound = upliftSamples[Math.floor((1 + credibleLevel) / 2 * iterations)];
    
    // Create binned data for histogram
    const bins = d3.bin()
      .domain([-1, 2])
      .thresholds(60)(upliftSamples);
    
    const histogramData = bins.map(bin => ({
      x0: bin.x0!,
      x1: bin.x1!,
      count: bin.length,
      density: bin.length / iterations / (bin.x1! - bin.x0!),
      inCredibleInterval: bin.x0! >= lowerBound && bin.x1! <= upperBound,
      isPositive: bin.x0! >= 0
    }));
    
    // Main plot
    const plot = Plot.plot({
      width: 800,
      height: 400,
      marginBottom: 60,
      style: {
        fontSize: "14px",
        fontFamily: "system-ui"
      },
      x: {
        label: "Relative Uplift →",
        tickFormat: "+.0%",
        domain: [-0.5, 1.5]
      },
      y: {
        label: "↑ Density",
        grid: true
      },
      marks: [
        // Histogram bars
        Plot.rect(histogramData, {
          x1: "x0",
          x2: "x1",
          y1: 0,
          y2: "density",
          fill: d => d.isPositive ? "#10b981" : "#ef4444",
          fillOpacity: d => d.inCredibleInterval ? 0.8 : 0.3,
          stroke: "#1f2937",
          strokeWidth: 0.5,
          title: d => `${(d.x0 * 100).toFixed(1)}% to ${(d.x1 * 100).toFixed(1)}%\nCount: ${d.count}`
        }),
        
        // Zero line
        Plot.ruleX([0], {
          stroke: "#1f2937",
          strokeWidth: 2,
          strokeDasharray: "4,4"
        }),
        
        // Expected value line
        Plot.ruleX([expectedUplift], {
          stroke: "#3b82f6",
          strokeWidth: 3,
          strokeOpacity: 0.8
        }),
        
        // Credible interval
        Plot.ruleX([lowerBound, upperBound], {
          stroke: "#6366f1",
          strokeWidth: 2,
          strokeDasharray: "8,4"
        }),
        
        // Labels
        Plot.text([
          {
            x: expectedUplift,
            y: d3.max(histogramData, d => d.density)! * 0.9,
            text: `Expected: ${(expectedUplift * 100).toFixed(1)}%`,
            textAnchor: "middle",
            dy: -10,
            fill: "#3b82f6",
            fontSize: 14,
            fontWeight: "bold"
          },
          {
            x: 0.75,
            y: d3.max(histogramData, d => d.density)! * 0.7,
            text: `P(improvement) = ${(probImprovement * 100).toFixed(1)}%`,
            textAnchor: "middle",
            fill: "#10b981",
            fontSize: 16,
            fontWeight: "bold"
          }
        ]),
        
        // Annotation for credible interval
        Plot.link([{
          x1: lowerBound,
          y1: 0,
          x2: upperBound,
          y2: 0
        }], {
          x1: "x1",
          y1: "y1",
          x2: "x2",
          y2: "y2",
          stroke: "#6366f1",
          strokeWidth: 4,
          strokeOpacity: 0.5,
          markerEnd: "arrow"
        })
      ]
    });
    
    // Clear and append plot
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(plot);
    
    // Add summary stats below
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'mt-4 grid grid-cols-3 gap-4 text-center';
    summaryDiv.innerHTML = `
      <div class="bg-gray-50 p-3 rounded">
        <div class="text-2xl font-bold ${probImprovement > 0.5 ? 'text-green-600' : 'text-red-600'}">
          ${(probImprovement * 100).toFixed(1)}%
        </div>
        <div class="text-sm text-gray-600">Probability of Improvement</div>
      </div>
      <div class="bg-gray-50 p-3 rounded">
        <div class="text-2xl font-bold text-blue-600">
          ${(expectedUplift * 100).toFixed(1)}%
        </div>
        <div class="text-sm text-gray-600">Expected Uplift</div>
      </div>
      <div class="bg-gray-50 p-3 rounded">
        <div class="text-2xl font-bold text-indigo-600">
          [${(lowerBound * 100).toFixed(1)}%, ${(upperBound * 100).toFixed(1)}%]
        </div>
        <div class="text-sm text-gray-600">${(credibleLevel * 100)}% Credible Interval</div>
      </div>
    `;
    containerRef.current.appendChild(summaryDiv);
    
  }, [controlConversions, controlTotal, treatmentConversions, treatmentTotal, iterations, credibleLevel]);
  
  return (
    <div className="w-full">
      <div ref={containerRef}></div>
      
      {/* Interactive Controls */}
      <div className="mt-6 bg-gray-50 p-4 rounded">
        <h4 className="font-semibold mb-3">Analysis Options</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Credible Level: {(credibleLevel * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0.5"
              max="0.99"
              step="0.01"
              value={credibleLevel}
              onChange={(e) => {
                // This would trigger a re-render with new credible level
                // In practice, you'd lift this state up
              }}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Simulation Iterations: {iterations.toLocaleString()}
            </label>
            <input
              type="range"
              min="1000"
              max="50000"
              step="1000"
              value={iterations}
              onChange={(e) => {
                // This would trigger a re-render with new iterations
                // In practice, you'd lift this state up
              }}
              className="w-full"
            />
          </div>
        </div>
      </div>
      
      {/* Interpretation Guide */}
      <div className="mt-4 bg-blue-50 p-4 rounded">
        <h4 className="font-semibold text-blue-900 mb-2">How to Interpret This Graph</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <span className="text-green-600 font-semibold">Green bars</span> show positive uplift (treatment wins)</li>
          <li>• <span className="text-red-600 font-semibold">Red bars</span> show negative uplift (control wins)</li>
          <li>• <span className="text-indigo-600 font-semibold">Dashed lines</span> mark the credible interval bounds</li>
          <li>• <span className="text-blue-600 font-semibold">Blue line</span> shows the expected (mean) uplift</li>
          <li>• Higher bars mean more likely outcomes</li>
        </ul>
      </div>
    </div>
  );
}