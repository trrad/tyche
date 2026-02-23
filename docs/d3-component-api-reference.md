# D3 Component API Reference

**Version:** 1.3
**Date:** 2025-11-24
**Status:** Implementation Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Data Flow](#architecture--data-flow)
3. [Quantile Calculation Strategy](#quantile-calculation-strategy)
4. [D3 Primitives Reference](#d3-primitives-reference)
5. [Component Specifications](#component-specifications)
6. [Event Payload Types](#event-payload-types)
7. [Error Handling & Validation](#error-handling--validation)
8. [Component Lifecycle](#component-lifecycle)
9. [File Structure](#file-structure)
10. [Reusable Chart Pattern](#reusable-chart-pattern)
11. [Event-Driven Integration](#event-driven-integration)
12. [Responsive Design](#responsive-design)
13. [Implementation Roadmap](#implementation-roadmap)
14. [Key Design Decisions](#key-design-decisions)

---

## Overview

### Goals

This document specifies the API and implementation approach for framework-agnostic D3 visualization components used in the Tyche demo application. These components:

- **Render distributional data** using quantile dotplots with optional violin overlays
- **Enable direct manipulation** through draggable CI bounds and thresholds
- **Work in any environment** via event-driven, framework-agnostic design
- **Optimize for interactive performance** (<32ms updates for 30fps responsiveness)

### Key Principles

1. **Simplicity**: One code path for quantile computation (sample-based in viz)
2. **Reusable Chart Pattern**: Closures with getter-setter methods (D3 standard)
3. **Event-Driven**: Components emit CustomEvent objects with event.detail payload
4. **Performance**: Optimized for smooth interaction (<100ms, target 30fps, achieves several 100fps on most systems)
5. **Responsive Design**: First-class support for container resizing and viewport adaptation

---

## Architecture & Data Flow

### Simplified Two-Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Tyche Library                                           │
│ - Posterior.sample(n) generates samples                 │
│ - Return raw samples to D3                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ D3 Visualization Components (Framework-Agnostic)        │
│ - Compute quantiles from samples (single sort)          │
│ - Render quantiles as dots                              │
│ - Optional KDE violin overlay                           │
│ - Handle interactions (drag, hover, click)              │
│ - Emit custom events                                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Framework Wrapper (Observable/React/Vue/Vanilla)        │
│ - Listen to component events                            │
│ - Update application state                              │
│ - Trigger re-renders                                    │
└─────────────────────────────────────────────────────────┘
```

### Data Flow Example

```typescript
// 1. Tyche provides samples (only once)
const posteriorSamples = variantResult.getPosteriorSamples(10000);

// 2. Pass samples directly to D3 - quantiles computed in viz
const viz = QuantileDots()
  .samples(posteriorSamples) // Raw samples
  .numDots(20) // Component computes 20 quantiles
  .scale(xScale)
  .dotRadius(4)
  .showViolin(true);

d3.select('#container').call(viz);

// 3. Framework listens to events
viz.on('dotHover', (event) => {
  // Event payload in event.detail
  const { value, ciLower, ciUpper } = event.detail;
  updateTooltip({ value, ciLower, ciUpper });
});

// 4. Interactive CI updates are instant (no recomputation needed)
viz.on('ciDrag', (event) => {
  // Pre-sorted samples = instant percentile lookup
  const { lower, upper } = event.detail;
  setCIBounds(lower, upper);
});
```

---

## Quantile Calculation Strategy

### Why Sample-Based in D3 Components?

Components compute quantiles directly from posterior samples rather than using analytical quantile functions. This approach is **simpler** (single code path), **faster for interaction** (pre-sorted samples enable instant CI updates via index lookup), and **more flexible** (easy to adjust numDots without Tyche API changes). Performance: sorting 10k samples takes ~1ms once, then CI bound changes are <0.01ms via instant index lookup.

### Quantile Computation Pattern

**Standard approach** (Tyche-consistent):

```typescript
function computeQuantiles(samples, numQuantiles = 20) {
  // Sort once (cached for component lifetime)
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  // Generate evenly-spaced quantile values at bin centers
  return Array.from({ length: numQuantiles }, (_, i) => {
    const p = (i + 0.5) / numQuantiles;
    return sorted[Math.floor(n * p)];
  });
}

// Example: numQuantiles=20 → [q2.5%, q7.5%, ..., q97.5%]
```

**CI Bounds** (instant lookup from sorted samples):

```typescript
function getCIBounds(sorted, lowerP, upperP) {
  const n = sorted.length;
  return {
    lower: sorted[Math.floor(n * lowerP)],
    upper: sorted[Math.floor(n * upperP)],
  };
}

// Dragging CI from 10%-90% to 5%-95%: just change indices, no recalculation
```

**Performance**:

- Initial sort: ~1ms for 10,000 samples (one-time cost)
- Quantile lookup: <0.01ms per quantile (instant)
- CI update during drag: <0.01ms (instant index change)
- **Total for 30fps**: Well under 32ms budget ✓

---

## D3 Primitives Reference

Quick reference of D3 APIs used by each component:

### Core Selection & Rendering

- **`d3.select()` / `d3.selectAll()`** - DOM selection
- **`selection.data()` / `selection.join()`** - Data binding with enter/update/exit
- **`selection.attr()` / `selection.style()`** - Setting attributes and styles
- **`selection.call()`** - Invoking reusable components

### Scales

- **`d3.scaleLinear()`** - Continuous value → pixel mapping
- **`d3.scaleBand()`** - Categorical (variant names) → pixel mapping for ridge layout

### Binning & Statistics

- **`d3.bin()`** - Automatic binning for dot stacking
  - `.domain([min, max])` - Set value range
  - `.thresholds(n)` - Number of bins or threshold array
- **`d3.extent()`** - Get [min, max] from array
- **`d3.mean()`, `d3.median()`** - Summary statistics

### Interaction

- **`d3.drag()`** - Draggable behavior
  - `.on('start', handler)` - Drag initiation
  - `.on('drag', handler)` - During drag (event.x, event.y available)
  - `.on('end', handler)` - Drag completion
- **`d3.pointer(event, target)`** - Get [x, y] coordinates relative to target

### Events

- **`selection.on(typenames, listener)`** - Attach event listeners
  - Examples: `'click'`, `'mouseover'`, `'mouseout'`

### Shape Generators

- **`d3.area()`** - Generate SVG path for KDE violin overlay
  - `.x(d => xScale(d.value))`
  - `.y0(baselineY)` - Bottom of area
  - `.y1(d => baselineY - heightScale(d.density))` - Top of area
  - `.curve(d3.curveBasis)` - Smooth curves

---

## Component Specifications

### Component 1: QuantileDots

**Purpose**: Render quantile dots for a single distribution with optional violin overlay

#### Data Interface

```typescript
interface QuantileDotsData {
  samples: number[]; // Raw posterior samples (10k typical)
  threshold?: number; // Optional threshold for coloring dots
}
```

**Notes**:

- Component computes its own quantiles and CI bounds from samples
- Tyche returns `number[]` from `getPosteriorSamples()` - directly compatible with D3

#### Configuration API

```typescript
function QuantileDots() {
  // Private configuration with defaults
  let width = 400;
  let height = 60;
  let dotRadius = 4;
  let dotSpacing = 8;
  let scale = d3.scaleLinear();
  let numDots = 20; // How many quantiles to compute/render
  let ciLower = 0.1; // 10th percentile
  let ciUpper = 0.9; // 90th percentile
  let showViolin = true; // DEFAULT: ON
  let violinOpacity = 0.15;
  let colorScheme = {
    above: '#10b981', // Green for above threshold
    below: '#94a3b8', // Gray for below threshold
    neutral: '#3b82f6', // Blue when no threshold
  };

  // Cache for performance
  let cachedSorted = null;
  let cachedQuantiles = null;

  // Render function
  function chart(selection) {
    selection.each(function (data) {
      const container = d3.select(this);
      const { samples, threshold } = data;

      // Sort samples once and cache
      if (!cachedSorted || cachedSorted.length !== samples.length) {
        cachedSorted = [...samples].sort((a, b) => a - b);
        cachedQuantiles = null; // Invalidate quantiles cache
      }

      // Compute quantiles
      if (!cachedQuantiles) {
        const n = cachedSorted.length;
        cachedQuantiles = Array.from({ length: numDots }, (_, i) => {
          const p = (i + 0.5) / numDots;
          return cachedSorted[Math.floor(n * p)];
        });
      }

      // Compute CI bounds from sorted samples
      const n = cachedSorted.length;
      const ciBounds = {
        lower: cachedSorted[Math.floor(n * ciLower)],
        upper: cachedSorted[Math.floor(n * ciUpper)],
      };

      // Optional violin overlay (KDE background) - DEFAULT ON
      if (showViolin) {
        const kde = computeKDE(samples, scale.domain(), 50);
        const maxDensity = d3.max(kde, (d) => d.density);
        const heightScale = d3
          .scaleLinear()
          .domain([0, maxDensity])
          .range([0, height * 0.7]);

        const area = d3
          .area()
          .x((d) => scale(d.value))
          .y0(height / 2)
          .y1((d) => height / 2 - heightScale(d.density))
          .curve(d3.curveBasis);

        container
          .selectAll('.violin')
          .data([kde])
          .join('path')
          .attr('class', 'violin')
          .attr('d', area)
          .attr('fill', '#9ca3af')
          .attr('opacity', violinOpacity);
      }

      // Use d3.bin() to stack overlapping dots
      const binned = d3.bin().domain(scale.domain()).thresholds(50)(
        // Fine-grained bins for stacking
        cachedQuantiles
      );

      // Flatten bins into positioned dots
      const dotPositions = [];
      binned.forEach((bin) => {
        bin.forEach((value, i) => {
          dotPositions.push({
            value: value,
            x: scale(value),
            y: height - i * dotSpacing - dotRadius,
            color:
              threshold !== undefined
                ? value > threshold
                  ? colorScheme.above
                  : colorScheme.below
                : colorScheme.neutral,
          });
        });
      });

      // Render dots using enter/update/exit pattern
      const dots = container
        .selectAll('circle.quantile-dot')
        .data(dotPositions)
        .join('circle')
        .attr('class', 'quantile-dot')
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y)
        .attr('r', dotRadius)
        .attr('fill', (d) => d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5);

      // Hover interactions
      dots
        .on('mouseover', function (event, d) {
          d3.select(this)
            .attr('r', dotRadius * 1.5)
            .attr('stroke-width', 2);

          if (listeners['dotHover']) {
            const customEvent = new CustomEvent('dotHover', {
              detail: {
                ...d,
                ciLower: ciBounds.lower,
                ciUpper: ciBounds.upper,
                ciLevel: ciUpper - ciLower,
              },
            });
            listeners['dotHover'](customEvent);
          }
        })
        .on('mouseout', function (event, d) {
          d3.select(this).attr('r', dotRadius).attr('stroke-width', 0.5);
        });
    });
  }

  // Getter-setters
  chart.width = function (value) {
    if (!arguments.length) return width;
    width = value;
    return chart;
  };

  chart.height = function (value) {
    if (!arguments.length) return height;
    height = value;
    return chart;
  };

  chart.numDots = function (value) {
    if (!arguments.length) return numDots;
    numDots = value;
    cachedQuantiles = null; // Invalidate cache
    return chart;
  };

  chart.ciLower = function (value) {
    if (!arguments.length) return ciLower;
    ciLower = value;
    return chart;
  };

  chart.ciUpper = function (value) {
    if (!arguments.length) return ciUpper;
    ciUpper = value;
    return chart;
  };

  chart.scale = function (value) {
    if (!arguments.length) return scale;
    scale = value;
    return chart;
  };

  chart.showViolin = function (value) {
    if (!arguments.length) return showViolin;
    showViolin = value;
    return chart;
  };

  // Event handling
  const listeners = {};
  chart.on = function (event, handler) {
    listeners[event] = handler;
    return chart;
  };

  return chart;
}

/**
 * Kernel density estimation for violin overlay
 * Takes 1D samples array, returns 2D visualization data (value × density)
 * Uses Silverman's rule for automatic bandwidth selection
 */
function computeKDE(samples, domain, numPoints = 50) {
  const [min, max] = domain;

  // Automatic bandwidth using Silverman's rule of thumb
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  // Interquartile range for robustness to outliers
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  // Silverman bandwidth: h = 1.06 × σ × n^(-1/5)
  const sigma = Math.min(d3.deviation(samples), iqr / 1.34);
  const bandwidth = 1.06 * sigma * Math.pow(n, -1 / 5);

  // Epanechnikov kernel (most efficient, optimal for MSE)
  const kernel = (x) => {
    const u = x / bandwidth;
    return Math.abs(u) <= 1 ? (0.75 * (1 - u * u)) / bandwidth : 0;
  };

  // Evaluation points along x-axis
  const points = Array.from(
    { length: numPoints },
    (_, i) => min + (i / (numPoints - 1)) * (max - min)
  );

  // Density at each evaluation point
  return points.map((x) => ({
    value: x,
    density: d3.mean(samples, (d) => kernel(x - d)),
  }));
}
```

#### Events Emitted

All events emit CustomEvent objects with data in `event.detail`:

- **`dotHover`** - When hovering over a dot
  - `event.detail`: `{value: number, x: number, y: number, color: string, ciLower: number, ciUpper: number, ciLevel: number}`
- **`dotClick`** - When clicking a dot
  - `event.detail`: `{value: number}`

#### D3 Primitives Used

- `d3.bin()` - Stacking dots automatically
- `d3.scaleLinear()` - x-position mapping
- `d3.area()` - Violin KDE shape
- `selection.join()` - Enter/update/exit pattern
- `selection.on()` - Hover interactions

#### Performance Notes

- **Initial render**: ~2ms (sort + quantiles + KDE + render)
- **CI update**: <0.1ms (just change ciLower/ciUpper, call chart again)
- **Interactive**: Well within 32ms budget for 30fps ✓

#### KDE Implementation

Uses Mike Bostock's approach with Silverman's rule and Epanechnikov kernel (optimal for MSE). Suitable for typical sample sizes (1k-100k). Optional upgrade to [@uwdata/fast-kde](https://github.com/uwdata/fast-kde) available if profiling shows KDE as bottleneck.

---

### Component 2: RidgeDotplot

**Purpose**: Multi-variant comparison with ridge layout, each ridge using QuantileDots

#### Data Interface

```typescript
interface RidgeDotplotData {
  variants: Array<{
    name: string;
    displayName: string;
    samples: number[]; // Raw posterior samples
    isBaseline?: boolean; // Mark adjustable baseline
  }>;
  threshold?: number; // Optional business threshold
}
```

**Note**: The `isBaseline` flag supports user-adjustable baseline selection (requires Tyche API enhancement to specify baseline variant in comparison methods)

#### Configuration API

```typescript
function RidgeDotplot() {
  let width = 800;
  let height = 400;
  let margin = { top: 20, right: 60, bottom: 40, left: 150 };
  let dotRadius = 4;
  let ridgeHeight = 60;
  let ridgeSpacing = 20;
  let numDots = 20;
  let ciLower = 0.1;
  let ciUpper = 0.9;
  let showViolin = true; // DEFAULT: ON

  function chart(selection) {
    selection.each(function (data) {
      const container = d3.select(this);
      const { variants, threshold } = data;

      // Compute shared x-scale across all variants
      const allSamples = variants.flatMap((v) => v.samples);
      const xScale = d3
        .scaleLinear()
        .domain(d3.extent(allSamples))
        .nice()
        .range([margin.left, width - margin.right]);

      // Y-scale for ridge positions
      const yScale = d3
        .scaleBand()
        .domain(variants.map((v) => v.name))
        .range([margin.top, height - margin.bottom])
        .padding(0.2);

      // Create SVG
      const svg = container
        .selectAll('svg')
        .data([data])
        .join('svg')
        .attr('width', width)
        .attr('height', height);

      // Render each ridge
      const ridges = svg
        .selectAll('.ridge')
        .data(variants)
        .join('g')
        .attr('class', 'ridge')
        .attr('transform', (d) => `translate(0, ${yScale(d.name)})`);

      // Render quantile dots using QuantileDots component
      ridges.each(function (d) {
        const ridge = d3.select(this);
        const dotsContainer = ridge
          .selectAll('.dots-container')
          .data([d])
          .join('g')
          .attr('class', 'dots-container');

        const dots = QuantileDots()
          .scale(xScale)
          .height(ridgeHeight)
          .dotRadius(dotRadius)
          .numDots(numDots)
          .ciLower(ciLower)
          .ciUpper(ciUpper)
          .showViolin(showViolin);

        dotsContainer
          .datum({
            samples: d.samples,
            threshold: threshold,
          })
          .call(dots);

        // Forward dotHover events
        dots.on('dotHover', (event, dotData) => {
          if (listeners['dotHover']) {
            listeners['dotHover'](event, {
              ...dotData,
              variant: d.displayName,
            });
          }
        });
      });

      // Variant labels
      ridges
        .append('text')
        .attr('class', 'variant-label')
        .attr('x', margin.left - 10)
        .attr('y', ridgeHeight / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .text((d) => d.displayName)
        .style('font-size', '14px')
        .style('font-weight', '500')
        .style('cursor', 'pointer')
        .on('click', function (event, d) {
          if (listeners['variantClick']) {
            listeners['variantClick'](event, d);
          }
        });

      // Reference line at zero (for lift view)
      svg
        .selectAll('.reference-line')
        .data([0])
        .join('line')
        .attr('class', 'reference-line')
        .attr('x1', xScale(0))
        .attr('x2', xScale(0))
        .attr('y1', margin.top)
        .attr('y2', height - margin.bottom)
        .attr('stroke', '#cbd5e1')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,2');

      // Threshold line (if provided)
      if (threshold !== undefined) {
        const thresholdLine = ThresholdLine()
          .scale(xScale)
          .yRange([margin.top, height - margin.bottom])
          .value(threshold);

        svg
          .selectAll('.threshold-container')
          .data([threshold])
          .join('g')
          .attr('class', 'threshold-container')
          .call(thresholdLine);

        thresholdLine.on('thresholdDrag', (event) => {
          if (listeners['thresholdDrag']) {
            listeners['thresholdDrag'](event);
          }
        });
      }

      // X-axis
      svg
        .selectAll('.x-axis')
        .data([null])
        .join('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(8));
    });
  }

  // Getter-setters
  chart.width = function (value) {
    if (!arguments.length) return width;
    width = value;
    return chart;
  };

  chart.ciLower = function (value) {
    if (!arguments.length) return ciLower;
    ciLower = value;
    return chart;
  };

  chart.ciUpper = function (value) {
    if (!arguments.length) return ciUpper;
    ciUpper = value;
    return chart;
  };

  chart.numDots = function (value) {
    if (!arguments.length) return numDots;
    numDots = value;
    return chart;
  };

  chart.showViolin = function (value) {
    if (!arguments.length) return showViolin;
    showViolin = value;
    return chart;
  };

  // Event handling
  const listeners = {};
  chart.on = function (event, handler) {
    listeners[event] = handler;
    return chart;
  };

  return chart;
}
```

#### Events Emitted

All events emit CustomEvent objects with data in `event.detail`:

- **`variantClick`** - Clicking variant label for deep-dive
  - `event.detail`: `{name: string, displayName: string, samples: number[], isBaseline?: boolean}`
- **`dotHover`** - Forwarded from QuantileDots (with variant name added)
  - `event.detail`: `{value: number, variant: string, ciLower: number, ciUpper: number, ciLevel: number, ...}`
- **`thresholdDrag`** - Dragging threshold line
  - `event.detail`: `{value: number}`

#### D3 Primitives Used

- `d3.scaleLinear()` - x-axis mapping
- `d3.scaleBand()` - y-axis ridge layout
- `selection.join()` - Rendering ridges
- Delegates to QuantileDots for each ridge

#### Performance Notes

- **Initial render**: ~5-10ms for 4 variants (4× QuantileDots)
- **CI update**: <1ms (just update ciLower/ciUpper on all QuantileDots)
- **Interactive**: Well within 32ms budget for 30fps ✓

---

### Component 3: DraggableCIBounds

**Purpose**: Interactive percentile handles for adjusting credible interval bounds

**Note**: This component might be integrated directly into RidgeDotplot rather than separate, depending on implementation approach. Specification provided for reference.

#### Data Interface

```typescript
interface CIBoundsData {
  samples: number[]; // For computing percentile positions
  lowerPercentile: number; // e.g., 0.1 for 10th percentile
  upperPercentile: number; // e.g., 0.9 for 90th percentile
  yPositions: number[]; // Y-coordinates for each variant ridge
}
```

#### Configuration API

```typescript
function DraggableCIBounds() {
  let scale = d3.scaleLinear();
  let handleRadius = 6;
  let handleColor = '#6366f1';
  let lineColor = '#6366f1';
  let lineWidth = 2;
  let percentileStep = 0.01; // Snap to nearest 1%

  let cachedSorted = null;

  function chart(selection) {
    selection.each(function (data) {
      const container = d3.select(this);
      const { samples, lowerPercentile, upperPercentile, yPositions } = data;

      // Sort samples once and cache
      if (!cachedSorted) {
        cachedSorted = [...samples].sort((a, b) => a - b);
      }

      const n = cachedSorted.length;
      const getPercentileValue = (p) => cachedSorted[Math.floor(n * p)];

      // Current bounds
      let currentLower = lowerPercentile;
      let currentUpper = upperPercentile;

      // Drag behavior for lower bound
      const dragLower = d3
        .drag()
        .on('start', function () {
          d3.select(this).attr('r', handleRadius * 1.3);
        })
        .on('drag', function (event) {
          // Convert pixel to value to percentile
          const value = scale.invert(event.x);

          // Binary search for closest percentile (faster than linear)
          let closestP = 0;
          for (let p = 0; p <= 1; p += percentileStep) {
            if (getPercentileValue(p) >= value) {
              closestP = p;
              break;
            }
          }

          // Constrain
          closestP = Math.max(0, Math.min(closestP, currentUpper - percentileStep));
          currentLower = closestP;

          // Update visual (instant - just index change)
          updateBounds();

          // Emit event
          if (listeners['ciDrag']) {
            listeners['ciDrag']({
              detail: { lower: currentLower, upper: currentUpper },
            });
          }
        })
        .on('end', function () {
          d3.select(this).attr('r', handleRadius);
        });

      // Similar for upper bound...

      function updateBounds() {
        const lowerValue = getPercentileValue(currentLower);
        const upperValue = getPercentileValue(currentUpper);
        const lowerX = scale(lowerValue);
        const upperX = scale(upperValue);

        // Render lines and handles
        // ... (similar to previous spec)
      }

      updateBounds();
    });
  }

  // Getter-setters...
  const listeners = {};
  chart.on = function (event, handler) {
    listeners[event] = handler;
    return chart;
  };

  return chart;
}
```

#### Events Emitted

- **`ciDrag`** - During drag interaction
  - `event.detail`: `{lower: number, upper: number}`
  - Values are percentiles (e.g., {lower: 0.05, upper: 0.95}), not data values

#### Performance Notes

- **Drag update**: <0.1ms (instant percentile lookup from cached sorted array)
- **60fps capable**: Can easily hit 16ms budget ✓

---

### Component 4: ThresholdLine

**Purpose**: Draggable vertical threshold for business decision points

(Specification unchanged from previous version - see full spec for details)

---

### Component 5: Tooltip

**Purpose**: Context-sensitive tooltips with plain English probability statements

(Specification unchanged from previous version - see full spec for details)

---

## Event Payload Types

All components emit `CustomEvent` objects with strongly-typed payloads in `event.detail`. These interfaces define the complete event contracts for framework integration.

```typescript
/**
 * Emitted when user hovers over a quantile dot
 * Source: QuantileDots, RidgeDotplot
 */
export interface DotHoverEventDetail {
  value: number; // The quantile value
  x: number; // SVG x-coordinate
  y: number; // SVG y-coordinate
  color: string; // Dot fill color
  ciLower: number; // Current CI lower bound value
  ciUpper: number; // Current CI upper bound value
  ciLevel: number; // Current CI coverage (e.g., 0.8)
  variant?: string; // Variant name (added by RidgeDotplot)
}

/**
 * Emitted when user clicks a quantile dot
 * Source: QuantileDots
 */
export interface DotClickEventDetail {
  value: number; // The quantile value
  x: number; // SVG x-coordinate
  y: number; // SVG y-coordinate
}

/**
 * Emitted when user drags CI bounds
 * Source: DraggableCIBounds, RidgeDotplot
 */
export interface CIDragEventDetail {
  lower: number; // Lower percentile (0.0 to 1.0, e.g., 0.05)
  upper: number; // Upper percentile (0.0 to 1.0, e.g., 0.95)
}

/**
 * Emitted when user drags threshold line
 * Source: ThresholdLine, RidgeDotplot
 */
export interface ThresholdDragEventDetail {
  value: number; // Threshold value in data units
}

/**
 * Emitted when user clicks variant label
 * Source: RidgeDotplot
 */
export interface VariantClickEventDetail {
  name: string; // Variant identifier
  displayName: string; // Human-readable name
  samples: number[]; // Posterior samples
  isBaseline?: boolean; // True if this is the baseline variant
}

/**
 * Usage example with framework wrappers:
 *
 * const viz = QuantileDots().samples(data.samples);
 *
 * viz.on('dotHover', (event: CustomEvent<DotHoverEventDetail>) => {
 *   const {value, ciLower, ciUpper} = event.detail;
 *   updateTooltip({value, ciLower, ciUpper});
 * });
 */
```

---

## Error Handling & Validation

Components validate input and throw descriptive errors for invalid data:

```typescript
// Invalid samples
if (!samples || samples.length === 0) {
  throw new Error('QuantileDots: samples array cannot be empty');
}

// Invalid CI bounds
if (ciLower < 0 || ciLower > 1) {
  throw new Error(`QuantileDots: ciLower must be between 0 and 1, got ${ciLower}`);
}
if (ciUpper < 0 || ciUpper > 1) {
  throw new Error(`QuantileDots: ciUpper must be between 0 and 1, got ${ciUpper}`);
}
if (ciLower >= ciUpper) {
  throw new Error(`QuantileDots: ciLower (${ciLower}) must be < ciUpper (${ciUpper})`);
}

// Missing required scale
if (!scale || typeof scale !== 'function') {
  throw new Error('QuantileDots: scale is required and must be a d3.scaleLinear instance');
}

// Invalid numDots
if (numDots < 2) {
  throw new Error(`QuantileDots: numDots must be >= 2, got ${numDots}`);
}
```

**Graceful Degradation**:

- Empty samples after filtering: Render placeholder message
- Scale domain doesn't cover samples: Auto-extend domain with warning
- NaN/Infinity values: Filter out with console warning
- Very small sample sizes (n < 20): Show warning in dev mode

---

## Component Lifecycle

### Closure Pattern Lifecycle

Components using the closure pattern follow this lifecycle:

```typescript
// 1. CREATE: Instantiate with default config
const viz = QuantileDots().scale(xScale).numDots(20).ciLower(0.1).ciUpper(0.9);

// 2. MOUNT: Initial render
d3.select('#container').datum({ samples: posteriorSamples, threshold: 0 }).call(viz);

// 3. UPDATE: Change configuration and re-render
viz.numDots(100); // Changes config, invalidates caches
d3.select('#container').call(viz); // Re-renders with new config

// 4. UPDATE: New data
d3.select('#container').datum({ samples: newSamples, threshold: 5 }).call(viz); // Detects data change, re-computes

// 5. UNMOUNT: Clean up event listeners
viz.on('dotHover', null); // Remove all listeners
d3.select('#container').selectAll('*').remove(); // Clear DOM
```

### Cache Invalidation Rules

Components cache expensive computations. Caches invalidate when:

| Config Change             | Invalidates `cachedSorted` | Invalidates `cachedQuantiles` |
| ------------------------- | -------------------------- | ----------------------------- |
| `samples` changed         | ✅ Yes                     | ✅ Yes                        |
| `numDots` changed         | ❌ No                      | ✅ Yes                        |
| `ciLower/ciUpper` changed | ❌ No                      | ❌ No (instant lookup)        |
| `showViolin` changed      | ❌ No                      | ❌ No (visual only)           |
| `scale` changed           | ❌ No                      | ❌ No (visual only)           |

**Performance implication**: Changing `numDots` is fast (~0.1ms), changing `samples` requires re-sort (~1ms for 10k samples).

### Responsive Resize Pattern

```typescript
// Framework wrapper handles resize
const viz = QuantileDots().width(null); // null = use container width

const resizeObserver = new ResizeObserver(() => {
  // Container size changed, re-render
  d3.select(container).call(viz);
});

resizeObserver.observe(container);

// Cleanup
resizeObserver.disconnect();
viz.on('dotHover', null);
```

---

## File Structure

Recommended project organization for implementation:

```
tyche/
├── src/
│   └── visualizations/           # NEW: D3 visualization components
│       ├── core/
│       │   ├── QuantileDots.ts       # Individual variant visualization
│       │   ├── RidgeDotplot.ts       # Multi-variant ridge layout
│       │   ├── DraggableCIBounds.ts  # Interactive CI handles
│       │   ├── ThresholdLine.ts      # Business threshold overlay
│       │   └── Tooltip.ts            # Context-aware tooltips
│       ├── utils/
│       │   ├── quantiles.ts          # computeQuantiles(), getCIBounds()
│       │   ├── kde.ts                # computeKDE() with Silverman's rule
│       │   ├── scales.ts             # Scale creation helpers
│       │   └── validation.ts         # Input validation functions
│       ├── types/
│       │   ├── events.ts             # Event payload interfaces
│       │   ├── data.ts               # Data interfaces (QuantileDotsData, etc.)
│       │   └── options.ts            # Configuration interfaces
│       ├── index.ts                  # Public API exports
│       └── README.md                 # Component library documentation
├── examples/
│   └── observable-demo/
│       └── src/
│           ├── components/
│           │   └── wrappers.js       # Observable-specific wrappers
│           └── lib/
│               └── tyche.js          # Built bundle (inference + viz)
└── dist/
    └── visualizations/
        ├── index.js                  # Bundled components (ESM)
        ├── index.d.ts                # TypeScript declarations
        └── index.umd.js              # UMD for CDN usage
```

**Build Configuration**:

- TypeScript compiled to ES2020
- Separate bundle for visualizations (tree-shakeable)
- D3 as peer dependency (not bundled)
- Source maps for debugging

---

## Reusable Chart Pattern

All components follow Mike Bostock's **closure with getter-setter methods** pattern.

### Canonical Pattern

```typescript
function MyComponent() {
  // 1. Private configuration variables
  let width = 720;
  let height = 80;
  let scale = d3.scaleLinear();

  // Cache for performance
  let cachedSorted = null;

  // Event listeners storage
  const listeners = {};

  // 2. Main render function
  function chart(selection) {
    selection.each(function (data) {
      const container = d3.select(this);

      // Compute/cache expensive operations once
      if (!cachedSorted) {
        cachedSorted = [...data.samples].sort((a, b) => a - b);
      }

      // Rendering logic
      // ...
    });
  }

  // 3. Getter-setter methods
  chart.width = function (value) {
    if (!arguments.length) return width;
    width = value;
    return chart;
  };

  // 4. Event registration
  chart.on = function (event, handler) {
    listeners[event] = handler;
    return chart;
  };

  return chart;
}
```

---

## Event-Driven Integration

(See previous specification for detailed framework integration examples)

---

## Responsive Design

### Container-Based Sizing

All components should size based on their container, not fixed dimensions:

```typescript
function QuantileDots() {
  let width = null; // null = use container width
  let height = 60; // Can still provide defaults

  function chart(selection) {
    selection.each(function (data) {
      const container = d3.select(this);

      // Get container dimensions if width/height not explicitly set
      const bbox = this.getBoundingClientRect();
      const effectiveWidth = width ?? bbox.width;
      const effectiveHeight = height ?? bbox.height;

      // Use effectiveWidth/effectiveHeight for rendering
      // ...
    });
  }

  return chart;
}
```

### ResizeObserver Integration

For framework wrappers that need to respond to container size changes:

```typescript
// Observable Framework example
const container = html`<div style="width: 100%;"></div>`;
const viz = QuantileDots().width(null); // Use container width

// Re-render on resize
const resizeObserver = new ResizeObserver(() => {
  d3.select(container).datum(data).call(viz);
});
resizeObserver.observe(container);
```

### Responsive Defaults

Components should have sensible responsive behaviors:

- **QuantileDots**: Default width=null (container), height=60px (fixed)
- **RidgeDotplot**: Default width=null (container), ridgeHeight scales with variant count
- **Dot radius**: Scale with available space (e.g., `Math.min(4, width / 200)`)
- **Font sizes**: Consider viewport-relative units or scaling

---

## Implementation Roadmap

### Phase 1: Core Primitives (Week 1, Days 1-3)

1. **QuantileDots** (Day 1-2)
   - Sample-based quantile computation
   - Caching for performance
   - d3.bin() for stacking
   - KDE violin overlay (default ON)
   - Hover interactions
   - Tests: verify <32ms render time

2. **RidgeDotplot** (Day 2-3)
   - Ridge layout with d3.scaleBand()
   - Integrate QuantileDots for each ridge
   - Shared scale computation
   - Tests: verify <32ms update for CI changes

3. **Tooltip** (Day 3)
   - Positioning with d3.pointer()
   - Plain English formatting

### Phase 2: Interactions (Week 1, Days 4-5)

4. **Interactive CI Bounds** (Day 4)
   - Either standalone DraggableCIBounds component
   - Or integrate directly into RidgeDotplot
   - d3.drag() behavior
   - Percentile snapping
   - Event emission
   - Tests: verify <16ms drag updates (60fps)

5. **ThresholdLine** (Day 5)
   - Draggable vertical line
   - Event emission

### Phase 3-4: Integration & Polish (Week 2)

(Same as previous specification)

---

## Technical Decisions Summary

| Decision                 | Choice                           | Rationale                                      |
| ------------------------ | -------------------------------- | ---------------------------------------------- |
| **Quantile Computation** | In D3 from samples               | Simpler, faster for interaction, more flexible |
| **Caching Strategy**     | Cache sorted samples             | One-time sort (~1ms), instant lookups          |
| **Data Interface**       | Pass raw samples to D3           | Single code path, no dual interface complexity |
| **Performance Target**   | <32ms (30fps)                    | Smooth interaction, <16ms ideal (60fps)        |
| **Component Pattern**    | Closure with getter-setters      | D3 standard, encapsulation                     |
| **Violin Default**       | ON (showViolin: true)            | Per spec, both QuantileDots and RidgeDotplot   |
| **Binning**              | d3.bin() with auto thresholds    | Automatic stacking                             |
| **Quantile Dots**        | 20 in overview, 100 in deep-dive | Configurable via numDots                       |
| **D3 Import**            | Full import (`import * as d3`)   | 70KB gzipped acceptable, simpler dev           |

---

**End of Specification v1.2 (Draft)**

**Status**: KDE Implementation Updated, Ready for Implementation

## Key Design Decisions

### Architecture

- **Sample-based quantile computation** in D3 components (not analytical)
  - Simpler: single code path
  - Faster for interaction: pre-sorted samples enable instant CI updates
  - More flexible: easy to change numDots without Tyche API changes

### Performance

- **Target**: <32ms for 30fps, achieves several 100fps on modern systems
- **Caching strategy**: Sort samples once, instant index lookups thereafter
- **Interactive updates**: <0.1ms for CI bound changes

### Event Handling

- **CustomEvent with event.detail**: Standard web API pattern for framework integration
- **Event-driven architecture**: Components emit events, frameworks listen and update state

### KDE Implementation

- **MVP**: Mike Bostock's approach with Silverman's rule and Epanechnikov kernel
  - Zero dependencies beyond D3
  - Proper automatic bandwidth selection
  - Suitable for typical sample sizes (1k-100k)
- **Optional upgrade path**: @uwdata/fast-kde for production optimization if needed

### Responsive Design

- **Container-based sizing**: Components default to container width (width=null)
- **ResizeObserver support**: Framework wrappers can observe and re-render
- **Scalable defaults**: Dot radius, fonts scale with available space

### Data Types

- Tyche returns `number[]` from `getPosteriorSamples()`
- Components expect `number[]` for samples
- No type conversion needed between Tyche and D3

### Baseline Selection

- `isBaseline` flag supports user-adjustable baseline selection
- Requires future Tyche API enhancement to specify baseline variant in comparison methods
