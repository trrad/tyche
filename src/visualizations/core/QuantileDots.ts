/**
 * QuantileDots - Quantile dotplot visualization with optional KDE violin overlay
 *
 * Framework-agnostic D3 component using Mike Bostock's reusable chart pattern.
 * Renders quantile dots from posterior samples with optional violin overlay.
 */

import * as d3 from 'd3';
import { computeQuantiles, sortSamples, getCIBounds, getPercentile } from '../utils/index.js';
import { computeKDE } from '../utils/index.js';
import { validateSamples, validateCIBounds, validateNumDots } from '../utils/index.js';
import {
  describeValuePosition,
  describeProbabilityPosition,
  describeCIPosition,
  formatCredibleInterval,
  formatThresholdProbability,
  formatValue,
} from '../utils/plainEnglish.js';
import { Tooltip } from './Tooltip.js';
import type {
  QuantileDotsData,
  QuantileDotsOptions,
  DotHoverEventDetail,
  DotClickEventDetail,
  ColorScheme,
} from '../types/index.js';

/**
 * Create a QuantileDots component
 *
 * @returns Reusable chart function with getter-setter methods
 *
 * @example
 * ```ts
 * const viz = QuantileDots()
 *   .width(400)
 *   .numDots(20)
 *   .ciLower(0.1)
 *   .ciUpper(0.9)
 *   .showViolin(true);
 *
 * d3.select('#container')
 *   .datum({ samples: posteriorSamples, threshold: 0 })
 *   .call(viz);
 *
 * viz.on('dotHover', (event) => {
 *   console.log('Hovered dot:', event.detail.value);
 * });
 * ```
 */
