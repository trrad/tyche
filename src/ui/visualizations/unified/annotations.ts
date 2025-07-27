import * as d3 from 'd3';
import { DistributionState, ComparisonResult } from './types';

interface LegendOptions {
  container: d3.Selection<SVGGElement, unknown, null, undefined>;
  distributions: DistributionState[];
  x: number;
  y: number;
  formatValue: (v: number) => string;
  formatPercent: (v: number) => string;
  showStats?: boolean;
}

export function renderLegend(options: LegendOptions) {
  const { container, distributions, x, y, formatValue, formatPercent, showStats } = options;
  
  const legend = container.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${x},${y})`);
  
  const legendSpacing = showStats ? 50 : 25;
  
  distributions.forEach((dist, i) => {
    const legendRow = legend.append('g')
      .attr('transform', `translate(0, ${i * legendSpacing})`);
    
    // Color swatch
    legendRow.append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', dist.color || '#3b82f6')
      .attr('opacity', 0.8)
      .attr('rx', 2);
    
    // Label
    legendRow.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .style('font-size', '13px')
      .style('font-weight', dist.metadata?.isBaseline ? 'bold' : 'normal')
      .text(dist.label);
    
    // Stats (if requested and available)
    if (showStats && dist.stats && 'mean' in dist.stats) {
      // Mean
      legendRow.append('text')
        .attr('x', 20)
        .attr('y', 26)
        .style('font-size', '11px')
        .style('fill', '#6b7280')
        .text(`μ = ${formatValue(dist.stats.mean)}`);
      
      // CI
      legendRow.append('text')
        .attr('x', 20)
        .attr('y', 38)
        .style('font-size', '11px')
        .style('fill', '#9ca3af')
        .text(`95% CI: [${formatValue(dist.stats.ci95[0])}, ${formatValue(dist.stats.ci95[1])}]`);
    }
    
    // Add baseline indicator
    if (dist.metadata?.isBaseline) {
      legendRow.append('text')
        .attr('x', 100)
        .attr('y', 12)
        .style('font-size', '11px')
        .style('fill', '#6b7280')
        .style('font-style', 'italic')
        .text('(baseline)');
    }
  });
  
  return legend;
}

interface ComparisonAnnotationOptions {
  container: d3.Selection<SVGGElement, unknown, null, undefined>;
  comparisons: ComparisonResult[];
  width: number;
  height: number;
  formatPercent: (v: number) => string;
  formatDifference: (v: number) => string;
}

export function renderComparisonAnnotations(options: ComparisonAnnotationOptions) {
  const { container, comparisons, width, height, formatPercent, formatDifference } = options;
  
  // Create annotation group
  const annotations = container.append('g')
    .attr('class', 'comparison-annotations');
  
  comparisons.forEach((comp, i) => {
    const y = height + 80 + i * 30;
    
    // Create annotation box
    const box = annotations.append('g')
      .attr('transform', `translate(${width / 2}, ${y})`);
    
    // Background
    box.append('rect')
      .attr('x', -150)
      .attr('y', -12)
      .attr('width', 300)
      .attr('height', 24)
      .attr('fill', 'white')
      .attr('stroke', '#e5e7eb')
      .attr('rx', 4);
    
    // Color based on continuous probability
    const prob = comp.stats.probabilityOfImprovement;
    const colorScale = d3.scaleLinear<string>()
      .domain([0, 0.5, 1])
      .range(['#ef4444', '#6b7280', '#10b981']);
    
    // Main text - show probability as continuous measure
    const mainText = `${formatPercent(prob)} probability of improvement`;
    
    box.append('text')
      .attr('text-anchor', 'middle')
      .attr('alignment-baseline', 'middle')
      .style('font-size', '13px')
      .style('fill', colorScale(prob))
      .text(mainText);
    
    // Effect size below
    const effectText = `Effect: ${formatDifference(comp.stats.median)} [${formatDifference(comp.stats.ci80[0])}, ${formatDifference(comp.stats.ci80[1])}]`;
    
    box.append('text')
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#6b7280')
      .text(effectText);
  });
}

/**
 * Render a statistical summary box
 */
export function renderStatisticalSummary(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  distributions: DistributionState[],
  x: number,
  y: number,
  formatValue: (v: number) => string
) {
  const summary = container.append('g')
    .attr('class', 'statistical-summary')
    .attr('transform', `translate(${x},${y})`);
  
  // Background
  summary.append('rect')
    .attr('width', 200)
    .attr('height', 100 + distributions.length * 20)
    .attr('fill', 'white')
    .attr('stroke', '#e5e7eb')
    .attr('rx', 4);
  
  // Title
  summary.append('text')
    .attr('x', 10)
    .attr('y', 20)
    .style('font-size', '14px')
    .style('font-weight', 'bold')
    .text('Summary Statistics');
  
  // Stats for each distribution
  distributions.forEach((dist, i) => {
    if (!dist.stats || !('mean' in dist.stats)) return;
    
    const yOffset = 40 + i * 40;
    
    // Distribution name
    summary.append('text')
      .attr('x', 10)
      .attr('y', yOffset)
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .style('fill', dist.color || '#3b82f6')
      .text(dist.label);
    
    // Stats
    const statsText = [
      `Mean: ${formatValue(dist.stats.mean)}`,
      `SD: ${formatValue(dist.stats.std)}`,
      `n: ${dist.samples?.length || 0}`
    ].join(' | ');
    
    summary.append('text')
      .attr('x', 10)
      .attr('y', yOffset + 15)
      .style('font-size', '11px')
      .style('fill', '#6b7280')
      .text(statsText);
  });
}

/**
 * Render hover tooltip content
 */
export function createTooltipContent(
  distribution: DistributionState,
  value: number,
  formatValue: (v: number) => string
): string {
  const lines = [
    `<strong>${distribution.label}</strong>`,
    `Value: ${formatValue(value)}`
  ];
  
  if (distribution.stats && 'mean' in distribution.stats) {
    // Find percentile
    if (distribution.samples) {
      const percentile = distribution.samples.filter(s => s <= value).length / 
                        distribution.samples.length;
      lines.push(`Percentile: ${(percentile * 100).toFixed(1)}%`);
    }
    
    lines.push(`Mean: ${formatValue(distribution.stats.mean)}`);
    lines.push(`Median: ${formatValue(distribution.stats.median)}`);
  }
  
  return lines.join('<br>');
}

/**
 * Render probability-based comparison annotation
 * Shows continuous probability instead of binary winner/loser
 */
export function renderProbabilityAnnotation(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  comparison: ComparisonResult,
  x: number,
  y: number,
  options?: {
    showExpectedImprovement?: boolean;
    practicalThreshold?: number;
  }
) {
  const annotation = container.append('g')
    .attr('transform', `translate(${x},${y})`);
  
  const prob = comparison.stats.probabilityOfImprovement;
  
  // Continuous color scale
  const colorScale = d3.scaleLinear<string>()
    .domain([0, 0.2, 0.5, 0.8, 1])
    .range(['#dc2626', '#f87171', '#9ca3af', '#86efac', '#16a34a']);
  
  // Probability bar visualization
  const barWidth = 120;
  const barHeight = 8;
  
  // Background bar
  annotation.append('rect')
    .attr('x', -barWidth/2)
    .attr('y', 0)
    .attr('width', barWidth)
    .attr('height', barHeight)
    .attr('fill', '#f3f4f6')
    .attr('rx', 4);
  
  // Probability fill
  annotation.append('rect')
    .attr('x', -barWidth/2)
    .attr('y', 0)
    .attr('width', barWidth * prob)
    .attr('height', barHeight)
    .attr('fill', colorScale(prob))
    .attr('rx', 4);
  
  // Probability text
  annotation.append('text')
    .attr('y', -5)
    .attr('text-anchor', 'middle')
    .style('font-size', '13px')
    .style('font-weight', 'bold')
    .style('fill', colorScale(prob))
    .text(`${(prob * 100).toFixed(1)}% better`);
  
  // Expected improvement if requested
  if (options?.showExpectedImprovement && comparison.stats.expectedImprovement > 0) {
    annotation.append('text')
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#6b7280')
      .text(`Expected gain: ${comparison.stats.expectedImprovement.toFixed(2)}`);
  }
  
  // Practical significance if threshold provided
  if (options?.practicalThreshold) {
    const probPractical = comparison.samples.filter(s => 
      s > options.practicalThreshold!
    ).length / comparison.samples.length;
    
    annotation.append('text')
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#6b7280')
      .text(`${(probPractical * 100).toFixed(1)}% > ${options.practicalThreshold}`);
  }
} 