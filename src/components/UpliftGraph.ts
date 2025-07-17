// src/components/UpliftGraph.ts
import { RandomVariable } from '../core/RandomVariable';
import { beta } from '../core/distributions/Beta';

interface UpliftData {
  samples: number[];
  median: number;
  ci95: [number, number];
  probPositive: number;
}

export class UpliftGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 600;
  private height: number = 400;
  private margin = { top: 40, right: 40, bottom: 60, left: 60 };
  
  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    container.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext('2d')!;
  }
  
  /**
   * Generate uplift samples from the posterior distributions
   */
  generateUpliftData(
    controlConversions: number,
    controlTotal: number,
    treatmentConversions: number,
    treatmentTotal: number,
    nSamples: number = 10000
  ): UpliftData {
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
    const median = samples[Math.floor(samples.length * 0.5)];
    const ci95: [number, number] = [
      samples[Math.floor(samples.length * 0.025)],
      samples[Math.floor(samples.length * 0.975)]
    ];
    const probPositive = positiveCount / nSamples;
    
    return { samples, median, ci95, probPositive };
  }
  
  /**
   * Draw the uplift distribution
   */
  draw(data: UpliftData) {
    const { samples, median, ci95, probPositive } = data;
    
    // Clear canvas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Calculate plot dimensions
    const plotWidth = this.width - this.margin.left - this.margin.right;
    const plotHeight = this.height - this.margin.top - this.margin.bottom;
    
    // Create histogram
    const nBins = 50;
    const minVal = Math.min(...samples);
    const maxVal = Math.max(...samples);
    const range = maxVal - minVal;
    const binWidth = range / nBins;
    
    // Count samples in each bin
    const bins: number[] = new Array(nBins).fill(0);
    samples.forEach(value => {
      const binIndex = Math.min(
        Math.floor((value - minVal) / binWidth),
        nBins - 1
      );
      bins[binIndex]++;
    });
    
    const maxCount = Math.max(...bins);
    
    // Set up scales
    const xScale = (value: number) => {
      return this.margin.left + ((value - minVal) / range) * plotWidth;
    };
    
    const yScale = (count: number) => {
      return this.height - this.margin.bottom - (count / maxCount) * plotHeight;
    };
    
    // Draw histogram bars
    this.ctx.fillStyle = '#3b82f6';
    this.ctx.globalAlpha = 0.7;
    
    bins.forEach((count, i) => {
      const x = xScale(minVal + i * binWidth);
      const barWidth = plotWidth / nBins;
      const barHeight = (count / maxCount) * plotHeight;
      
      this.ctx.fillRect(
        x,
        yScale(count),
        barWidth,
        barHeight
      );
    });
    
    this.ctx.globalAlpha = 1;
    
    // Draw axes
    this.ctx.strokeStyle = '#374151';
    this.ctx.lineWidth = 2;
    
    // X-axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.margin.left, this.height - this.margin.bottom);
    this.ctx.lineTo(this.width - this.margin.right, this.height - this.margin.bottom);
    this.ctx.stroke();
    
    // Y-axis
    this.ctx.beginPath();
    this.ctx.moveTo(this.margin.left, this.margin.top);
    this.ctx.lineTo(this.margin.left, this.height - this.margin.bottom);
    this.ctx.stroke();
    
    // Draw zero line
    const zeroX = xScale(0);
    this.ctx.strokeStyle = '#ef4444';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 5]);
    this.ctx.beginPath();
    this.ctx.moveTo(zeroX, this.margin.top);
    this.ctx.lineTo(zeroX, this.height - this.margin.bottom);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    
    // Draw median line
    const medianX = xScale(median);
    this.ctx.strokeStyle = '#10b981';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(medianX, this.margin.top);
    this.ctx.lineTo(medianX, this.height - this.margin.bottom);
    this.ctx.stroke();
    
    // Draw CI shading
    this.ctx.fillStyle = '#6366f1';
    this.ctx.globalAlpha = 0.2;
    this.ctx.fillRect(
      xScale(ci95[0]),
      this.margin.top,
      xScale(ci95[1]) - xScale(ci95[0]),
      plotHeight
    );
    this.ctx.globalAlpha = 1;
    
    // Draw labels
    this.ctx.font = '14px system-ui, -apple-system, sans-serif';
    this.ctx.fillStyle = '#111827';
    this.ctx.textAlign = 'center';
    
    // Title
    this.ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
    this.ctx.fillText(
      'Relative Uplift Distribution',
      this.width / 2,
      25
    );
    
    // X-axis label
    this.ctx.font = '14px system-ui, -apple-system, sans-serif';
    this.ctx.fillText(
      'Relative Uplift (%)',
      this.width / 2,
      this.height - 10
    );
    
    // Y-axis label
    this.ctx.save();
    this.ctx.translate(15, this.height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText('Frequency', 0, 0);
    this.ctx.restore();
    
    // Add x-axis ticks
    const tickValues = [minVal, ci95[0], 0, median, ci95[1], maxVal];
    this.ctx.font = '12px system-ui, -apple-system, sans-serif';
    this.ctx.textAlign = 'center';
    
    tickValues.forEach(value => {
      const x = xScale(value);
      
      // Tick mark
      this.ctx.strokeStyle = '#374151';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, this.height - this.margin.bottom);
      this.ctx.lineTo(x, this.height - this.margin.bottom + 5);
      this.ctx.stroke();
      
      // Label
      this.ctx.fillStyle = '#374151';
      this.ctx.fillText(
        value.toFixed(1) + '%',
        x,
        this.height - this.margin.bottom + 20
      );
    });
    
    // Add statistics box
    const statsX = this.width - this.margin.right - 200;
    const statsY = this.margin.top + 20;
    
    // Stats background
    this.ctx.fillStyle = '#f9fafb';
    this.ctx.strokeStyle = '#e5e7eb';
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(statsX, statsY, 180, 100);
    this.ctx.strokeRect(statsX, statsY, 180, 100);
    
    // Stats text
    this.ctx.fillStyle = '#111827';
    this.ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Statistics', statsX + 10, statsY + 20);
    
    this.ctx.font = '12px system-ui, -apple-system, sans-serif';
    this.ctx.fillText(
      `Median: ${median.toFixed(1)}%`,
      statsX + 10,
      statsY + 40
    );
    this.ctx.fillText(
      `95% CI: [${ci95[0].toFixed(1)}%, ${ci95[1].toFixed(1)}%]`,
      statsX + 10,
      statsY + 60
    );
    this.ctx.fillText(
      `P(uplift > 0): ${(probPositive * 100).toFixed(1)}%`,
      statsX + 10,
      statsY + 80
    );
  }
  
  /**
   * Update the graph with new data
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
    
    this.draw(data);
  }
}

// Usage in ab-test-app.ts:
/*
// Add to HTML:
<div id="uplift-graph"></div>

// In TypeScript:
const upliftGraph = new UpliftGraph('uplift-graph');

// Update when results change:
upliftGraph.update(
  controlConversions,
  controlTotal,
  treatmentConversions,
  treatmentTotal
);
*/