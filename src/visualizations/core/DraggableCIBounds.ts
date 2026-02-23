/**
 * DraggableCIBounds - Interactive credible interval percentile handles
 *
 * Framework-agnostic D3 component for adjusting CI bounds via dragging.
 * Emits events when bounds change, allowing application to update all visualizations.
 */

import * as d3 from 'd3';
import { sortSamples, getPercentile } from '../utils/index.js';
import {
  formatCredibleInterval,
  explainTailProbability,
  formatValue,
} from '../utils/plainEnglish.js';
import { Tooltip } from './Tooltip.js';
import type { CIBoundsOptions, CIDragEventDetail } from '../types/index.js';

/**
 * Create a DraggableCIBounds component
 *
 * @returns Reusable chart function with getter-setter methods
 *
 * @example
 * ```ts
 * const ciBounds = DraggableCIBounds()
 *   .scale(xScale)
 *   .samples(posteriorSamples)
 *   .lowerPercentile(0.1)
 *   .upperPercentile(0.9)
 *   .yRange([0, 100]);
 *
 * svg.append('g')
 *   .call(ciBounds);
 *
 * ciBounds.on('ciDrag', (event) => {
 *   const { lower, upper } = event.detail;
 *   // Update all visualizations with new CI bounds
 * });
 * ```
 */
