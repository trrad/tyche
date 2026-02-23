/**
 * RidgeDotplot - Multi-variant ridge plot using QuantileDots
 *
 * Framework-agnostic D3 component using Mike Bostock's reusable chart pattern.
 * Renders multiple variants in a ridge layout for easy comparison.
 */

import * as d3 from 'd3';
import { QuantileDots } from './QuantileDots.js';
import { ThresholdLine } from './ThresholdLine.js';
import { DraggableCIBounds } from './DraggableCIBounds.js';
import {
  getPercentile,
  convertPercentToEffect,
  convertEffectToPercent,
  makeEditable,
  parsePercentInput,
  parseDollarInput,
} from '../utils/index.js';
import {
  formatValue,
  describeLiftDirection,
  formatThresholdProbability,
} from '../utils/plainEnglish.js';
import type { RidgeDotplotData, VariantData } from '../types/index.js';

export interface VariantClickEventDetail {
  variant: VariantData;
  index: number;
}

/**
 * Create a RidgeDotplot component
 *
 * @returns Reusable chart function with getter-setter methods
 *
 * @example
 * ```ts
 * const ridge = RidgeDotplot()
 *   .width(800)
 *   .ridgeHeight(60)
 *   .numDots(20);
 *
 * d3.select('#container')
 *   .datum({
 *     variants: [
 *       { name: 'control', displayName: 'Control', samples: [...] },
 *       { name: 'treatment', displayName: 'Treatment', samples: [...] }
 *     ],
 *     threshold: 0.10
 *   })
 *   .call(ridge);
 *
 * ridge.on('variantClick', (event) => {
 *   console.log('Clicked variant:', event.detail.variant.displayName);
 * });
 * ```
 */
