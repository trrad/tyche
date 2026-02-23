/**
 * Tooltip - Context-aware tooltip with plain English probability statements
 *
 * Framework-agnostic D3 component using Mike Bostock's reusable chart pattern.
 * Provides intelligent tooltip positioning and formatted content display.
 */

import * as d3 from 'd3';

export interface TooltipContent {
  title?: string;
  lines: string[];
}

export interface TooltipInstance {
  show: (content: TooltipContent, event: MouseEvent) => void;
  hide: (force?: boolean) => void;
  scheduleHide: () => void;
  destroy: () => void;
  pin: () => void;
  unpin: () => void;
  isPinned: () => boolean;
  offsetX: (value?: number) => number | TooltipInstance;
  offsetY: (value?: number) => number | TooltipInstance;
  maxWidth: (value?: number) => number | TooltipInstance;
  padding: (value?: number) => number | TooltipInstance;
  backgroundColor: (value?: string) => string | TooltipInstance;
  textColor: (value?: string) => string | TooltipInstance;
  fontSize: (value?: number) => number | TooltipInstance;
}

/**
 * Create a Tooltip component
 *
 * @returns Reusable tooltip function with methods for showing/hiding
 *
 * @example
 * ```ts
 * const tooltip = Tooltip();
 *
 * // Show tooltip on hover
 * selection.on('mouseover', (event, d) => {
 *   tooltip.show({
 *     title: 'Quantile Value',
 *     lines: [
 *       `Value: ${d.value.toFixed(2)}`,
 *       `80% CI: [${d.ciLower.toFixed(2)}, ${d.ciUpper.toFixed(2)}]`,
 *       'This shows where we believe the true value is likely to be'
 *     ]
 *   }, event);
 * });
 *
 * selection.on('mouseout', () => {
 *   tooltip.hide();
 * });
 * ```
 */
