// src/components/UpliftGraphD3.ts
import * as d3 from 'd3';
import { beta } from '../core/distributions/Beta';

interface UpliftData {
  value: number;
  density: number;
}

export class UpliftGraphD3 {
  private svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private width = 600;
  private height = 400;
  private margin = { top: 40, right: 40, bottom: 60, left: 60 };
  private plotWidth: number;
  private plotHeight: number;
  
  constructor(containerId: string) {
    const container = d3.select(`#${containerId}`);
    
    this.plotWidth = this.width - this.margin.left - this.margin.right;
    this.plotHeight = this.height - this.margin.top - this.margin.bottom;
    
    // Create SVG
    this.svg = container
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height);
    
    // Create main group for plot area
    this.svg.append('g')
      .attr('class', 'plot-area')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
    
    // Add title
    this.svg.append('text')
      .attr('class', 'title')
      .attr('x', this.width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .text('Relative Uplift Distribution');
    
    // Add axis labels
    this.svg.append('text')
      .attr('class', 'x-label')
      .attr('x', this.width / 2)
      .attr('y', this.height - 10)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .text('Relative Uplift (%)');
    
    this.svg.append('text')
      .attr('class', 'y-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -this.height / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .text('Density');
  }
  
  /**
   * Generate uplift samples and compute kernel density estimate
   */
  private generateUpliftData(
    controlConversions: number,
    controlTotal: number,
    treatmentConversions: number,
    treatmentTotal: number,
    nSamples: number = 10000
  ): {
    samples: number[],
    density: UpliftData[],
    median: number,
    ci95: [number, number],
    probPositive: number
  } {
    // Create posterior distributions
    const controlDist = beta(1 + controlConversions, 1 + controlTotal - controlConversions);
    const treatmentDist = beta(1 + treatmentConversions, 1 + treatmentTotal - treatmentConversions);
    
    // Generate uplift samples
    const samples: number[] = [];
    let positiveCount = 0;
    const rng = () => Math.random();
    
    for (let i = 0; i < nSamples; i++) {
      const controlRate = controlDist.sample(rng);
      const treatmentRate = treatmentDist.sample(rng);
      
      if (treatmentRate > controlRate) {
        positiveCount++;
      }
      
      // Calculate relative uplift as percentage
      if (controlRate > 0) {
        const uplift = ((treatmentRate - controlRate) / controlRate) * 100;
        samples.push(uplift);
      }
    }
    
    // Sort for percentiles
    samples.sort((a, b) => a - b);
    
    // Calculate statistics
    const median = d3.median(samples) || 0;
    const ci95: [number, number] = [
      d3.quantile(samples, 0.025) || 0,
      d3.quantile(samples, 0.975) || 0
    ];
    const probPositive = positiveCount / nSamples;
    
    // Create kernel density estimate for smooth curve
    const kde = this.kernelDensityEstimator(
      this.kernelEpanechnikov(7), // bandwidth
      d3.range(d3.min(samples)! - 10, d3.max(samples)! + 10, 1)
    );
    
    const density = kde(samples);
    
    return { samples, density, median, ci95, probPositive };
  }
  
  /**
   * Kernel density estimator
   */
  private kernelDensityEstimator(kernel: (v: number) => number, X: number[]) {
    return (V: number[]) => {
      return X.map(x => ({
        value: x,
        density: d3.mean(V, v => kernel(x - v)) || 0
      }));
    };
  }
  
  /**
   * Epanechnikov kernel function
   */
  private kernelEpanechnikov(k: number) {
    return (v: number) => {
      return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    };
  }
  
  /**
   * Update the visualization with new data
   */
  update(
    controlConversions: number,
    controlTotal: number,
    treatmentConversions: number,
    treatmentTotal: number
  ) {
    const data = this.generateUpliftData(
      controlConversions,
      controlTotal,
      treatmentConversions,
      treatmentTotal
    );
    
    const plotArea = this.svg.select('.plot-area');
    
    // Clear previous content
    plotArea.selectAll('*').remove();
    
    // Set up scales
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data.density, d => d.value) as [number, number])
      .range([0, this.plotWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data.density, d => d.density) as number])
      .range([this.plotHeight, 0]);
    
    // Create area generator
    const area = d3.area<UpliftData>()
      .x(d => xScale(d.value))
      .y0(this.plotHeight)
      .y1(d => yScale(d.density))
      .curve(d3.curveMonotoneX);
    
    // Add gradient definition for fill
    const gradient = plotArea.append('defs')
      .append('linearGradient')
      .attr('id', 'uplift-gradient')
      .attr('x1', '0%')
      .attr('x2', '100%');
    
    gradient.append('stop')
      .attr('offset', '0%')
      .style('stop-color', data.median < 0 ? '#ef4444' : '#3b82f6')
      .style('stop-opacity', 0.1);
    
    gradient.append('stop')
      .attr('offset', '50%')
      .style('stop-color', data.median < 0 ? '#ef4444' : '#3b82f6')
      .style('stop-opacity', 0.6);
    
    gradient.append('stop')
      .attr('offset', '100%')
      .style('stop-color', data.median < 0 ? '#ef4444' : '#3b82f6')
      .style('stop-opacity', 0.1);
    
    // Draw the distribution
    plotArea.append('path')
      .datum(data.density)
      .attr('class', 'distribution')
      .attr('d', area)
      .style('fill', 'url(#uplift-gradient)')
      .style('stroke', data.median < 0 ? '#ef4444' : '#3b82f6')
      .style('stroke-width', 2);
    
    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => d + '%');
    
    const yAxis = d3.axisLeft(yScale)
      .ticks(5);
    
    plotArea.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${this.plotHeight})`)
      .call(xAxis);
    
    plotArea.append('g')
      .attr('class', 'y-axis')
      .call(yAxis);
    
    // Add zero line
    plotArea.append('line')
      .attr('class', 'zero-line')
      .attr('x1', xScale(0))
      .attr('x2', xScale(0))
      .attr('y1', 0)
      .attr('y2', this.plotHeight)
      .style('stroke', '#6b7280')
      .style('stroke-width', 2)
      .style('stroke-dasharray', '5,5');
    
    // Add median line
    plotArea.append('line')
      .attr('class', 'median-line')
      .attr('x1', xScale(data.median))
      .attr('x2', xScale(data.median))
      .attr('y1', 0)
      .attr('y2', this.plotHeight)
      .style('stroke', '#10b981')
      .style('stroke-width', 3);
    
    // Add CI shading
    plotArea.append('rect')
      .attr('class', 'ci-rect')
      .attr('x', xScale(data.ci95[0]))
      .attr('y', 0)
      .attr('width', xScale(data.ci95[1]) - xScale(data.ci95[0]))
      .attr('height', this.plotHeight)
      .style('fill', '#6366f1')
      .style('opacity', 0.1);
    
    // Add stats box
    const statsGroup = plotArea.append('g')
      .attr('class', 'stats')
      .attr('transform', `translate(${this.plotWidth - 180}, 20)`);
    
    statsGroup.append('rect')
      .attr('width', 170)
      .attr('height', 90)
      .style('fill', 'white')
      .style('stroke', '#e5e7eb')
      .style('stroke-width', 1);
    
    const stats = [
      { label: 'Median:', value: `${data.median.toFixed(1)}%` },
      { label: '95% CI:', value: `[${data.ci95[0].toFixed(1)}%, ${data.ci95[1].toFixed(1)}%]` },
      { label: 'P(uplift > 0):', value: `${(data.probPositive * 100).toFixed(1)}%` }
    ];
    
    statsGroup.selectAll('text')
      .data(stats)
      .enter()
      .append('text')
      .attr('x', 10)
      .attr('y', (d, i) => 25 + i * 22)
      .style('font-size', '12px')
      .text(d => `${d.label} ${d.value}`);
    
    // Add hover interactivity (for future enhancement)
    plotArea.append('rect')
      .attr('class', 'overlay')
      .attr('width', this.plotWidth)
      .attr('height', this.plotHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .on('mousemove', (event) => {
        // Placeholder for future hover interactions
        const [x, y] = d3.pointer(event);
        const upliftValue = xScale.invert(x);
        // Could add tooltip here
      });
  }
}

// Add to your HTML:
// <script src="https://d3js.org/d3.v7.min.js"></script>

// Usage:
// const graph = new UpliftGraphD3('container-id');
// graph.update(controlConv, controlTotal, treatmentConv, treatmentTotal);