import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

/**
 * Common visualization configuration
 */
export interface BaseVisualizationConfig {
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  responsive?: boolean;
  animationDuration?: number;
  className?: string;
}

/**
 * Base props that all visualizations share
 */
export interface BaseVisualizationProps extends BaseVisualizationConfig {
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
}

/**
 * Common D3 selections and dimensions
 */
export interface D3Context {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  g: d3.Selection<SVGGElement, unknown, null, undefined>;
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

/**
 * Base hook for D3 visualizations
 * Handles common setup, resizing, and cleanup
 */
export function useD3Visualization<T>(
  renderFn: (context: D3Context, data: T) => void,
  data: T | null,
  config: BaseVisualizationConfig = {}
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    width: config.width || 800,
    height: config.height || 400
  });

  const margin = config.margin || { top: 40, right: 40, bottom: 60, left: 80 };

  // Handle responsive sizing
  useEffect(() => {
    if (!config.responsive || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions(prev => ({
          ...prev,
          width: Math.max(300, width) // Min width of 300
        }));
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [config.responsive]);

  // Main rendering effect
  useEffect(() => {
    if (!svgRef.current || !data) return;

    const svg = d3.select(svgRef.current);
    const { width, height } = dimensions;
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Clear previous content
    svg.selectAll("*").remove();

    // Setup SVG dimensions
    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);

    // Create main group
    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create context object
    const context: D3Context = {
      svg,
      g,
      width,
      height,
      innerWidth,
      innerHeight,
      margin
    };

    // Call the render function
    renderFn(context, data);
  }, [data, dimensions, margin, renderFn]);

  return { svgRef, containerRef, dimensions };
} 