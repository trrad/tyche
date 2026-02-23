/**
 * ContextMenu - Right-click context menu for interactive actions
 *
 * Framework-agnostic D3 component for showing context menus on right-click.
 * Provides a clean way to offer additional actions without cluttering the UI.
 *
 * @example
 * ```ts
 * const menu = ContextMenu()
 *   .items([
 *     { label: 'Copy value', action: () => navigator.clipboard.writeText('10%') },
 *     { label: 'Reset threshold', action: () => resetThreshold() },
 *     { label: 'divider' },
 *     { label: 'Export data', action: () => exportData() }
 *   ]);
 *
 * element.on('contextmenu', (event) => {
 *   event.preventDefault();
 *   menu.show(event.pageX, event.pageY);
 * });
 * ```
 */

import * as d3 from 'd3';

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean; // If true, renders as a divider
}

export interface ContextMenuOptions {
  items?: ContextMenuItem[];
  backgroundColor?: string;
  textColor?: string;
  hoverColor?: string;
  borderColor?: string;
  borderRadius?: number;
  fontSize?: number;
  minWidth?: number;
}

/**
 * Create a ContextMenu component
 *
 * @returns Context menu object with show/hide methods
 */
export function ContextMenu() {
  // Configuration with defaults
  let items: ContextMenuItem[] = [];
  let backgroundColor = '#ffffff';
  let textColor = '#1f2937';
  let hoverColor = '#f3f4f6';
  let borderColor = '#d1d5db';
  let borderRadius = 6;
  let fontSize = 13;
  let minWidth = 180;

  // Menu container (created once, reused)
  let menuDiv: d3.Selection<HTMLDivElement, any, HTMLElement, any> | null = null;

  /**
   * Create the menu DOM element
   */
  function createMenu() {
    if (menuDiv) {
      menuDiv.remove();
    }

    menuDiv = d3
      .select('body')
      .append('div')
      .attr('class', 'tyche-context-menu')
      .style('position', 'fixed')
      .style('display', 'none')
      .style('background', backgroundColor)
      .style('border', `1px solid ${borderColor}`)
      .style('border-radius', `${borderRadius}px`)
      .style('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.15)')
      .style('padding', '6px 0')
      .style('min-width', `${minWidth}px`)
      .style('z-index', '10000')
      .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
      .style('font-size', `${fontSize}px`);

    return menuDiv;
  }

  /**
   * Render menu items
   */
  function renderItems() {
    if (!menuDiv) return;

    menuDiv.selectAll('*').remove();

    items.forEach((item) => {
      if (item.divider || item.label === 'divider') {
        // Render divider
        menuDiv!
          .append('div')
          .style('height', '1px')
          .style('background', borderColor)
          .style('margin', '6px 0');
      } else {
        // Render menu item
        const itemDiv = menuDiv!
          .append('div')
          .attr('class', 'context-menu-item')
          .style('padding', '8px 16px')
          .style('cursor', item.disabled ? 'not-allowed' : 'pointer')
          .style('color', item.disabled ? '#9ca3af' : textColor)
          .style('user-select', 'none')
          .text(item.label);

        if (!item.disabled) {
          itemDiv
            .on('mouseenter', function () {
              d3.select(this).style('background', hoverColor);
            })
            .on('mouseleave', function () {
              d3.select(this).style('background', 'transparent');
            })
            .on('click', function (event) {
              event.stopPropagation();
              if (item.action) {
                item.action();
              }
              hide();
            });
        }
      }
    });
  }

  /**
   * Show the context menu at specific coordinates
   */
  function show(x: number, y: number) {
    if (!menuDiv) {
      createMenu();
    }

    renderItems();

    menuDiv!.style('display', 'block').style('left', `${x}px`).style('top', `${y}px`);

    // Adjust position if menu goes off-screen
    setTimeout(() => {
      const menuNode = menuDiv!.node();
      if (menuNode) {
        const rect = menuNode.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let adjustedX = x;
        let adjustedY = y;

        // Check if menu goes off right edge
        if (rect.right > viewportWidth) {
          adjustedX = viewportWidth - rect.width - 10;
        }

        // Check if menu goes off bottom edge
        if (rect.bottom > viewportHeight) {
          adjustedY = viewportHeight - rect.height - 10;
        }

        menuDiv!.style('left', `${adjustedX}px`).style('top', `${adjustedY}px`);
      }
    }, 0);

    // Click anywhere to close
    d3.select('body').on('click.context-menu', hide);
  }

  /**
   * Hide the context menu
   */
  function hide() {
    if (menuDiv) {
      menuDiv.style('display', 'none');
    }
    d3.select('body').on('click.context-menu', null);
  }

  /**
   * Destroy the menu and clean up
   */
  function destroy() {
    if (menuDiv) {
      menuDiv.remove();
      menuDiv = null;
    }
    d3.select('body').on('click.context-menu', null);
  }

  // Public API
  const menu = {
    show,
    hide,
    destroy,

    // Getter-setters
    items: function (value?: ContextMenuItem[]): any {
      if (arguments.length === 0) return items;
      items = value!;
      return menu;
    },

    backgroundColor: function (value?: string): any {
      if (arguments.length === 0) return backgroundColor;
      backgroundColor = value!;
      if (menuDiv) createMenu();
      return menu;
    },

    textColor: function (value?: string): any {
      if (arguments.length === 0) return textColor;
      textColor = value!;
      return menu;
    },

    hoverColor: function (value?: string): any {
      if (arguments.length === 0) return hoverColor;
      hoverColor = value!;
      return menu;
    },

    borderColor: function (value?: string): any {
      if (arguments.length === 0) return borderColor;
      borderColor = value!;
      if (menuDiv) createMenu();
      return menu;
    },

    borderRadius: function (value?: number): any {
      if (arguments.length === 0) return borderRadius;
      borderRadius = value!;
      if (menuDiv) createMenu();
      return menu;
    },

    fontSize: function (value?: number): any {
      if (arguments.length === 0) return fontSize;
      fontSize = value!;
      if (menuDiv) createMenu();
      return menu;
    },

    minWidth: function (value?: number): any {
      if (arguments.length === 0) return minWidth;
      minWidth = value!;
      if (menuDiv) createMenu();
      return menu;
    },
  };

  return menu;
}
