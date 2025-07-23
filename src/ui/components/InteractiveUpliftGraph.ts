// src/components/InteractiveUpliftGraph.ts
import * as d3 from 'd3';
import { beta } from '../../core/distributions/Beta';
import { RNG } from '../../core/utils/math/random';

interface UpliftStats {
  samples: number[];
  median: number;
  mean: number;
  ci: [number, number];
  ciLevel: number;
  probPositive: number;
}

export class InteractiveUpliftGraph {
  private svg!: d3.Selection<SVGSVGElement, unknown, HTMLElement, any>;
  private margin = { top: 50, right: 40, bottom: 60, left: 60 };
  private width = 700;
  private height = 400;
  private innerWidth: number;
  private innerHeight: number;
  
  // State
  private currentCILevel = 0.95;
  private currentStats: UpliftStats | null = null;
  
  // Selections for updates
  private plotArea!: d3.Selection<SVGGElement, unknown, HTMLElement, any>;
  private tooltip!: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
  
  constructor(containerId: string) {
    this.innerWidth = this.width - this.margin.left - this.margin.right;
    this.innerHeight = this.height - this.margin.top - this.margin.bottom;
    
    this.setupSVG(containerId);
    this.setupTooltip();
    this.setupControls(containerId);
  }
  
  private setupSVG(containerId: string) {
    const container = d3.select(`#${containerId}`);
    
    this.svg = container
      .append('svg')
      .attr('viewBox', `0 0 ${this.width} ${this.height}`)
      .attr('width', '100%')
      .style('max-width', `${this.width}px`);
    
    // Title
    this.svg.append('text')
      .attr('class', 'title')
      .attr('x', this.width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .text('Relative Uplift Distribution');
    
    // Main plot area
    this.plotArea = this.svg.append('g')
      .attr('class', 'plot-area')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
    
    // Axis labels
    this.svg.append('text')
      .attr('x', this.width / 2)
      .attr('y', this.height - 10)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .text('Relative Uplift (%)');
    
    this.svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -this.height / 2)
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .text('Density');
  }
  
