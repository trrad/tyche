/**
 * Configuration option type definitions for D3 visualization components
 */

import type { ScaleLinear, ScaleBand } from 'd3-scale';

/**
 * Color scheme for quantile dots based on threshold
 */
export interface ColorScheme {
  above: string; // Color for values above threshold (default: green)
  below: string; // Color for values below threshold (default: gray)
  neutral: string; // Color when no threshold set (default: blue)
}

/**
 * Margin specification for SVG components
 */
export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Configuration options for QuantileDots component
 */
export interface QuantileDotsOptions {
  width?: number | null; // Width in pixels, null = use container width
  height?: number; // Height in pixels
  dotRadius?: number; // Radius of dots in pixels
  dotSpacing?: number; // Vertical spacing between stacked dots
  scale?: ScaleLinear<number, number>; // D3 scale for x-axis mapping
  numDots?: number; // Number of quantile dots to render (20 or 100)
  ciLower?: number; // Lower CI bound as percentile (0.0-1.0)
  ciUpper?: number; // Upper CI bound as percentile (0.0-1.0)
  showViolin?: boolean; // Show KDE violin overlay (default: true)
  violinOpacity?: number; // Opacity of violin overlay (0.0-1.0)
  colorScheme?: ColorScheme; // Color scheme for threshold-based coloring
}

/**
 * Configuration options for RidgeDotplot component
 */
export interface RidgeDotplotOptions {
  width?: number | null; // Width in pixels, null = use container width
  height?: number; // Total height in pixels
  margin?: Margin; // Margins around plot area
  dotRadius?: number; // Radius of dots in pixels
  ridgeHeight?: number; // Height of each ridge in pixels
  ridgeSpacing?: number; // Vertical spacing between ridges
  numDots?: number; // Number of quantile dots per ridge
  ciLower?: number; // Lower CI bound as percentile (0.0-1.0)
  ciUpper?: number; // Upper CI bound as percentile (0.0-1.0)
  showViolin?: boolean; // Show KDE violin overlay (default: true)
  violinOpacity?: number; // Opacity of violin overlay (0.0-1.0)
  colorScheme?: ColorScheme; // Color scheme for threshold-based coloring
}

/**
 * Configuration options for DraggableCIBounds component
 */
export interface CIBoundsOptions {
  scale?: ScaleLinear<number, number>; // D3 scale for x-axis mapping
  handleRadius?: number; // Radius of drag handles in pixels
  handleColor?: string; // Color of drag handles
  lineColor?: string; // Color of CI bound lines
  lineWidth?: number; // Width of CI bound lines in pixels
  percentileStep?: number; // Snap increment for percentiles (default: 0.01 for 1%)
}

/**
 * Configuration options for ThresholdLine component
 */
export interface ThresholdLineOptions {
  scale?: ScaleLinear<number, number>; // D3 scale for x-axis mapping
  yRange?: [number, number]; // [min, max] y-coordinates for line
  value?: number; // Current threshold value
  lineColor?: string; // Color of threshold line
  lineWidth?: number; // Width of line in pixels
  handleRadius?: number; // Radius of drag handle
  showLabel?: boolean; // Show value label (default: true)
}

/**
 * Configuration options for Tooltip component
 */
export interface TooltipOptions {
  offsetX?: number; // X offset from pointer in pixels
  offsetY?: number; // Y offset from pointer in pixels
  backgroundColor?: string; // Background color
  textColor?: string; // Text color
  borderColor?: string; // Border color
  borderRadius?: number; // Border radius in pixels
  padding?: number; // Internal padding in pixels
  fontSize?: number; // Font size in pixels
  maxWidth?: number; // Maximum width in pixels
}

/**
 * Configuration options for HintArea component
 */
export interface HintAreaOptions {
  position?: [number, number]; // Position [x, y] for the hint trigger
  content?: string; // Content to display (plain text or HTML)
  triggerText?: string; // Trigger icon/text (default: '?')
  triggerColor?: string; // Color of trigger icon
  backgroundColor?: string; // Background color of hint content
  textColor?: string; // Text color of hint content
  maxWidth?: number; // Maximum width of hint content in pixels
  mode?: 'hover' | 'click'; // Interaction mode (default: 'hover')
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'; // Placement relative to trigger
}

/**
 * Menu item for ContextMenu component
 */
export interface ContextMenuItem {
  label: string; // Label text for the menu item
  action?: () => void; // Callback function when item is clicked
  disabled?: boolean; // Whether the item is disabled
  divider?: boolean; // If true, renders as a divider instead of item
}

/**
 * Configuration options for ContextMenu component
 */
export interface ContextMenuOptions {
  items?: ContextMenuItem[]; // Array of menu items
  backgroundColor?: string; // Background color of menu
  textColor?: string; // Text color of menu items
  hoverColor?: string; // Background color on hover
  borderColor?: string; // Border color of menu
  borderRadius?: number; // Border radius in pixels
  fontSize?: number; // Font size in pixels
  minWidth?: number; // Minimum width of menu in pixels
}