export function RidgeDotplot() {
  // Configuration with defaults
  let width: number | null = null; // null = use container width
  let height: number | null = null; // null = auto-compute from variant count
  let margin = { top: 60, right: 80, bottom: 70, left: 60 }; // Top margin increased for dollar axis
  let dotRadius = 3; // Reduced from 4 for less visual prominence
  let ridgeHeight = 120; // Increased for better readability
  let ridgeSpacing = 15; // Reduced from 20 for tighter layout
  let numDots = 20;
  let ciLower = 0.1; // 10th percentile
  let ciUpper = 0.9; // 90th percentile
  let showViolin = true; // DEFAULT: ON
  let showReferenceLineAtZero = true; // For lift view
  let showCIBounds = true; // Show draggable CI bound indicators
  let showStatistics = true; // Show inline median/CI/probability text
  let showTooltip = true; // Enable built-in tooltips
  let scale: d3.ScaleLinear<number, number> | null = null;
  let valueFormat: ((value: number) => string) | null = null; // Custom value formatter

  // Event listeners storage
  const listeners: Record<string, (event: CustomEvent) => void> = {};

  /**
   * Main render function
   */
  function chart(selection: d3.Selection<any, RidgeDotplotData, any, any>) {
    selection.each(function (data: RidgeDotplotData) {
      const container = d3.select(this);
      const { variants, threshold } = data;

      if (!variants || variants.length === 0) {
        console.warn('RidgeDotplot: No variants provided');
        return;
      }

      // Determine effective dimensions
      const containerElement = this as HTMLElement;
      const bbox = containerElement.getBoundingClientRect();
      const effectiveWidth = width ?? bbox.width ?? 800;
      const computedRidgeHeight = ridgeHeight;
      // Add extra space for statistics if enabled (median + CI + threshold prob)
      const extraStatSpace = showStatistics ? 35 : 0;
      const totalRidgeArea =
        variants.length * (computedRidgeHeight + ridgeSpacing + extraStatSpace);
      const effectiveHeight = height ?? totalRidgeArea + margin.top + margin.bottom;

      // Compute shared x-scale across all variants
      const allSamples = variants.flatMap((v) => v.samples);

      // Filter out extreme outliers (beyond 3 std deviations) for better scaling
      const mean = d3.mean(allSamples) || 0;
      const stdDev = d3.deviation(allSamples) || 0;
      const filteredSamples = allSamples.filter((s) => Math.abs(s - mean) <= 3 * stdDev);

      const extent = d3.extent(filteredSamples.length > 0 ? filteredSamples : allSamples) as [
        number,
        number,
      ];

      // Add reasonable padding (10%) instead of .nice() which can extend too far
      const range = extent[1] - extent[0];
      const padding = range * 0.1;

      const xScale =
        scale ||
        d3
          .scaleLinear()
          .domain([extent[0] - padding, extent[1] + padding])
          .range([margin.left, effectiveWidth - margin.right]);

      // Y-scale for ridge positions
      const yScale = d3
        .scaleBand()
        .domain(variants.map((v) => v.name))
        .range([margin.top, effectiveHeight - margin.bottom])
        .paddingInner(ridgeSpacing / computedRidgeHeight)
        .paddingOuter(0.1);

      // Create or update SVG
      let svg = container.select<SVGSVGElement>('svg.ridge-dotplot-svg');
      if (svg.empty()) {
        svg = container
          .append('svg')
          .attr('class', 'ridge-dotplot-svg')
          .attr('width', effectiveWidth)
          .attr('height', effectiveHeight)
          .style('background-color', '#ffffff');
      } else {
        svg.attr('width', effectiveWidth).attr('height', effectiveHeight);
      }

      // Add seaborn-style grid background
      const gridGroup = svg
        .selectAll('.grid-background')
        .data([null])
        .join('g')
        .attr('class', 'grid-background');

      // Vertical gridlines
      const xTicks = xScale.ticks(10);
      gridGroup
        .selectAll('.grid-line-vertical')
        .data(xTicks)
        .join('line')
        .attr('class', 'grid-line-vertical')
        .attr('x1', (d) => xScale(d))
        .attr('x2', (d) => xScale(d))
        .attr('y1', margin.top)
        .attr('y2', effectiveHeight - margin.bottom)
        .attr('stroke', '#e5e7eb')
        .attr('stroke-width', 1)
        .attr('opacity', 0.5);

      // Horizontal gridlines (subtle)
      const yTicks = yScale.domain();
      gridGroup
        .selectAll('.grid-line-horizontal')
        .data(yTicks)
        .join('line')
        .attr('class', 'grid-line-horizontal')
        .attr('x1', margin.left)
        .attr('x2', effectiveWidth - margin.right)
        .attr('y1', (d) => (yScale(d) || 0) + computedRidgeHeight / 2)
        .attr('y2', (d) => (yScale(d) || 0) + computedRidgeHeight / 2)
        .attr('stroke', '#f3f4f6')
        .attr('stroke-width', 1)
        .attr('opacity', 0.3);

      // Reference line at zero (for lift view)
      if (showReferenceLineAtZero && xScale.domain()[0] <= 0 && xScale.domain()[1] >= 0) {
        svg
          .selectAll('.reference-line')
          .data([0])
          .join('line')
          .attr('class', 'reference-line')
          .attr('x1', xScale(0))
          .attr('x2', xScale(0))
          .attr('y1', margin.top)
          .attr('y2', effectiveHeight - margin.bottom)
          .attr('stroke', '#cbd5e1')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,2')
          .attr('opacity', 0.6);
      } else {
        svg.selectAll('.reference-line').remove();
      }

      // Calculate threshold effect once (shared across all variants)
      // Uses median control baseline for consistent $ ↔ % conversion
      let thresholdEffect: number | undefined;
      const firstVariantWithControl = variants.find(
        (v) => v.controlSamples && v.controlSamples.length > 0
      );
      if (
        threshold !== undefined &&
        threshold !== null &&
        firstVariantWithControl?.controlSamples
      ) {
        thresholdEffect = convertPercentToEffect(threshold, firstVariantWithControl.controlSamples);
      }

      // Render ridges
      const ridges = svg
        .selectAll<SVGGElement, VariantData>('.ridge')
        .data(variants, (d: VariantData) => d.name)
        .join('g')
        .attr('class', 'ridge')
        .attr('transform', (d) => `translate(0, ${yScale(d.name)})`);

      // Render quantile dots for each ridge
      ridges.each(function (variantData, idx) {
        const ridge = d3.select(this);

        // Create container for QuantileDots
        const dotsContainer = ridge
          .selectAll('.dots-container')
          .data([variantData])
          .join('g')
          .attr('class', 'dots-container');

        // Create QuantileDots component
        const dots = QuantileDots()
          .width(effectiveWidth - margin.left - margin.right)
          .scale(xScale)
          .height(computedRidgeHeight)
          .dotRadius(dotRadius)
          .numDots(numDots)
          .ciLower(ciLower)
          .ciUpper(ciUpper)
          .showViolin(showViolin)
          .showTooltip(showTooltip);

        // Render
        dotsContainer
          .datum({
            samples: variantData.samples,
            threshold,
            effectSamples: variantData.effectSamples, // Pass $ effect samples for integrated tooltips
            thresholdEffect, // Pre-calculated $ value at threshold (shared across all variants)
          })
          .call(dots);

        // Get KDE data from QuantileDots for density-contoured CI region
        const kdeData = dots.getKDE();

        // Forward dotHover events with variant information
        dots.on('dotHover', (event: CustomEvent) => {
          if (listeners['dotHover']) {
            const detail = {
              ...event.detail,
              variant: variantData.displayName,
              variantIndex: idx,
            };
            const customEvent = new CustomEvent('dotHover', { detail });
            listeners['dotHover'](customEvent);
          }
        });

        // Forward dotClick events
        dots.on('dotClick', (event: CustomEvent) => {
          if (listeners['dotClick']) {
            const detail = {
              ...event.detail,
              variant: variantData.displayName,
              variantIndex: idx,
            };
            const customEvent = new CustomEvent('dotClick', { detail });
            listeners['dotClick'](customEvent);
          }
        });

        // Add CI bound indicators (if enabled) - show on all treatments
        if (showCIBounds) {
          // Add draggable bounds on all ridges (drag on one adjusts all via event system)
          const ciBoundsContainer = ridge
            .selectAll('.ci-bounds-container')
            .data([variantData])
            .join('g')
            .attr('class', 'ci-bounds-container');
          // No transform needed - ridge is already positioned, and xScale includes margin

          const ciBounds = DraggableCIBounds()
            .scale(xScale)
            .samples(variantData.samples)
            .lowerPercentile(ciLower)
            .upperPercentile(ciUpper)
            .yRange([0, computedRidgeHeight])
            .showTooltip(false); // Disable tooltips on CI bounds

          ciBoundsContainer.call(ciBounds);

          // Forward CI drag events (all ridges forward, but RidgeDotplot updates all)
          ciBounds.on('ciDrag', (event: CustomEvent) => {
            if (listeners['ciDrag']) {
              listeners['ciDrag'](event);
            }
          });
        }

        // Add inline statistics (if enabled)
        if (showStatistics) {
          const sorted = [...variantData.samples].sort((a, b) => a - b);
          const ciLowerValue = getPercentile(sorted, ciLower);
          const ciUpperValue = getPercentile(sorted, ciUpper);

          // Compute mean effect ($ lift) from paired effectSamples
          // effectSamples must always be provided - fail fast if missing
          if (!variantData.effectSamples || variantData.effectSamples.length === 0) {
            throw new Error(
              `Missing effectSamples for variant "${variantData.name}". ` +
                `All variants must provide both samples (% lift) and effectSamples ($ lift).`
            );
          }
          if (!variantData.controlSamples || variantData.controlSamples.length === 0) {
            throw new Error(
              `Missing controlSamples for variant "${variantData.name}". ` +
                `controlSamples needed to compute unbiased percent lift estimate.`
            );
          }

          const effectMean = d3.mean(variantData.effectSamples);
          const controlMean = d3.mean(variantData.controlSamples);

          // Compute unbiased percent lift: E[effect] / E[control]
          // NOT E[(treatment-control)/control] which is biased by Jensen's inequality
          const mean = controlMean !== 0 ? effectMean / controlMean : 0;

          // Store mean for label use
          (variantData as any)._mean = mean;

          const dollarLift =
            effectMean >= 0 ? `+$${effectMean.toFixed(2)}` : `-$${Math.abs(effectMean).toFixed(2)}`;
          const pctValue = Math.abs(mean * 100).toFixed(0);
          const triangle = mean >= 0 ? '▲' : '▼';
          const meanColor = mean >= 0 ? '#10b981' : '#ef4444'; // Green/red for positive/negative lift

          // Render density-contoured CI region (replaces horizontal bar)
          if (kdeData && kdeData.length > 0) {
            // Calculate density scale to match violin rendering
            const maxDensity = d3.max(kdeData, (d) => d.density) || 1;
            const heightScale = d3
              .scaleLinear()
              .domain([0, maxDensity])
              .range([0, computedRidgeHeight * 0.9]);

            // Helper: interpolate density at exact value
            const getDensityAt = (targetValue: number): number => {
              // Find nearest KDE points
              let i = 0;
              while (i < kdeData.length - 1 && kdeData[i].value < targetValue) i++;

              if (i === 0) return kdeData[0].density;
              if (i >= kdeData.length) return kdeData[kdeData.length - 1].density;

              // Linear interpolation
              const x0 = kdeData[i - 1].value;
              const x1 = kdeData[i].value;
              const y0 = kdeData[i - 1].density;
              const y1 = kdeData[i].density;
              const t = (targetValue - x0) / (x1 - x0);
              return y0 + t * (y1 - y0);
            };

            // Get exact densities at CI bounds
            const lowerDensity = getDensityAt(ciLowerValue);
            const upperDensity = getDensityAt(ciUpperValue);

            // Filter KDE points to CI bounds region (inclusive)
            const kdeInCI = kdeData.filter(
              (d) => d.value >= ciLowerValue && d.value <= ciUpperValue
            );

            if (kdeInCI.length > 0 || true) {
              // Create closed path: baseline → up KDE curve → back to baseline
              const pathData: string[] = [];

              // Start at baseline, left edge (exact CI bound)
              pathData.push(`M ${xScale(ciLowerValue)},${computedRidgeHeight - 5}`);

              // Up to the curve at lower bound
              const lowerY = computedRidgeHeight - heightScale(lowerDensity) - 5;
              pathData.push(`L ${xScale(ciLowerValue)},${lowerY}`);

              // Trace along KDE curve
              kdeInCI.forEach((d) => {
                const y = computedRidgeHeight - heightScale(d.density) - 5;
                pathData.push(`L ${xScale(d.value)},${y}`);
              });

              // Down to baseline at upper bound
              const upperY = computedRidgeHeight - heightScale(upperDensity) - 5;
              pathData.push(`L ${xScale(ciUpperValue)},${upperY}`);
              pathData.push(`L ${xScale(ciUpperValue)},${computedRidgeHeight - 5}`);

              // Close path
              pathData.push('Z');

              // Render filled region (subtle, non-dominating)
              ridge
                .selectAll('.ci-density-region')
                .data([pathData.join(' ')])
                .join('path')
                .attr('class', 'ci-density-region')
                .attr('d', (d) => d)
                .attr('fill', '#3b82f6')
                .attr('fill-opacity', 0.08)
                .attr('stroke', '#3b82f6')
                .attr('stroke-width', 0.5)
                .attr('stroke-opacity', 0.3)
                .attr('pointer-events', 'none');

              // Add subtle vertical line at mean (expected value reference, no dot)
              ridge
                .selectAll('.mean-reference')
                .data([mean])
                .join('line')
                .attr('class', 'mean-reference')
                .attr('x1', xScale(mean))
                .attr('x2', xScale(mean))
                .attr('y1', 0)
                .attr('y2', computedRidgeHeight)
                .attr('stroke', '#3b82f6')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '4,2')
                .attr('opacity', 0.5)
                .attr('pointer-events', 'none');
            }
          } else {
            // Fallback: no KDE available, remove density region
            ridge.selectAll('.ci-density-region').remove();
            ridge.selectAll('.mean-reference').remove();
          }

          // Consolidated 3-line label: expected value (mean) with dollar + percent
          const labelX = xScale(mean) + 6;
          const labelY = -8; // Align top of label group with top of ridge (at blue line level)

          // Create/update label group
          const labelGroup = ridge
            .selectAll('.mean-label-group')
            .data([mean])
            .join('g')
            .attr('class', 'mean-label-group')
            .attr('transform', `translate(${labelX}, ${labelY})`);

          // Remove old text element if it exists
          labelGroup.selectAll('text').remove();

          // Line 1: "expected value" (tertiary - subdued gray, normal weight)
          labelGroup
            .append('text')
            .attr('x', 0)
            .attr('y', 0)
            .attr(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .attr('fill', '#9ca3af')
            .attr('text-anchor', 'start')
            .text('expected value');

          // Line 2: Dollar value with "/user" suffix (primary - color for $, blue for suffix)
          const line2 = labelGroup
            .append('text')
            .attr('x', 0)
            .attr('y', 15) // Standard line height (1.5em from 10px base)
            .attr(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .attr('text-anchor', 'start');

          line2
            .append('tspan')
            .attr('font-size', '13px')
            .attr('font-weight', '700')
            .attr('fill', meanColor)
            .text(dollarLift);

          line2
            .append('tspan')
            .attr('font-size', '13px')
            .attr('font-weight', '700')
            .attr('fill', '#3b82f6') // Blue to associate with expected value line
            .text('/user');

          // Line 3: Percent lift with arrow glyph and direction (matches dollar label styling)
          const directionWord = effectMean >= 0 ? 'increase' : 'decrease';
          labelGroup
            .append('text')
            .attr('x', 0)
            .attr('y', 30) // Standard line height (1.5em from 13px ~= 15px spacing)
            .attr(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .attr('font-size', '13px')
            .attr('font-weight', '700')
            .attr('fill', meanColor) // Use same color logic as dollar value
            .attr('text-anchor', 'start')
            .text(`${triangle}${pctValue}% ${directionWord}`);

          // Remove old label formats
          ridge.selectAll('.median-label-top').remove();
          ridge.selectAll('.median-label-bottom').remove();
          ridge.selectAll('.median-label-top-suffix').remove();
          ridge.selectAll('.median-label').remove();

          // Add CI bound labels at the bound positions (for all variants)
          const formatter = valueFormat || formatValue;

          // Convert CI bound % values to $ using median control baseline
          const effectLower = variantData.controlSamples
            ? convertPercentToEffect(ciLowerValue, variantData.controlSamples)
            : 0;
          const effectUpper = variantData.controlSamples
            ? convertPercentToEffect(ciUpperValue, variantData.controlSamples)
            : 0;

          // Left CI bound - $ label at top
          ridge
            .selectAll('.ci-lower-label-top')
            .data([effectLower])
            .join('text')
            .attr('class', 'ci-lower-label-top')
            .attr('x', xScale(ciLowerValue))
            .attr('y', -10) // Above ridge
            .attr('text-anchor', 'middle')
            .attr(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .attr('fill', '#9ca3af')
            .text((d) => (d >= 0 ? `$${d.toFixed(2)}` : `-$${Math.abs(d).toFixed(2)}`));

          // Left CI bound - % label at bottom
          ridge
            .selectAll('.ci-lower-label')
            .data([ciLowerValue])
            .join('text')
            .attr('class', 'ci-lower-label')
            .attr('x', xScale(ciLowerValue))
            .attr('y', computedRidgeHeight + 15)
            .attr('text-anchor', 'middle')
            .attr(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .attr('fill', '#9ca3af')
            .text((d) => formatter(d));

          // Right CI bound - $ label at top
          ridge
            .selectAll('.ci-upper-label-top')
            .data([effectUpper])
            .join('text')
            .attr('class', 'ci-upper-label-top')
            .attr('x', xScale(ciUpperValue))
            .attr('y', -10) // Above ridge
            .attr('text-anchor', 'middle')
            .attr(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .attr('fill', '#9ca3af')
            .text((d) => (d >= 0 ? `$${d.toFixed(2)}` : `-$${Math.abs(d).toFixed(2)}`));

          // Right CI bound - % label at bottom
          ridge
            .selectAll('.ci-upper-label')
            .data([ciUpperValue])
            .join('text')
            .attr('class', 'ci-upper-label')
            .attr('x', xScale(ciUpperValue))
            .attr('y', computedRidgeHeight + 15)
            .attr('text-anchor', 'middle')
            .attr(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .attr('font-size', '10px')
            .attr('font-weight', '500')
            .attr('fill', '#9ca3af')
            .text((d) => formatter(d));

          // Remove old threshold shading - will be replaced by violin split
          ridge.selectAll('.threshold-shaded-region').remove();
          ridge.selectAll('.threshold-probability-label').remove();

          // Probability labels will be added as part of violin split implementation
        }
      });

      // Variant labels with click interaction - positioned top-left of ridge
      ridges
        .selectAll('.variant-label')
        .data((d) => [d])
        .join('text')
        .attr('class', 'variant-label')
        .attr('x', 10) // 10px from left edge
        .attr('y', -5) // Above the ridge area
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'hanging')
        .text((d) => d.displayName)
        .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
        .style('font-size', '15px')
        .style('font-weight', (d) => (d.isBaseline ? '700' : '600'))
        .style('fill', (d) => (d.isBaseline ? '#111827' : '#374151'))
        .style('cursor', 'pointer')
        .on('click', function (event, d) {
          const idx = variants.findIndex((v) => v.name === d.name);
          if (listeners['variantClick']) {
            const detail: VariantClickEventDetail = {
              variant: d,
              index: idx,
            };
            const customEvent = new CustomEvent('variantClick', { detail });
            listeners['variantClick'](customEvent);
          }
        });

      // Sample size information below variant label
      ridges
        .selectAll('.variant-sample-size')
        .data((d) => [d])
        .join('text')
        .attr('class', 'variant-sample-size')
        .attr('x', 10) // Aligned with variant name
        .attr('y', 13) // Below variant name
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'hanging')
        .text((d) => {
          if (d.userCount && d.converterCount) {
            return `${d.userCount.toLocaleString()} users · ${d.converterCount.toLocaleString()} converters`;
          } else if (d.userCount) {
            return `${d.userCount.toLocaleString()} users`;
          }
          return '';
        })
        .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
        .style('font-size', '12px')
        .style('font-weight', '400')
        .style('fill', '#6b7280')
        .style('cursor', 'pointer')
        .on('click', function (event, d) {
          const idx = variants.findIndex((v) => v.name === d.name);
          if (listeners['variantClick']) {
            const detail: VariantClickEventDetail = {
              variant: d,
              index: idx,
            };
            const customEvent = new CustomEvent('variantClick', { detail });
            listeners['variantClick'](customEvent);
          }
        });

      // Threshold line (if provided)
      if (threshold !== undefined && threshold !== null) {
        const thresholdGroup = svg
          .selectAll('.threshold-container')
          .data([threshold])
          .join('g')
          .attr('class', 'threshold-container');

        // Use first variant's samples for $ conversion (all variants should have same relationship)
        const firstVariant = variants[0];

        const thresholdLine = ThresholdLine()
          .scale(xScale)
          .yRange([margin.top, effectiveHeight - margin.bottom])
          .value(threshold)
          .samples(firstVariant.samples)
          .controlSamples(firstVariant.controlSamples);

        thresholdGroup.call(thresholdLine);

        // Forward threshold drag events
        thresholdLine.on('thresholdDrag', (event: CustomEvent) => {
          if (listeners['thresholdDrag']) {
            listeners['thresholdDrag'](event);
          }
        });

        // Remove threshold annotation labels - probability labels at ridge intersections are sufficient
        // The "58% chance above" labels at each ridge provide the key insight without cluttering the top
        svg.selectAll('.threshold-labels').remove();
      } else {
        svg.selectAll('.threshold-container').remove();
        svg.selectAll('.threshold-labels').remove();
      }

      // Add X-axis with thicker lines (neobrutalist style)
      const xAxis = d3
        .axisBottom(xScale)
        .ticks(10)
        .tickFormat((d) =>
          valueFormat ? valueFormat(Number(d)) : `${(Number(d) * 100).toFixed(0)}%`
        );
      const xAxisGroup = svg
        .selectAll<SVGGElement, null>('.x-axis')
        .data([null])
        .join('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0, ${effectiveHeight - margin.bottom})`);

      xAxisGroup.call(xAxis as any);

      // Style axis with consistent typography and thicker lines
      xAxisGroup.select('.domain').attr('stroke-width', 2).attr('stroke', '#374151');
      xAxisGroup.selectAll('.tick line').attr('stroke-width', 2).attr('stroke', '#374151');
      xAxisGroup
        .selectAll('.tick text')
        .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
        .style('font-size', '12px')
        .style('font-weight', '400');

      // Add special threshold tick to bottom axis if threshold is set
      if (threshold !== undefined) {
        const thresholdX = xScale(threshold);
        const labelOffset = 10; // Horizontal offset for label
        const labelY = 40; // Vertical distance from axis

        // Add taller tick line for threshold
        xAxisGroup
          .selectAll('.threshold-tick-line')
          .data([threshold])
          .join('line')
          .attr('class', 'threshold-tick-line')
          .attr('x1', thresholdX)
          .attr('x2', thresholdX)
          .attr('y1', 0)
          .attr('y2', 12) // Taller than normal ticks (which are 6px)
          .attr('stroke', '#374151');

        // Add angled connector line (elbow style)
        xAxisGroup
          .selectAll('.threshold-connector')
          .data([threshold])
          .join('path')
          .attr('class', 'threshold-connector')
          .attr(
            'd',
            `M ${thresholdX} 12 L ${thresholdX} ${labelY - 10} L ${thresholdX + labelOffset} ${labelY - 2}`
          )
          .attr('stroke', '#9ca3af')
          .attr('stroke-width', 1.5)
          .attr('fill', 'none');

        // Remove old threshold label and input containers to prevent ghost labels and stale event listeners
        xAxisGroup.selectAll('.threshold-tick-label').remove();
        xAxisGroup.selectAll('.editable-label-input-container').remove();

        // Add threshold label (no background) - editable
        const thresholdLabel = xAxisGroup
          .append('text')
          .attr('class', 'threshold-tick-label')
          .attr('x', thresholdX + labelOffset)
          .attr('y', labelY)
          .attr('text-anchor', 'start'); // Left-aligned from connector

        // Apply editable functionality to the label
        makeEditable(thresholdLabel, {
          initialValue: threshold,
          displayFormat: (value) => {
            const rounded = Math.abs(value) < 0.0005 ? 0 : value;
            return `${(rounded * 100).toFixed(0)}%`;
          },
          parseInput: parsePercentInput,
          validate: (value) => {
            const domain = xScale.domain();
            if (value < domain[0] || value > domain[1]) {
              return `Threshold must be between ${(domain[0] * 100).toFixed(0)}% and ${(domain[1] * 100).toFixed(0)}%`;
            }
            return null;
          },
          onChange: (newValue) => {
            // Update the threshold and re-render
            data.threshold = newValue;
            chart(selection as any);
          },
          fontSize: '12px',
          fontWeight: '600',
          fill: '#374151',
          cursor: 'pointer',
        });

        // Hide normal axis tick labels that are too close to threshold
        const tickThreshold = 0.03; // Hide ticks within 3% of threshold
        xAxisGroup.selectAll('.tick text').each(function () {
          const tickText = d3.select(this);
          const tickValue = parseFloat(tickText.text().replace('%', '')) / 100;
          if (!isNaN(tickValue) && Math.abs(tickValue - threshold) < tickThreshold) {
            tickText.style('opacity', '0');
          } else {
            tickText.style('opacity', '1');
          }
        });
      } else {
        // Remove threshold tick if no threshold
        xAxisGroup.selectAll('.threshold-tick-line').remove();
        xAxisGroup.selectAll('.threshold-tick-label').remove();
        xAxisGroup.selectAll('.threshold-connector').remove();

        // Restore all tick labels
        xAxisGroup.selectAll('.tick text').style('opacity', '1');
      }

      // Add top dollar axis if controlSamples available
      if (variants.some((v) => v.controlSamples && v.controlSamples.length > 0)) {
        // Use first variant with control samples for conversion
        const firstVariantWithControl = variants.find(
          (v) => v.controlSamples && v.controlSamples.length > 0
        );

        if (firstVariantWithControl && firstVariantWithControl.controlSamples) {
          // Create top axis using SAME xScale, but convert tick labels to dollars
          const topAxis = d3
            .axisTop(xScale)
            .tickValues(xScale.ticks(10)) // Use same tick positions as bottom axis
            .tickSize(6) // Match default tick size
            .tickFormat((d) => {
              const percentValue = Number(d);
              // Convert % to $ using median control baseline
              const dollarValue = convertPercentToEffect(
                percentValue,
                firstVariantWithControl.controlSamples
              );

              // Round to 0 if very close (same logic as threshold labels)
              const finalValue = Math.abs(dollarValue) < 0.005 ? 0 : dollarValue;

              // Format based on magnitude
              if (Math.abs(finalValue) >= 1000) {
                return d3.format('$,.0f')(finalValue); // $1,234
              } else if (Math.abs(finalValue) >= 1) {
                return d3.format('$,.2f')(finalValue); // $1.23
              } else {
                return d3.format('$.2f')(finalValue); // $0.12
              }
            });

          const topAxisGroup = svg
            .selectAll<SVGGElement, null>('.x-axis-top')
            .data([null])
            .join('g')
            .attr('class', 'x-axis-top axis')
            .attr('transform', `translate(0, ${margin.top - 10})`); // Position 10px from top of margin

          topAxisGroup.call(topAxis as any);

          // Style top axis to exactly match bottom axis
          topAxisGroup.select('.domain').attr('stroke-width', 2).attr('stroke', '#374151');
          topAxisGroup.selectAll('.tick line').attr('stroke-width', 2).attr('stroke', '#374151');
          topAxisGroup
            .selectAll('.tick text')
            .style(
              'font-family',
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            )
            .style('font-size', '12px')
            .style('font-weight', '500')
            .style('fill', '#6b7280');

          // Add special threshold tick to top axis if threshold is set
          if (threshold !== undefined) {
            const thresholdX = xScale(threshold);
            const labelOffset = 10; // Horizontal offset for label (match bottom)
            const labelY = -40; // Vertical distance from axis (match bottom spacing)
            let dollarValue = convertPercentToEffect(
              threshold,
              firstVariantWithControl.controlSamples
            );

            // Round to 0 if very close
            if (Math.abs(dollarValue) < 0.005) {
              dollarValue = 0;
            }

            // Add taller tick line for threshold (pointing up)
            topAxisGroup
              .selectAll('.threshold-tick-line')
              .data([threshold])
              .join('line')
              .attr('class', 'threshold-tick-line')
              .attr('x1', thresholdX)
              .attr('x2', thresholdX)
              .attr('y1', 0)
              .attr('y2', -12) // Extends upward
              .attr('stroke', '#374151')
              .attr('stroke-width', 3);

            // Add angled connector line (elbow style, upward)
            topAxisGroup
              .selectAll('.threshold-connector')
              .data([threshold])
              .join('path')
              .attr('class', 'threshold-connector')
              .attr(
                'd',
                `M ${thresholdX} -12 L ${thresholdX} ${labelY + 10} L ${thresholdX + labelOffset} ${labelY + 2}`
              )
              .attr('stroke', '#9ca3af')
              .attr('stroke-width', 1.5)
              .attr('fill', 'none');

            // Remove old threshold label and input containers to prevent ghost labels and stale event listeners
            topAxisGroup.selectAll('.threshold-tick-label').remove();
            topAxisGroup.selectAll('.editable-label-input-container').remove();

            // Add threshold label (no background) - editable
            const topThresholdLabel = topAxisGroup
              .append('text')
              .attr('class', 'threshold-tick-label')
              .attr('x', thresholdX + labelOffset)
              .attr('y', labelY)
              .attr('text-anchor', 'start'); // Left-aligned from connector

            // Apply editable functionality to the dollar label
            makeEditable(topThresholdLabel, {
              initialValue: dollarValue,
              displayFormat: (value) => {
                const rounded = Math.abs(value) < 0.005 ? 0 : value;
                if (rounded >= 0) {
                  return Math.abs(rounded) >= 1000
                    ? d3.format('$,.0f')(rounded)
                    : Math.abs(rounded) >= 1
                      ? d3.format('$,.2f')(rounded)
                      : d3.format('$.2f')(rounded);
                } else {
                  return Math.abs(rounded) >= 1000
                    ? `-${d3.format('$,.0f')(Math.abs(rounded))}`
                    : Math.abs(rounded) >= 1
                      ? `-${d3.format('$,.2f')(Math.abs(rounded))}`
                      : `-${d3.format('$.2f')(Math.abs(rounded))}`;
                }
              },
              parseInput: parseDollarInput,
              validate: (value) => {
                // Convert to percent to check if within scale domain
                const domain = xScale.domain();
                const minDollar = convertPercentToEffect(
                  domain[0],
                  firstVariantWithControl.controlSamples
                );
                const maxDollar = convertPercentToEffect(
                  domain[1],
                  firstVariantWithControl.controlSamples
                );

                if (value < minDollar || value > maxDollar) {
                  return `Threshold must be between ${d3.format('$.2f')(minDollar)} and ${d3.format('$.2f')(maxDollar)}`;
                }
                return null;
              },
              onChange: (newDollarValue) => {
                // Convert dollar value back to percent using median control baseline
                const newPercent = convertEffectToPercent(
                  newDollarValue,
                  firstVariantWithControl.controlSamples
                );

                // Update the threshold and re-render
                data.threshold = newPercent;
                chart(selection as any);
              },
              fontSize: '12px',
              fontWeight: '600',
              fill: '#374151',
              cursor: 'pointer',
            });

            // Hide normal axis tick labels that are too close to threshold
            // Convert threshold to dollar value for comparison
            const tickThresholdDollar = 0.15; // Hide ticks within $0.15 of threshold
            topAxisGroup.selectAll('.tick text').each(function () {
              const tickText = d3.select(this);
              const tickString = tickText.text().replace(/[$,]/g, '');
              const tickValue = parseFloat(tickString);
              if (!isNaN(tickValue) && Math.abs(tickValue - dollarValue) < tickThresholdDollar) {
                tickText.style('opacity', '0');
              } else {
                tickText.style('opacity', '1');
              }
            });
          } else {
            // Remove threshold tick if no threshold
            topAxisGroup.selectAll('.threshold-tick-line').remove();
            topAxisGroup.selectAll('.threshold-tick-label').remove();
            topAxisGroup.selectAll('.threshold-connector').remove();

            // Restore all tick labels
            topAxisGroup.selectAll('.tick text').style('opacity', '1');
          }
        }
      } else {
        // Remove top axis if no effectSamples
        svg.selectAll('.x-axis-top').remove();
      }
    });
  }

  // Getter-setter methods
  chart.width = function (value?: number | null): any {
    if (arguments.length === 0) return width;
    width = value ?? null;
    return chart;
  };

  chart.height = function (value?: number | null): any {
    if (arguments.length === 0) return height;
    height = value ?? null;
    return chart;
  };

  chart.margin = function (value?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }): any {
    if (arguments.length === 0) return margin;
    margin = value!;
    return chart;
  };

  chart.dotRadius = function (value?: number): any {
    if (arguments.length === 0) return dotRadius;
    dotRadius = value!;
    return chart;
  };

  chart.ridgeHeight = function (value?: number): any {
    if (arguments.length === 0) return ridgeHeight;
    ridgeHeight = value!;
    return chart;
  };

  chart.ridgeSpacing = function (value?: number): any {
    if (arguments.length === 0) return ridgeSpacing;
    ridgeSpacing = value!;
    return chart;
  };

  chart.numDots = function (value?: number): any {
    if (arguments.length === 0) return numDots;
    numDots = value!;
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

  chart.showReferenceLineAtZero = function (value?: boolean): any {
    if (arguments.length === 0) return showReferenceLineAtZero;
    showReferenceLineAtZero = value!;
    return chart;
  };

  chart.scale = function (value?: d3.ScaleLinear<number, number> | null): any {
    if (arguments.length === 0) return scale;
    scale = value ?? null;
    return chart;
  };

  chart.showCIBounds = function (value?: boolean): any {
    if (arguments.length === 0) return showCIBounds;
    showCIBounds = value!;
    return chart;
  };

  chart.showStatistics = function (value?: boolean): any {
    if (arguments.length === 0) return showStatistics;
    showStatistics = value!;
    return chart;
  };

  chart.valueFormat = function (value?: ((v: number) => string) | null): any {
    if (arguments.length === 0) return valueFormat;
    valueFormat = value ?? null;
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