  private setupTooltip() {
    this.tooltip = d3.select('body').append('div')
      .attr('class', 'uplift-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '10px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');
  }
  
  private setupControls(containerId: string) {
    const container = d3.select(`#${containerId}`);
    
    // Add CI selector above the graph
    const controls = container.insert('div', 'svg')
      .attr('class', 'graph-controls')
      .style('margin-bottom', '10px')
      .style('text-align', 'center');
    
    controls.append('label')
      .style('margin-right', '10px')
      .style('font-weight', 'bold')
      .text('Confidence Interval: ');
    
    const ciOptions = [
      { label: '80%', value: 0.80 },
      { label: '90%', value: 0.90 },
      { label: '95%', value: 0.95 },
      { label: '99%', value: 0.99 }
    ];
    
    ciOptions.forEach(option => {
      const label = controls.append('label')
        .style('margin-right', '15px')
        .style('cursor', 'pointer');
      
      label.append('input')
        .attr('type', 'radio')
        .attr('name', 'ci-level')
        .attr('value', option.value)
        .property('checked', option.value === this.currentCILevel)
        .style('margin-right', '5px')
        .on('change', () => {
          this.currentCILevel = option.value;
          if (this.currentStats) {
            this.redrawWithNewCI();
          }
        });
      
      label.append('span')
        .text(option.label);
    });
  }
  
  private generateStats(
    controlConv: number,
    controlTotal: number,
    treatmentConv: number,
    treatmentTotal: number,
    nSamples: number = 10000
  ): UpliftStats {
    const rng = new RNG(); // or just new RNG() for random seed
    // Create posterior distributions
    const controlDist = beta(1 + controlConv, 1 + controlTotal - controlConv, rng);
    const treatmentDist = beta(1 + treatmentConv, 1 + treatmentTotal - treatmentConv, rng);
    
    // Generate samples
    const samples: number[] = [];
    let positiveCount = 0;
    
    for (let i = 0; i < nSamples; i++) {
      const c = controlDist.sample();
      const t = treatmentDist.sample();
      
      if (t > c) positiveCount++;
      
      if (c > 0) {
        samples.push(((t - c) / c) * 100);
      }
    }
    
    // Calculate statistics
    samples.sort(d3.ascending);
    const median = d3.median(samples) || 0;
    const mean = d3.mean(samples) || 0;
    
    const lowerQ = (1 - this.currentCILevel) / 2;
    const upperQ = 1 - lowerQ;
    
    const ci: [number, number] = [
      d3.quantile(samples, lowerQ) || 0,
      d3.quantile(samples, upperQ) || 0
    ];
    
    return {
      samples,
      median,
      mean,
      ci,
      ciLevel: this.currentCILevel,
      probPositive: positiveCount / nSamples
    };
  }
  
  update(
    controlConv: number,
    controlTotal: number,
    treatmentConv: number,
    treatmentTotal: number
  ) {
    this.currentStats = this.generateStats(
      controlConv,
      controlTotal,
      treatmentConv,
      treatmentTotal
    );
    
    this.draw();
  }
  
  private redrawWithNewCI() {
    if (!this.currentStats) return;
    
    // Recalculate CI with new level
    const lowerQ = (1 - this.currentCILevel) / 2;
    const upperQ = 1 - lowerQ;
    
    this.currentStats.ci = [
      d3.quantile(this.currentStats.samples, lowerQ) || 0,
      d3.quantile(this.currentStats.samples, upperQ) || 0
    ];
    this.currentStats.ciLevel = this.currentCILevel;
    
    this.draw();
  }
  
  private draw() {
    if (!this.currentStats) return;
    
    const { samples, median, mean, ci, probPositive } = this.currentStats;
    
    // Clear previous content
    this.plotArea.selectAll('*').remove();
    
    // Set up scales
    const xExtent = d3.extent(samples) as [number, number];
    const xPadding = (xExtent[1] - xExtent[0]) * 0.1;
    
    const x = d3.scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([0, this.innerWidth]);
    
    // Create histogram
    const histogram = d3.histogram()
      .domain(x.domain() as [number, number])
      .thresholds(x.ticks(40));
    
    const bins = histogram(samples);
    
    const y = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length) as number])
      .range([this.innerHeight, 0]);
    
    // Draw CI region first (so it's behind bars)
    this.plotArea.append('rect')
      .attr('class', 'ci-region')
      .attr('x', x(ci[0]))
      .attr('y', 0)
      .attr('width', x(ci[1]) - x(ci[0]))
      .attr('height', this.innerHeight)
      .style('fill', '#6366f1')
      .style('opacity', 0.15);
    
    // Draw histogram bars
    const bars = this.plotArea.selectAll('.bar')
      .data(bins)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.x0!))
      .attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 1))
      .attr('y', d => y(d.length))
      .attr('height', d => this.innerHeight - y(d.length))
      .style('fill', d => {
        const midpoint = (d.x0! + d.x1!) / 2;
        return midpoint < 0 ? '#ef4444' : '#3b82f6';
      })
      .style('opacity', 0.7)
      .style('cursor', 'pointer');
    
    // Add hover interactions to bars
    bars
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget)
          .style('opacity', 1)
          .style('stroke', '#1f2937')
          .style('stroke-width', 1);
        
        const lowerBound = d.x0!;
        const upperBound = d.x1!;
        const count = d.length;
        const probability = (count / samples.length) * 100;
        
        // Determine the interpretation
        let interpretation = '';
        if (lowerBound >= 0 && upperBound > 0) {
          interpretation = 'Treatment performs better by this amount';
        } else if (upperBound <= 0 && lowerBound < 0) {
          interpretation = 'Control performs better by this amount';
        } else {
          interpretation = 'Mixed results (spans zero)';
        }
        
        this.tooltip
          .style('opacity', 1)
          .html(`
            <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">
              ${lowerBound.toFixed(1)}% to ${upperBound.toFixed(1)}% uplift
            </div>
            <div style="margin-bottom: 5px; color: #e5e7eb;">
              ${interpretation}
            </div>
            <div style="font-size: 13px;">
              <span style="color: #9ca3af;">Probability:</span> 
              <strong>${probability.toFixed(1)}%</strong> chance the true uplift is in this range
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 5px;">
              Based on ${count.toLocaleString()} of ${samples.length.toLocaleString()} simulations
            </div>
          `);
      })
      .on('mousemove', (event) => {
        this.tooltip
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 10) + 'px');
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget)
          .style('opacity', 0.7)
          .style('stroke', 'none');
        
        this.tooltip.style('opacity', 0);
      });
    
    // Add axes
    this.plotArea.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${this.innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d => `${d}%`));
    
    this.plotArea.append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(y).ticks(5));
    
    // Reference lines with smart positioning
    const referenceLines = [
      { value: 0, label: 'No Effect', color: '#6b7280', dash: '4,4', width: 2 },
      { value: median, label: `Median: ${median.toFixed(1)}%`, color: '#10b981', dash: null, width: 3 },
      { value: mean, label: `Mean: ${mean.toFixed(1)}%`, color: '#f59e0b', dash: '2,2', width: 2 },
      { value: ci[0], label: `${(this.currentCILevel * 100)}% CI`, color: '#6366f1', dash: '3,3', width: 1 },
      { value: ci[1], label: null, color: '#6366f1', dash: '3,3', width: 1 }
    ];
    
    // Sort by value to help with label positioning
    referenceLines.sort((a, b) => a.value - b.value);
    
    // Draw lines and collect label positions
    const labelPositions: { value: number, label: string, y: number }[] = [];
    
    referenceLines.forEach(line => {
      this.drawReferenceLine(x, line.value, null, line.color, line.dash, line.width);
      if (line.label) {
        labelPositions.push({ value: line.value, label: line.label, y: -5 });
      }
    });
    
    // Adjust label positions to avoid overlap
    const minLabelSpacing = 60; // Increased for better spacing
    for (let i = 1; i < labelPositions.length; i++) {
      const prev = labelPositions[i - 1];
      const curr = labelPositions[i];
      const xDiff = Math.abs(x(curr.value) - x(prev.value));
      
      if (xDiff < minLabelSpacing) {
        // Alternate between above and below
        curr.y = (i % 2 === 0) ? -5 : -20;
      }
    }
    
    // Draw labels
    labelPositions.forEach(pos => {
      this.plotArea.append('text')
        .attr('x', x(pos.value))
        .attr('y', pos.y)
        .attr('text-anchor', 'middle')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('fill', referenceLines.find(l => l.value === pos.value)?.color || '#374151')
        .text(pos.label);
    });
    
    // Stats summary
    this.drawStatsSummary(probPositive, median, ci);
    
    // Add value cursor on hover
    this.addValueCursor(x, y, samples);
  }
  
  private drawReferenceLine(
    xScale: d3.ScaleLinear<number, number>,
    value: number,
    label: string | null,
    color: string,
    dashArray: string | null,
    strokeWidth: number = 2
  ) {
    const g = this.plotArea.append('g')
      .attr('class', 'reference-line');
    
    const line = g.append('line')
      .attr('x1', xScale(value))
      .attr('x2', xScale(value))
      .attr('y1', 0)
      .attr('y2', this.innerHeight)
      .style('stroke', color)
      .style('stroke-width', strokeWidth);
    
    if (dashArray) {
      line.style('stroke-dasharray', dashArray);
    }
  }
  
  private drawStatsSummary(probPositive: number, median: number, ci: [number, number]) {
    const stats = [
      `${(probPositive * 100).toFixed(1)}% chance treatment is better`,
      `${(this.currentCILevel * 100)}% confident uplift is between ${ci[0].toFixed(1)}% and ${ci[1].toFixed(1)}%`
    ];
    
    const g = this.plotArea.append('g')
      .attr('class', 'stats-summary')
      .attr('transform', `translate(${this.innerWidth - 10}, 20)`);
    
    g.selectAll('text')
      .data(stats)
      .enter().append('text')
      .attr('x', 0)
      .attr('y', (d, i) => i * 18)
      .attr('text-anchor', 'end')
      .style('font-size', '13px')
      .style('font-weight', 'bold')
      .text(d => d);
  }
  
  private addValueCursor(
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>,
    samples: number[]
  ) {
    const focus = this.plotArea.append('g')
      .attr('class', 'focus')
      .style('display', 'none');
    
    focus.append('line')
      .attr('class', 'cursor-line')
      .style('stroke', '#374151')
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.5);
    
    focus.append('rect')
      .attr('class', 'cursor-label-bg')
      .attr('y', -25)
      .attr('height', 20)
      .style('fill', 'white')
      .style('stroke', '#e5e7eb')
      .style('stroke-width', 1);
    
    focus.append('text')
      .attr('class', 'cursor-label')
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('font-weight', '500');
    
    // Invisible rect to capture mouse events
    this.plotArea.append('rect')
      .attr('class', 'overlay')
      .attr('width', this.innerWidth)
      .attr('height', this.innerHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .on('mouseover', () => focus.style('display', null))
      .on('mouseout', () => focus.style('display', 'none'))
      .on('mousemove', (event) => {
        const xPos = d3.pointer(event)[0];
        const upliftValue = xScale.invert(xPos);
        
        // Calculate percentile
        const percentile = d3.mean(samples, s => s <= upliftValue ? 1 : 0) || 0;
        
        focus.select('.cursor-line')
          .attr('x1', xPos)
          .attr('x2', xPos)
          .attr('y1', 0)
          .attr('y2', this.innerHeight);
        
        const labelText = upliftValue >= 0 
          ? `${upliftValue.toFixed(1)}% uplift (${(percentile * 100).toFixed(0)}% chance of less)`
          : `${upliftValue.toFixed(1)}% uplift (${((1 - percentile) * 100).toFixed(0)}% chance of worse)`;
        
        focus.select('.cursor-label')
          .attr('x', xPos)
          .text(labelText);
        
        // Adjust background rect
        const textWidth = labelText.length * 5.5; // Adjusted for average character width
        focus.select('.cursor-label-bg')
          .attr('x', xPos - textWidth / 2 - 5)
          .attr('width', textWidth + 10);
      });
  }
}