export function Tooltip(): TooltipInstance {
  // Configuration with defaults - lighter, more integrated styling
  let offsetX = 12;
  let offsetY = 12;
  let maxWidth = 280;
  let padding = 8;
  let backgroundColor = 'rgba(31, 41, 55, 0.92)'; // Slightly transparent
  let textColor = '#ffffff';
  let borderRadius = 4;
  let fontSize = 12;
  let lineHeight = 1.5;
  let boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';

  // Tooltip container
  let tooltipDiv: d3.Selection<HTMLDivElement, unknown, HTMLElement, any> | null = null;

  // Pin state
  let pinned = false;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;
  const hideDelay = 600; // ms delay before hiding tooltip (long enough to reach it)

  /**
   * Clear any pending hide timeout
   */
  function clearHideTimeout() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }

  /**
   * Initialize tooltip container if needed
   */
  function ensureContainer() {
    if (!tooltipDiv || tooltipDiv.empty()) {
      tooltipDiv = d3
        .select('body')
        .append('div')
        .attr('class', 'tyche-tooltip')
        .style('position', 'absolute')
        .style('pointer-events', 'auto') // Enable clicking
        .style('background-color', backgroundColor)
        .style('color', textColor)
        .style('border-radius', `${borderRadius}px`)
        .style('padding', `${padding}px`)
        .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
        .style('font-size', `${fontSize}px`)
        .style('line-height', lineHeight)
        .style('max-width', `${maxWidth}px`)
        .style('box-shadow', boxShadow)
        .style('z-index', '9999')
        .style('opacity', '0')
        .style('transition', 'opacity 150ms ease-in-out')
        .on('mouseenter', () => {
          // Cancel hide when hovering over tooltip
          clearHideTimeout();
        })
        .on('mouseleave', () => {
          // Hide after delay when leaving tooltip (unless pinned)
          if (!pinned) {
            scheduleHide();
          }
        })
        .on('click', (event) => {
          // Pin on click (unless clicking close button)
          if (!(event.target as HTMLElement).classList.contains('tooltip-close-btn')) {
            pin();
          }
        });
    }
    return tooltipDiv;
  }

  /**
   * Schedule tooltip hide with delay
   */
  function scheduleHide() {
    clearHideTimeout();
    hideTimeout = setTimeout(() => {
      if (!pinned) {
        hide();
      }
    }, hideDelay);
  }

  /**
   * Show tooltip with content at event position
   */
  function show(content: TooltipContent, event: MouseEvent) {
    clearHideTimeout(); // Cancel any pending hide
    const container = ensureContainer();

    // Build HTML content
    let html = '';

    // Add close button if pinned
    if (pinned) {
      html += `<button class="tooltip-close-btn" style="
        position: absolute;
        top: 4px;
        right: 4px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 3px;
        color: white;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 2px 6px;
        opacity: 0.7;
        transition: opacity 150ms;
      " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" onclick="event.stopPropagation();">×</button>`;
    }

    if (content.title) {
      html += `<div style="font-weight: 600; margin-bottom: ${content.lines.length > 0 ? '8px' : '0'}; padding-right: ${pinned ? '20px' : '0'}">${content.title}</div>`;
    }
    if (content.lines.length > 0) {
      html += content.lines
        .map((line) => `<div style="margin: 4px 0; color: rgba(255, 255, 255, 0.9);">${line}</div>`)
        .join('');
    }

    container.html(html);

    // Add click handler to close button
    if (pinned) {
      container.select('.tooltip-close-btn').on('click', () => {
        unpin();
        hide();
      });
    }

    // Position tooltip
    const [mouseX, mouseY] = [event.pageX, event.pageY];
    const tooltipNode = container.node();
    if (!tooltipNode) return;

    const tooltipRect = tooltipNode.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Determine best position (avoid going off screen)
    let left = mouseX + offsetX;
    let top = mouseY + offsetY;

    // Check if tooltip would go off right edge
    if (left + tooltipRect.width > viewportWidth - 10) {
      left = mouseX - tooltipRect.width - offsetX;
    }

    // Check if tooltip would go off bottom edge
    if (top + tooltipRect.height > viewportHeight - 10) {
      top = mouseY - tooltipRect.height - offsetY;
    }

    // Ensure tooltip doesn't go off left or top edges
    left = Math.max(10, left);
    top = Math.max(10, top);

    container.style('left', `${left}px`).style('top', `${top}px`).style('opacity', '1');
  }

  /**
   * Hide tooltip (respects pinned state unless force=true)
   */
  function hide(force: boolean = false) {
    clearHideTimeout();
    if (force) {
      // Force hide even if pinned (for drag operations)
      pinned = false;
      if (tooltipDiv) {
        tooltipDiv.style('opacity', '0');
      }
    } else if (!pinned && tooltipDiv) {
      tooltipDiv.style('opacity', '0');
    }
  }

  /**
   * Pin tooltip (keeps it visible and clickable)
   */
  function pin() {
    pinned = true;
    clearHideTimeout();
    // Re-render to show close button
    if (tooltipDiv && !tooltipDiv.empty()) {
      const currentHtml = tooltipDiv.html();
      if (!currentHtml.includes('tooltip-close-btn')) {
        // Add close button at the beginning
        const closeBtn = `<button class="tooltip-close-btn" style="
          position: absolute;
          top: 4px;
          right: 4px;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 3px;
          color: white;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
          padding: 2px 6px;
          opacity: 0.7;
          transition: opacity 150ms;
        " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" onclick="event.stopPropagation();">×</button>`;
        tooltipDiv.html(closeBtn + currentHtml);

        // Add click handler to close button
        tooltipDiv.select('.tooltip-close-btn').on('click', () => {
          unpin();
          hide();
        });
      }
    }
  }

  /**
   * Unpin tooltip (allows it to hide normally)
   */
  function unpin() {
    pinned = false;
  }

  /**
   * Check if tooltip is pinned
   */
  function isPinned() {
    return pinned;
  }

  /**
   * Remove tooltip from DOM (cleanup)
   */
  function destroy() {
    if (tooltipDiv) {
      tooltipDiv.remove();
      tooltipDiv = null;
    }
  }

  // Getter-setter methods
  const tooltip = {
    show,
    hide,
    scheduleHide,
    destroy,
    pin,
    unpin,
    isPinned,
  } as TooltipInstance;

  tooltip.offsetX = function (value?: number): number | TooltipInstance {
    if (arguments.length === 0) return offsetX;
    offsetX = value!;
    return tooltip;
  };

  tooltip.offsetY = function (value?: number): number | TooltipInstance {
    if (arguments.length === 0) return offsetY;
    offsetY = value!;
    return tooltip;
  };

  tooltip.maxWidth = function (value?: number): number | TooltipInstance {
    if (arguments.length === 0) return maxWidth;
    maxWidth = value!;
    if (tooltipDiv) {
      tooltipDiv.style('max-width', `${maxWidth}px`);
    }
    return tooltip;
  };

  tooltip.padding = function (value?: number): number | TooltipInstance {
    if (arguments.length === 0) return padding;
    padding = value!;
    if (tooltipDiv) {
      tooltipDiv.style('padding', `${padding}px`);
    }
    return tooltip;
  };

  tooltip.backgroundColor = function (value?: string): string | TooltipInstance {
    if (arguments.length === 0) return backgroundColor;
    backgroundColor = value!;
    if (tooltipDiv) {
      tooltipDiv.style('background-color', backgroundColor);
    }
    return tooltip;
  };

  tooltip.textColor = function (value?: string): string | TooltipInstance {
    if (arguments.length === 0) return textColor;
    textColor = value!;
    if (tooltipDiv) {
      tooltipDiv.style('color', textColor);
    }
    return tooltip;
  };

  tooltip.fontSize = function (value?: number): number | TooltipInstance {
    if (arguments.length === 0) return fontSize;
    fontSize = value!;
    if (tooltipDiv) {
      tooltipDiv.style('font-size', `${fontSize}px`);
    }
    return tooltip;
  };

  return tooltip;
}
