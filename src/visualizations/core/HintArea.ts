/**
 * HintArea - Progressive disclosure component for revealing additional information
 *
 * Framework-agnostic D3 component that provides interactive hint areas that reveal
 * detailed information on hover or click. Used to keep visualizations clean while
 * providing access to additional insights when needed.
 *
 * @example
 * ```ts
 * const hint = HintArea()
 *   .content('This shows the probability that the variant is better than baseline')
 *   .position([100, 50]);
 *
 * svg.append('g').call(hint);
 * ```
 */

import * as d3 from 'd3';

export interface HintAreaOptions {
  // Position [x, y] for the hint trigger
  position?: [number, number];

  // Content to display (plain text or HTML)
  content?: string;

  // Trigger icon/text
  triggerText?: string;

  // Colors
  triggerColor?: string;
  backgroundColor?: string;
  textColor?: string;

  // Size constraints
  maxWidth?: number;

  // Interaction mode
  mode?: 'hover' | 'click';

  // Placement relative to trigger
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

/**
 * Create a HintArea component
 *
 * @returns Reusable chart function with getter-setter methods
 */
export function HintArea() {
  // Configuration with defaults
  let position: [number, number] = [0, 0];
  let content = '';
  let triggerText = '?';
  let triggerColor = '#9ca3af';
  let backgroundColor = '#1f2937';
  let textColor = '#f9fafb';
  let maxWidth = 300;
  let mode: 'hover' | 'click' = 'hover';
  let placement: 'top' | 'bottom' | 'left' | 'right' | 'auto' = 'auto';

  /**
   * Main render function
   */
  function chart(selection: d3.Selection<any, any, any, any>) {
    selection.each(function () {
      const container = d3.select(this);
      const [x, y] = position;

      // Create group if it doesn't exist
      let group = container.select<SVGGElement>('g.hint-area-group');
      if (group.empty()) {
        group = container.append('g').attr('class', 'hint-area-group');
      }

      // Position the group
      group.attr('transform', `translate(${x}, ${y})`);

      // Create trigger circle
      const trigger = group
        .selectAll('circle.hint-trigger')
        .data([null])
        .join('circle')
        .attr('class', 'hint-trigger')
        .attr('r', 8)
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('fill', '#ffffff')
        .attr('stroke', triggerColor)
        .attr('stroke-width', 1.5)
        .style('cursor', 'pointer');

      // Create trigger text (?)
      const triggerLabel = group
        .selectAll('text.hint-trigger-text')
        .data([null])
        .join('text')
        .attr('class', 'hint-trigger-text')
        .attr('x', 0)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
        .style('font-size', '11px')
        .style('font-weight', '600')
        .style('fill', triggerColor)
        .style('pointer-events', 'none')
        .text(triggerText);

      // Create hint content container (initially hidden)
      let hintContent = group.select<SVGForeignObjectElement>('foreignObject.hint-content');
      if (hintContent.empty()) {
        hintContent = group
          .append('foreignObject')
          .attr('class', 'hint-content')
          .style('display', 'none')
          .style('pointer-events', 'none');
      }

      // Create HTML content inside foreignObject
      const htmlDiv = hintContent
        .selectAll('div')
        .data([null])
        .join('xhtml:div')
        .style('background', backgroundColor)
        .style('color', textColor)
        .style('padding', '12px 14px')
        .style('border-radius', '6px')
        .style('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.15)')
        .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
        .style('font-size', '13px')
        .style('line-height', '1.5')
        .style('max-width', `${maxWidth}px`)
        .html(content);

      // Calculate dimensions after content is rendered
      const updateHintPosition = () => {
        const divNode = htmlDiv.node() as HTMLDivElement;
        if (!divNode) return;

        const bbox = divNode.getBoundingClientRect();
        const width = bbox.width;
        const height = bbox.height;

        // Set foreignObject dimensions
        hintContent.attr('width', width).attr('height', height);

        // Calculate position based on placement
        let offsetX = 0;
        let offsetY = 0;
        const padding = 12; // Space between trigger and hint

        if (placement === 'auto' || placement === 'top') {
          // Default: show above the trigger
          offsetX = -width / 2;
          offsetY = -height - padding - 8; // 8 is trigger radius
        } else if (placement === 'bottom') {
          offsetX = -width / 2;
          offsetY = padding + 8;
        } else if (placement === 'left') {
          offsetX = -width - padding - 8;
          offsetY = -height / 2;
        } else if (placement === 'right') {
          offsetX = padding + 8;
          offsetY = -height / 2;
        }

        hintContent.attr('x', offsetX).attr('y', offsetY);
      };

      // Show/hide logic based on mode
      if (mode === 'hover') {
        trigger
          .on('mouseenter', function () {
            hintContent.style('display', 'block');
            updateHintPosition();
          })
          .on('mouseleave', function () {
            hintContent.style('display', 'none');
          });
      } else if (mode === 'click') {
        let isVisible = false;
        trigger.on('click', function (event) {
          event.stopPropagation();
          isVisible = !isVisible;
          hintContent.style('display', isVisible ? 'block' : 'none');
          if (isVisible) {
            updateHintPosition();
          }
        });

        // Click outside to close
        d3.select('body').on('click.hint-area', function () {
          if (isVisible) {
            isVisible = false;
            hintContent.style('display', 'none');
          }
        });
      }
    });
  }

  // Getter-setters
  chart.position = function (value?: [number, number]): any {
    if (arguments.length === 0) return position;
    position = value!;
    return chart;
  };

  chart.content = function (value?: string): any {
    if (arguments.length === 0) return content;
    content = value!;
    return chart;
  };

  chart.triggerText = function (value?: string): any {
    if (arguments.length === 0) return triggerText;
    triggerText = value!;
    return chart;
  };

  chart.triggerColor = function (value?: string): any {
    if (arguments.length === 0) return triggerColor;
    triggerColor = value!;
    return chart;
  };

  chart.backgroundColor = function (value?: string): any {
    if (arguments.length === 0) return backgroundColor;
    backgroundColor = value!;
    return chart;
  };

  chart.textColor = function (value?: string): any {
    if (arguments.length === 0) return textColor;
    textColor = value!;
    return chart;
  };

  chart.maxWidth = function (value?: number): any {
    if (arguments.length === 0) return maxWidth;
    maxWidth = value!;
    return chart;
  };

  chart.mode = function (value?: 'hover' | 'click'): any {
    if (arguments.length === 0) return mode;
    mode = value!;
    return chart;
  };

  chart.placement = function (value?: 'top' | 'bottom' | 'left' | 'right' | 'auto'): any {
    if (arguments.length === 0) return placement;
    placement = value!;
    return chart;
  };

  return chart;
}
