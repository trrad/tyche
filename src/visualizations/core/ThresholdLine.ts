/**
 * ThresholdLine - Draggable vertical threshold line for business decision points
 *
 * Framework-agnostic D3 component using Mike Bostock's reusable chart pattern.
 */

import * as d3 from 'd3';
import { formatValue } from '../utils/plainEnglish.js';
import {
  convertPercentToEffect,
  makeEditable,
  parsePercentInput,
  parseDollarInput,
} from '../utils/index.js';
import { Tooltip } from './Tooltip.js';
import type { ThresholdLineOptions, ThresholdDragEventDetail } from '../types/index.js';

/**
 * Create a ThresholdLine component
 *
 * @returns Reusable chart function with getter-setter methods
 *
 * @example
 * ```ts
 * const threshold = ThresholdLine()
 *   .scale(xScale)
 *   .value(0.10)
 *   .yRange([0, 100]);
 *
 * svg.append('g')
 *   .call(threshold);
 *
 * threshold.on('thresholdDrag', (event) => {
 *   console.log('New threshold:', event.detail.value);
 * });
 * ```
 */
export function ThresholdLine() {
  // Configuration with defaults
  let scale: d3.ScaleLinear<number, number> | null = null;
  let yRange: [number, number] = [0, 100];
  let value = 0;
  let lineColor = '#6b7280'; // Neutral gray for subtlety
  let lineWidth = 1.5; // Thin, unobtrusive line
  let handleRadius = 4; // Small circular caps for drag affordance
  let showLabel = true;
  let labelColor = '#4b5563'; // Darker gray for contrast
  let showTooltip = true; // Enable built-in tooltips
  let samples: number[] = []; // % lift samples for conversion
  let controlSamples: number[] | undefined = undefined; // Control RPU samples for $ ↔ % conversion

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
        throw new Error('ThresholdLine: scale is required');
      }

      const xPos = scale(value);
      const [yMin, yMax] = yRange;

      // Create group if it doesn't exist
      let group = container.select<SVGGElement>('g.threshold-line-group');
      if (group.empty()) {
        group = container.append('g').attr('class', 'threshold-line-group');
      }

      // Draw vertical line (solid, thin, neutral)
      const line = group
        .selectAll('line.threshold-line')
        .data([value])
        .join('line')
        .attr('class', 'threshold-line')
        .attr('x1', xPos)
        .attr('x2', xPos)
        .attr('y1', yMin)
        .attr('y2', yMax)
        .attr('stroke', lineColor)
        .attr('stroke-width', lineWidth)
        .attr('opacity', 0.7) // Subtle presence
        .style('cursor', 'ew-resize');

      // Draw cap at top (horizontal line)
      const capTop = group
        .selectAll('line.threshold-cap-top')
        .data([value])
        .join('line')
        .attr('class', 'threshold-cap-top')
        .attr('x1', xPos - 4) // 8px wide cap
        .attr('x2', xPos + 4)
        .attr('y1', yMin)
        .attr('y2', yMin)
        .attr('stroke', lineColor)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .style('cursor', 'ew-resize');

      // Draw cap at bottom (horizontal line)
      const capBottom = group
        .selectAll('line.threshold-cap-bottom')
        .data([value])
        .join('line')
        .attr('class', 'threshold-cap-bottom')
        .attr('x1', xPos - 4) // 8px wide cap
        .attr('x2', xPos + 4)
        .attr('y1', yMax)
        .attr('y2', yMax)
        .attr('stroke', lineColor)
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round')
        .style('cursor', 'ew-resize');

      // Labels are now handled by RidgeDotplot as axis ticks
      // Remove any old floating labels if they exist
      group.selectAll('text.threshold-label-top').remove();
      group.selectAll('text.threshold-label-bottom').remove();

      // Drag behavior (directly on line and caps)
      const drag = d3
        .drag()
        .on('start', function (event) {
          // Emphasize the line during drag
          line.attr('stroke-width', lineWidth * 1.5).attr('opacity', 0.9);
          capTop.attr('stroke-width', 3);
          capBottom.attr('stroke-width', 3);
        })
        .on('drag', function (event) {
          // Convert pixel position to value
          const newValue = scale!.invert(event.x);

          // Constrain to scale domain
          const domain = scale!.domain();
          const constrainedValue = Math.max(domain[0], Math.min(domain[1], newValue));
          value = constrainedValue;

          // Update positions
          const newX = scale!(value);

          // Update caps
          capTop.attr('x1', newX - 4).attr('x2', newX + 4);
          capBottom.attr('x1', newX - 4).attr('x2', newX + 4);

          // Update line
          line.attr('x1', newX).attr('x2', newX);

          // Labels are now handled by RidgeDotplot as axis ticks
          // Just emit the event so RidgeDotplot can update the axis ticks

          // Emit event
          if (listeners['thresholdDrag']) {
            const detail: ThresholdDragEventDetail = { value };
            const customEvent = new CustomEvent('thresholdDrag', { detail });
            listeners['thresholdDrag'](customEvent);
          }
        })
        .on('end', function () {
          // Reset styling
          line.attr('stroke-width', lineWidth).attr('opacity', 0.7);
          capTop.attr('stroke-width', 2);
          capBottom.attr('stroke-width', 2);
        });

      // Apply drag to line and both caps
      line.call(drag as any);
      capTop.call(drag as any);
      capBottom.call(drag as any);
    });
  }

  // Getter-setters
  chart.scale = function (value?: d3.ScaleLinear<number, number> | null): any {
    if (arguments.length === 0) return scale;
    scale = value ?? null;
    return chart;
  };

  chart.yRange = function (value?: [number, number]): any {
    if (arguments.length === 0) return yRange;
    yRange = value!;
    return chart;
  };

  chart.value = function (val?: number): any {
    if (arguments.length === 0) return value;
    value = val!;
    return chart;
  };

  chart.lineColor = function (val?: string): any {
    if (arguments.length === 0) return lineColor;
    lineColor = val!;
    return chart;
  };

  chart.lineWidth = function (val?: number): any {
    if (arguments.length === 0) return lineWidth;
    lineWidth = val!;
    return chart;
  };

  chart.handleRadius = function (val?: number): any {
    if (arguments.length === 0) return handleRadius;
    handleRadius = val!;
    return chart;
  };

  chart.showLabel = function (val?: boolean): any {
    if (arguments.length === 0) return showLabel;
    showLabel = val!;
    return chart;
  };

  chart.labelColor = function (val?: string): any {
    if (arguments.length === 0) return labelColor;
    labelColor = val!;
    return chart;
  };

  chart.samples = function (val?: number[]): any {
    if (arguments.length === 0) return samples;
    samples = val!;
    return chart;
  };

  chart.controlSamples = function (val?: number[]): any {
    if (arguments.length === 0) return controlSamples;
    controlSamples = val;
    return chart;
  };

  chart.showTooltip = function (val?: boolean): any {
    if (arguments.length === 0) return showTooltip;
    showTooltip = val!;
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