export function DraggableCIBounds() {
  // Configuration with defaults
  let scale: d3.ScaleLinear<number, number> | null = null;
  let samples: number[] = [];
  let lowerPercentile = 0.1; // 10th percentile
  let upperPercentile = 0.9; // 90th percentile
  let yRange: [number, number] = [0, 100];
  let handleRadius = 5; // Small but visible
  let handleColor = '#9ca3af'; // Medium gray
  let lineColor = '#9ca3af'; // Medium gray for lines
  let lineWidth = 1.5; // Thin lines
  let percentileStep = 0.01; // Snap to 1% increments
  let showTooltip = true; // Enable built-in tooltips

  // Cache
  let cachedSorted: number[] | null = null;

  // Event listeners
  const listeners: Record<string, (event: CustomEvent) => void> = {};

  // Tooltip instance
  const tooltip = Tooltip();

  /**
   * Main render function
   */
  function chart(selection: d3.Selection<any, any, any, any>) {
    selection.each(function () {
      const container = d3.select(this);

      if (!scale) {
        throw new Error('DraggableCIBounds: scale is required');
      }

      if (!samples || samples.length === 0) {
        throw new Error('DraggableCIBounds: samples array is required');
      }

      // Sort samples once and cache
      if (!cachedSorted || cachedSorted.length !== samples.length) {
        cachedSorted = sortSamples(samples);
      }

      const [yMin, yMax] = yRange;

      // Get current bound values
      const lowerValue = getPercentile(cachedSorted, lowerPercentile);
      const upperValue = getPercentile(cachedSorted, upperPercentile);

      // Create group if it doesn't exist
      let group = container.select<SVGGElement>('g.ci-bounds-group');
      if (group.empty()) {
        group = container.append('g').attr('class', 'ci-bounds-group');
      }

      // Create pattern for CI background (diagonal lines)
      let defs = container.select('defs');
      if (defs.empty()) {
        defs = container.append('defs');
      }

      let pattern = defs.select('#ci-pattern');
      if (pattern.empty()) {
        pattern = defs
          .append('pattern')
          .attr('id', 'ci-pattern')
          .attr('patternUnits', 'userSpaceOnUse')
          .attr('width', 8)
          .attr('height', 8);

        pattern
          .append('path')
          .attr('d', 'M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4')
          .attr('stroke', '#9ca3af')
          .attr('stroke-width', 1)
          .attr('opacity', 0.5);
      }

      // Add shaded background rectangle for CI region
      group
        .selectAll('rect.ci-background')
        .data([{ lower: lowerValue, upper: upperValue }])
        .join('rect')
        .attr('class', 'ci-background')
        .attr('x', scale(lowerValue))
        .attr('y', yMin)
        .attr('width', scale(upperValue) - scale(lowerValue))
        .attr('height', yMax - yMin)
        .attr('fill', 'url(#ci-pattern)')
        .attr('opacity', 0.3)
        .attr('pointer-events', 'none');

      // Lower bound line
      const lowerLine = group
        .selectAll('line.ci-bound-lower')
        .data([lowerValue])
        .join('line')
        .attr('class', 'ci-bound-lower')
        .attr('x1', scale(lowerValue))
        .attr('x2', scale(lowerValue))
        .attr('y1', yMin)
        .attr('y2', yMax)
        .attr('stroke', lineColor)
        .attr('stroke-width', lineWidth)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.6)
        .style('cursor', 'ew-resize');

      // Upper bound line
      const upperLine = group
        .selectAll('line.ci-bound-upper')
        .data([upperValue])
        .join('line')
        .attr('class', 'ci-bound-upper')
        .attr('x1', scale(upperValue))
        .attr('x2', scale(upperValue))
        .attr('y1', yMin)
        .attr('y2', yMax)
        .attr('stroke', lineColor)
        .attr('stroke-width', lineWidth)
        .attr('stroke-dasharray', '3,3')
        .attr('opacity', 0.6)
        .style('cursor', 'ew-resize');

      // Remove old handles - lines are directly draggable now
      group.selectAll('circle.ci-handle-lower').remove();
      group.selectAll('circle.ci-handle-upper').remove();

      // Remove percentile labels to avoid confusion with x-axis lift % values
      // Labels will be provided by segment highlighting in Phase 4
      group.selectAll('text.ci-label-lower').remove();
      group.selectAll('text.ci-label-upper').remove();

      // Drag behavior for lower bound
      const dragLower = d3
        .drag()
        .on('start', function (event) {
          lowerLine.attr('stroke-width', lineWidth * 1.5).attr('opacity', 0.9);

          // Force hide any existing tooltips (prevents stuck tooltips from dots, even if pinned)
          tooltip.hide(true);

          // Show simplified tooltip on drag start
          if (showTooltip) {
            const ciCoverage = upperPercentile - lowerPercentile;
            const lowerValue = getPercentile(cachedSorted!, lowerPercentile);
            const upperValue = getPercentile(cachedSorted!, upperPercentile);

            tooltip.show(
              {
                title: null,
                lines: [
                  `${(ciCoverage * 100).toFixed(0)}% credible interval`,
                  formatCredibleInterval(lowerValue, upperValue, ciCoverage),
                ],
              },
              event.sourceEvent
            );
          }
        })
        .on('drag', function (event) {
          // Convert pixel to value to percentile
          const value = scale!.invert(event.x);

          // Find closest percentile
          let closestP = 0;
          let minDiff = Infinity;
          for (let p = 0; p <= 1; p += percentileStep) {
            const pValue = getPercentile(cachedSorted!, p);
            const diff = Math.abs(pValue - value);
            if (diff < minDiff) {
              minDiff = diff;
              closestP = p;
            }
          }

          // Constrain: lower must be < upper
          closestP = Math.max(0, Math.min(closestP, upperPercentile - percentileStep));
          lowerPercentile = closestP;

          // Update visuals
          const newValue = getPercentile(cachedSorted!, lowerPercentile);
          const upperValue = getPercentile(cachedSorted!, upperPercentile);
          const newX = scale!(newValue);
          const upperX = scale!(upperValue);
          lowerLine.attr('x1', newX).attr('x2', newX);

          // Update CI background rectangle
          group
            .select('rect.ci-background')
            .attr('x', newX)
            .attr('width', upperX - newX);

          // Update tooltip during drag
          if (showTooltip) {
            const ciCoverage = upperPercentile - lowerPercentile;
            const upperValue = getPercentile(cachedSorted!, upperPercentile);

            tooltip.show(
              {
                title: null,
                lines: [
                  `${(ciCoverage * 100).toFixed(0)}% credible interval`,
                  formatCredibleInterval(newValue, upperValue, ciCoverage),
                ],
              },
              event.sourceEvent
            );
          }

          // Emit event
          emitDragEvent();
        })
        .on('end', function () {
          lowerLine.attr('stroke-width', lineWidth).attr('opacity', 0.6);

          // Hide tooltip on drag end
          if (showTooltip) {
            tooltip.hide();
          }
        });

      // Drag behavior for upper bound
      const dragUpper = d3
        .drag()
        .on('start', function (event) {
          upperLine.attr('stroke-width', lineWidth * 1.5).attr('opacity', 0.9);

          // Force hide any existing tooltips (prevents stuck tooltips from dots, even if pinned)
          tooltip.hide(true);

          // Show simplified tooltip on drag start
          if (showTooltip) {
            const ciCoverage = upperPercentile - lowerPercentile;
            const lowerValue = getPercentile(cachedSorted!, lowerPercentile);
            const upperValue = getPercentile(cachedSorted!, upperPercentile);

            tooltip.show(
              {
                title: null,
                lines: [
                  `${(ciCoverage * 100).toFixed(0)}% credible interval`,
                  formatCredibleInterval(lowerValue, upperValue, ciCoverage),
                ],
              },
              event.sourceEvent
            );
          }
        })
        .on('drag', function (event) {
          const value = scale!.invert(event.x);

          // Find closest percentile
          let closestP = 1;
          let minDiff = Infinity;
          for (let p = 0; p <= 1; p += percentileStep) {
            const pValue = getPercentile(cachedSorted!, p);
            const diff = Math.abs(pValue - value);
            if (diff < minDiff) {
              minDiff = diff;
              closestP = p;
            }
          }

          // Constrain: upper must be > lower
          closestP = Math.max(lowerPercentile + percentileStep, Math.min(1, closestP));
          upperPercentile = closestP;

          // Update visuals
          const newValue = getPercentile(cachedSorted!, upperPercentile);
          const lowerValue = getPercentile(cachedSorted!, lowerPercentile);
          const newX = scale!(newValue);
          const lowerX = scale!(lowerValue);
          upperLine.attr('x1', newX).attr('x2', newX);

          // Update CI background rectangle
          group.select('rect.ci-background').attr('width', newX - lowerX);

          // Update tooltip during drag
          if (showTooltip) {
            const ciCoverage = upperPercentile - lowerPercentile;
            const lowerValue = getPercentile(cachedSorted!, lowerPercentile);

            tooltip.show(
              {
                title: null,
                lines: [
                  `${(ciCoverage * 100).toFixed(0)}% credible interval`,
                  formatCredibleInterval(lowerValue, newValue, ciCoverage),
                ],
              },
              event.sourceEvent
            );
          }

          // Emit event
          emitDragEvent();
        })
        .on('end', function () {
          upperLine.attr('stroke-width', lineWidth).attr('opacity', 0.6);

          // Hide tooltip on drag end
          if (showTooltip) {
            tooltip.hide();
          }
        });

      // Apply drag behaviors to lines only
      lowerLine.call(dragLower as any);
      upperLine.call(dragUpper as any);

      // Add hover interactions for lines (separate from drag)
      lowerLine
        .on('mouseover', function (event) {
          if (showTooltip) {
            const ciCoverage = upperPercentile - lowerPercentile;
            const lowerValue = getPercentile(cachedSorted!, lowerPercentile);
            const upperValue = getPercentile(cachedSorted!, upperPercentile);

            tooltip.show(
              {
                title: 'Credible Interval (drag to adjust)',
                lines: [
                  `${(ciCoverage * 100).toFixed(0)}% probability the lift is between ${formatValue(lowerValue).replace('.0%', '%')} and ${formatValue(upperValue).replace('.0%', '%')}`,
                  '',
                  'Tails:',
                  `• ${(lowerPercentile * 100).toFixed(0)}% chance below ${formatValue(lowerValue).replace('.0%', '%')}`,
                  `• ${((1 - upperPercentile) * 100).toFixed(0)}% chance above ${formatValue(upperValue).replace('.0%', '%')}`,
                ],
              },
              event
            );
          }
          lowerLine.attr('stroke-width', lineWidth * 1.3).attr('opacity', 0.8);
        })
        .on('mouseout', function () {
          // Don't hide tooltip or reset size if dragging
          if (!d3.select(this).classed('dragging')) {
            if (showTooltip) tooltip.hide();
            lowerLine.attr('stroke-width', lineWidth).attr('opacity', 0.6);
          }
        });

      upperLine
        .on('mouseover', function (event) {
          if (showTooltip) {
            const ciCoverage = upperPercentile - lowerPercentile;
            const lowerValue = getPercentile(cachedSorted!, lowerPercentile);
            const upperValue = getPercentile(cachedSorted!, upperPercentile);

            tooltip.show(
              {
                title: 'Credible Interval (drag to adjust)',
                lines: [
                  `${(ciCoverage * 100).toFixed(0)}% probability the lift is between ${formatValue(lowerValue).replace('.0%', '%')} and ${formatValue(upperValue).replace('.0%', '%')}`,
                  '',
                  'Tails:',
                  `• ${(lowerPercentile * 100).toFixed(0)}% chance below ${formatValue(lowerValue).replace('.0%', '%')}`,
                  `• ${((1 - upperPercentile) * 100).toFixed(0)}% chance above ${formatValue(upperValue).replace('.0%', '%')}`,
                ],
              },
              event
            );
          }
          upperLine.attr('stroke-width', lineWidth * 1.3).attr('opacity', 0.8);
        })
        .on('mouseout', function () {
          // Don't hide tooltip or reset size if dragging
          if (!d3.select(this).classed('dragging')) {
            if (showTooltip) tooltip.hide();
            upperLine.attr('stroke-width', lineWidth).attr('opacity', 0.6);
          }
        });

      function emitDragEvent() {
        if (listeners['ciDrag']) {
          const detail: CIDragEventDetail = {
            lower: lowerPercentile,
            upper: upperPercentile,
          };
          const customEvent = new CustomEvent('ciDrag', { detail });
          listeners['ciDrag'](customEvent);
        }
      }
    });
  }

  // Getter-setters
  chart.scale = function (value?: d3.ScaleLinear<number, number> | null): any {
    if (arguments.length === 0) return scale;
    scale = value ?? null;
    return chart;
  };

  chart.samples = function (value?: number[]): any {
    if (arguments.length === 0) return samples;
    samples = value!;
    cachedSorted = null; // Invalidate cache
    return chart;
  };

  chart.lowerPercentile = function (value?: number): any {
    if (arguments.length === 0) return lowerPercentile;
    lowerPercentile = value!;
    return chart;
  };

  chart.upperPercentile = function (value?: number): any {
    if (arguments.length === 0) return upperPercentile;
    upperPercentile = value!;
    return chart;
  };

  chart.yRange = function (value?: [number, number]): any {
    if (arguments.length === 0) return yRange;
    yRange = value!;
    return chart;
  };

  chart.handleRadius = function (value?: number): any {
    if (arguments.length === 0) return handleRadius;
    handleRadius = value!;
    return chart;
  };

  chart.handleColor = function (value?: string): any {
    if (arguments.length === 0) return handleColor;
    handleColor = value!;
    return chart;
  };

  chart.lineColor = function (value?: string): any {
    if (arguments.length === 0) return lineColor;
    lineColor = value!;
    return chart;
  };

  chart.lineWidth = function (value?: number): any {
    if (arguments.length === 0) return lineWidth;
    lineWidth = value!;
    return chart;
  };

  chart.percentileStep = function (value?: number): any {
    if (arguments.length === 0) return percentileStep;
    percentileStep = value!;
    return chart;
  };

  chart.showTooltip = function (value?: boolean): any {
    if (arguments.length === 0) return showTooltip;
    showTooltip = value!;
    return chart;
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