export function QuantileDots() {
  // Configuration with defaults
  let width: number | null = null; // null = use container width
  let height = 60;
  let dotRadius = 3; // Reduced from 4 for less prominence
  let dotOpacity = 0.85; // Reduced from 1.0 for less prominence
  let dotSpacing = 8;
  let scale: d3.ScaleLinear<number, number> | null = null;
  let numDots = 20;
  let ciLower = 0.1; // 10th percentile
  let ciUpper = 0.9; // 90th percentile
  let showViolin = true; // DEFAULT: ON
  let violinOpacity = 0.4; // Increased from 0.3 for more prominence
  let backgroundType: 'violin' | 'histogram' | 'none' = 'violin'; // KDE is smoother
  let colorScheme: ColorScheme = {
    above: '#059669', // Muted emerald green (neobrutalist palette)
    below: '#6b7280', // Muted gray
    neutral: '#3b82f6', // Muted blue (keeping as-is, works well)
  };
  let showTooltip = true; // Enable built-in tooltips

  // Cache for performance
  let cachedSorted: number[] | null = null;
  let cachedQuantiles: number[] | null = null;
  let cachedSamplesLength = 0;
  let cachedKDE: Array<{ value: number; density: number }> | null = null;

  // Event listeners storage
  const listeners: Record<string, (event: CustomEvent) => void> = {};

  // Tooltip instance
  const tooltip = Tooltip();

  /**
   * Main render function
   */
  function chart(selection: d3.Selection<any, QuantileDotsData, any, any>) {
    selection.each(function (data: QuantileDotsData) {
      const container = d3.select(this);
      const { samples, threshold, effectSamples, thresholdEffect } = data;

      // Validate inputs
      validateSamples(samples, 'QuantileDots');
      validateCIBounds(ciLower, ciUpper, 'QuantileDots');
      validateNumDots(numDots, 'QuantileDots');

      // Sort samples once and cache
      if (!cachedSorted || cachedSamplesLength !== samples.length) {
        cachedSorted = sortSamples(samples);
        cachedSamplesLength = samples.length;
        cachedQuantiles = null; // Invalidate quantiles cache
      }

      // Compute quantiles if needed
      if (!cachedQuantiles) {
        cachedQuantiles = computeQuantiles(cachedSorted, numDots);
      }

      // Compute CI bounds from sorted samples
      const ciBounds = getCIBounds(cachedSorted, ciLower, ciUpper);

      // Determine effective dimensions
      const containerElement = this as HTMLElement;
      const bbox = containerElement.getBoundingClientRect();
      const effectiveWidth = width ?? bbox.width ?? 400;

      // Create or update scale if not provided
      const xScale =
        scale ||
        d3
          .scaleLinear()
          .domain(d3.extent(cachedSorted) as [number, number])
          .nice()
          .range([20, effectiveWidth - 20]);

      // Create SVG if it doesn't exist
      let svg = container.select<SVGSVGElement>('svg.quantile-dots-svg');
      if (svg.empty()) {
        svg = container
          .append('svg')
          .attr('class', 'quantile-dots-svg')
          .attr('width', effectiveWidth)
          .attr('height', height);
      } else {
        svg.attr('width', effectiveWidth).attr('height', height);
      }

      // Optional background visualization
      if (showViolin && backgroundType !== 'none') {
        if (backgroundType === 'histogram') {
          // Histogram background - extends beyond dots
          const binner = d3
            .bin()
            .domain(xScale.domain() as [number, number])
            .thresholds(50);
          const histogram = binner(cachedSorted);

          const maxCount = d3.max(histogram, (d) => d.length) || 1;
          const heightScale = d3
            .scaleLinear()
            .domain([0, maxCount])
            .range([0, height * 0.75]); // Taller background

          svg
            .selectAll('.hist-bar')
            .data(histogram)
            .join('rect')
            .attr('class', 'hist-bar')
            .attr('x', (d) => xScale(d.x0!))
            .attr('width', (d) => Math.max(0, xScale(d.x1!) - xScale(d.x0!)))
            .attr('y', (d) => height - heightScale(d.length) - 10)
            .attr('height', (d) => heightScale(d.length))
            .attr('fill', '#e5e7eb')
            .attr('opacity', 0.5);

          svg.selectAll('.violin-bg').remove();
        } else {
          // KDE background - larger, extends well beyond dots
          const domain = xScale.domain();
          const kde = computeKDE(cachedSorted, domain as [number, number], 100);
          cachedKDE = kde; // Cache for external access
          const maxDensity = d3.max(kde, (d) => d.density) || 1;

          const heightScale = d3
            .scaleLinear()
            .domain([0, maxDensity])
            .range([0, height * 0.9]); // Much taller - extends well beyond dots

          const area = d3
            .area<{ value: number; density: number }>()
            .x((d) => xScale(d.value))
            .y0(height - 5)
            .y1((d) => height - heightScale(d.density) - 5)
            .curve(d3.curveBasis);

          // Get CI bounds for visual effects
          const ciLowerValue = getPercentile(cachedSorted, ciLower);
          const ciUpperValue = getPercentile(cachedSorted, ciUpper);

          // Remove old single violin path
          svg.selectAll('.violin-bg').remove();
          svg.selectAll('.violin-bg-ci').remove();
          svg.selectAll('.hist-bar').remove();

          // Split violin at threshold to visualize posterior integration
          if (threshold !== undefined && threshold !== null) {
            // Below threshold segment - ensure we include the threshold point
            let kdeBelow = kde.filter((d) => d.value <= threshold);
            // Add threshold point if not already present to close gap
            const thresholdDensity =
              kde.find((d) => d.value === threshold)?.density ||
              kde.filter((d) => d.value <= threshold).pop()?.density ||
              0;
            if (kdeBelow.length === 0 || kdeBelow[kdeBelow.length - 1].value !== threshold) {
              kdeBelow = [...kdeBelow, { value: threshold, density: thresholdDensity }];
            }
            const probBelow =
              cachedSorted.filter((s) => s <= threshold).length / cachedSorted.length;

            svg
              .selectAll('.violin-segment-below')
              .data(kdeBelow.length > 0 ? [kdeBelow] : [])
              .join('path')
              .attr('class', 'violin-segment-below')
              .attr('d', area)
              .attr('fill', '#fee2e2') // Slightly more saturated red/pink
              .attr('stroke', '#fecaca') // Subtle border
              .attr('stroke-width', 1)
              .attr('opacity', 0.85) // Increased from 0.7
              .attr('pointer-events', 'all')
              .style('cursor', 'pointer')
              .on('mouseover', function (event) {
                d3.select(this).attr('opacity', 1).attr('stroke-width', 1.5);
                // Could add tooltip here showing segment stats
              })
              .on('mouseout', function () {
                d3.select(this).attr('opacity', 0.85).attr('stroke-width', 1);
              });

            // Above threshold segment - ensure we include the threshold point
            let kdeAbove = kde.filter((d) => d.value >= threshold);
            // Add threshold point if not already present to close gap
            if (kdeAbove.length === 0 || kdeAbove[0].value !== threshold) {
              kdeAbove = [{ value: threshold, density: thresholdDensity }, ...kdeAbove];
            }
            const probAbove =
              cachedSorted.filter((s) => s > threshold).length / cachedSorted.length;

            svg
              .selectAll('.violin-segment-above')
              .data(kdeAbove.length > 0 ? [kdeAbove] : [])
              .join('path')
              .attr('class', 'violin-segment-above')
              .attr('d', area)
              .attr('fill', '#dcfce7') // Slightly more saturated green
              .attr('stroke', '#bbf7d0') // Subtle border
              .attr('stroke-width', 1)
              .attr('opacity', 0.85) // Increased from 0.7
              .attr('pointer-events', 'all')
              .style('cursor', 'pointer')
              .on('mouseover', function (event) {
                d3.select(this).attr('opacity', 1).attr('stroke-width', 1.5);
              })
              .on('mouseout', function () {
                d3.select(this).attr('opacity', 0.85).attr('stroke-width', 1);
              });

            // Add probability labels at 75% height (middle-bottom area to avoid dense dots)
            const xDomain = xScale.domain();
            const belowCenter = (xDomain[0] + threshold) / 2;
            const aboveCenter = (threshold + xDomain[1]) / 2;

            // Label for below segment (worse than threshold) - at 75% height
            if (probBelow > 0.05) {
              // Only show if segment is >5%
              // Simplified: just show percentage, dollar threshold info is on the threshold line
              svg
                .selectAll('.segment-label-below')
                .data([probBelow])
                .join('text')
                .attr('class', 'segment-label-below')
                .attr('x', xScale(belowCenter))
                .attr('y', height * 0.75)
                .attr('text-anchor', 'middle')
                .attr(
                  'font-family',
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                )
                .attr('font-size', '13px') // Increased from 11px for prominence
                .attr('font-weight', '700') // Increased from 600 for prominence
                .attr('fill', '#991b1b') // Darker red
                .style('text-shadow', '0 1px 2px rgba(255, 255, 255, 0.8)') // Legibility over violin
                .text(`${(probBelow * 100).toFixed(0)}% chance worse`);
            } else {
              svg.selectAll('.segment-label-below').remove();
            }

            // Label for above segment (better than threshold) - at 75% height
            if (probAbove > 0.05) {
              // Only show if segment is >5%
              // Simplified: just show percentage, dollar threshold info is on the threshold line
              svg
                .selectAll('.segment-label-above')
                .data([probAbove])
                .join('text')
                .attr('class', 'segment-label-above')
                .attr('x', xScale(aboveCenter))
                .attr('y', height * 0.75)
                .attr('text-anchor', 'middle')
                .attr(
                  'font-family',
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                )
                .attr('font-size', '13px') // Increased from 11px for prominence
                .attr('font-weight', '700') // Increased from 600 for prominence
                .attr('fill', '#065f46') // Darker green
                .style('text-shadow', '0 1px 2px rgba(255, 255, 255, 0.8)') // Legibility over violin
                .text(`${(probAbove * 100).toFixed(0)}% chance better`);
            } else {
              svg.selectAll('.segment-label-above').remove();
            }
          } else {
            // No threshold - render single violin
            svg
              .selectAll('.violin-segment-single')
              .data([kde])
              .join('path')
              .attr('class', 'violin-segment-single')
              .attr('d', area)
              .attr('fill', '#f3f4f6')
              .attr('opacity', 0.8);

            svg.selectAll('.violin-segment-below').remove();
            svg.selectAll('.violin-segment-above').remove();
            svg.selectAll('.segment-label-below').remove();
            svg.selectAll('.segment-label-above').remove();
          }
        }

        // Subtle CI region indicators (removed the solid rectangle)
      } else {
        svg.selectAll('.violin-bg, .hist-bar, .ci-region').remove();
      }

      // Stack dots based on x-position (value-based stacking)
      // Sort by value, then stack dots at similar x positions
      interface DotPosition {
        value: number;
        x: number;
        y: number;
        color: string;
        isOutsideCI: boolean;
      }

      const dotPositions: DotPosition[] = [];
      const baseY = height - dotRadius - 10;

      // Group quantiles by x-position for stacking
      // Use a map to track how many dots at each x position
      const stackHeights = new Map<number, number>();
      const binWidth = dotRadius * 2.5; // Bin width for grouping nearby dots

      // Get CI bounds for opacity calculation
      const ciLowerValue = getPercentile(cachedSorted, ciLower);
      const ciUpperValue = getPercentile(cachedSorted, ciUpper);

      cachedQuantiles.forEach((value) => {
        const x = xScale(value);
        const binIndex = Math.round(x / binWidth);

        let color =
          threshold !== undefined
            ? value > threshold
              ? colorScheme.above
              : colorScheme.below
            : colorScheme.neutral;

        // Determine if outside CI - will use for opacity
        const isOutsideCI = value < ciLowerValue || value > ciUpperValue;

        // Get current stack height at this bin
        const stackHeight = stackHeights.get(binIndex) || 0;

        dotPositions.push({
          value: value,
          x: x,
          y: baseY - stackHeight * dotSpacing,
          color: color,
          isOutsideCI: isOutsideCI,
        });

        // Increment stack height for this bin
        stackHeights.set(binIndex, stackHeight + 1);
      });

      // Render dots using enter/update/exit pattern
      const dots = svg
        .selectAll<SVGCircleElement, DotPosition>('circle.quantile-dot')
        .data(dotPositions)
        .join('circle')
        .attr('class', 'quantile-dot')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', dotRadius)
        .attr('fill', (d) => d.color)
        .attr('fill-opacity', (d) => (d.isOutsideCI ? 0.3 : dotOpacity))
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer');

      // Hover interactions
      dots
        .on('mouseover', function (event, d) {
          d3.select(this)
            .attr('r', dotRadius * 1.5)
            .attr('stroke-width', 2);

          // Show tooltip if enabled
          if (showTooltip && cachedSorted) {
            const percentile =
              cachedSorted.findIndex((s: number) => s === d.value) / cachedSorted.length;

            // Build simple, plain English tooltip
            const lines: string[] = [];

            // First line: Show both $ and % if effectSamples available
            if (effectSamples && effectSamples.length === samples.length) {
              // Find closest matching sample to get corresponding effect value
              const sampleIndex = cachedSorted.findIndex((s: number) => s === d.value);
              if (sampleIndex >= 0 && sampleIndex < effectSamples.length) {
                const sortedEffect = [...effectSamples].sort((a, b) => {
                  const aLift = samples[effectSamples.indexOf(a)];
                  const bLift = samples[effectSamples.indexOf(b)];
                  return (aLift || 0) - (bLift || 0);
                });
                const effectValue = sortedEffect[sampleIndex];
                const dollarStr =
                  effectValue >= 0
                    ? `+$${effectValue.toFixed(2)}`
                    : `-$${Math.abs(effectValue).toFixed(2)}`;
                const pctStr = formatValue(d.value, '%');
                lines.push(`${dollarStr} (${pctStr} lift)`);
              } else {
                // Fallback if index lookup fails
                lines.push(formatValue(d.value, '%'));
              }
            } else {
              // Just show % lift if no $ context available
              lines.push(formatValue(d.value, '%'));
            }

            // Add plain English probability context with "chance" language
            const below = (percentile * 100).toFixed(0);
            const above = ((1 - percentile) * 100).toFixed(0);
            lines.push(`${below}% chance this outcome is below this value`);
            lines.push(`${above}% chance this outcome is above this value`);

            tooltip.show(
              {
                title: null, // No title, keep it minimal
                lines,
              },
              event
            );
          }

          if (listeners['dotHover']) {
            const detail: DotHoverEventDetail = {
              value: d.value,
              x: d.x,
              y: d.y,
              color: d.color,
              ciLower: ciBounds.lower,
              ciUpper: ciBounds.upper,
              ciLevel: ciUpper - ciLower,
            };
            const customEvent = new CustomEvent('dotHover', { detail });
            listeners['dotHover'](customEvent);
          }
        })
        .on('mouseout', function (event, d) {
          d3.select(this).attr('r', dotRadius).attr('stroke-width', 0.5);

          // Schedule delayed hide - gives user time to move mouse to tooltip
          if (showTooltip) {
            tooltip.scheduleHide();
          }
        })
        .on('click', function (event, d) {
          if (listeners['dotClick']) {
            const detail: DotClickEventDetail = {
              value: d.value,
              x: d.x,
              y: d.y,
            };
            const customEvent = new CustomEvent('dotClick', { detail });
            listeners['dotClick'](customEvent);
          }
        });
    });
  }

  // Getter-setter methods
  chart.width = function (value?: number | null): any {
    if (arguments.length === 0) return width;
    width = value ?? null;
    return chart;
  };

  chart.height = function (value?: number): any {
    if (arguments.length === 0) return height;
    height = value!;
    return chart;
  };

  chart.dotRadius = function (value?: number): any {
    if (arguments.length === 0) return dotRadius;
    dotRadius = value!;
    return chart;
  };

  chart.dotSpacing = function (value?: number): any {
    if (arguments.length === 0) return dotSpacing;
    dotSpacing = value!;
    return chart;
  };

  chart.dotOpacity = function (value?: number): any {
    if (arguments.length === 0) return dotOpacity;
    dotOpacity = value!;
    return chart;
  };

  chart.scale = function (value?: d3.ScaleLinear<number, number> | null): any {
    if (arguments.length === 0) return scale;
    scale = value ?? null;
    return chart;
  };

  chart.numDots = function (value?: number): any {
    if (arguments.length === 0) return numDots;
    numDots = value!;
    cachedQuantiles = null; // Invalidate cache
    return chart;
  };

  chart.ciLower = function (value?: number): any {
    if (arguments.length === 0) return ciLower;
    ciLower = value!;
    return chart;
  };

  chart.ciUpper = function (value?: number): any {
    if (arguments.length === 0) return ciUpper;
    ciUpper = value!;
    return chart;
  };

  chart.showViolin = function (value?: boolean): any {
    if (arguments.length === 0) return showViolin;
    showViolin = value!;
    return chart;
  };

  chart.violinOpacity = function (value?: number): any {
    if (arguments.length === 0) return violinOpacity;
    violinOpacity = value!;
    return chart;
  };

  chart.backgroundType = function (value?: 'violin' | 'histogram' | 'none'): any {
    if (arguments.length === 0) return backgroundType;
    backgroundType = value!;
    return chart;
  };

  chart.colorScheme = function (value?: ColorScheme): any {
    if (arguments.length === 0) return colorScheme;
    colorScheme = value!;
    return chart;
  };

  chart.showTooltip = function (value?: boolean): any {
    if (arguments.length === 0) return showTooltip;
    showTooltip = value!;
    return chart;
  };

  // Expose KDE data for external use (e.g., CI region rendering)
  chart.getKDE = function (): Array<{ value: number; density: number }> | null {
    return cachedKDE;
  };

  // Event handling
  chart.on = function (event: string, handler: ((event: CustomEvent) => void) | null): any {
    if (handler === null) {
      delete listeners[event];
    } else {
      listeners[event] = handler;
    }
    return chart;
  };

  return chart;
}
