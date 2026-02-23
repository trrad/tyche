/**
 * Observable Framework Wrappers for Tyche D3 Visualization Components
 *
 * These wrappers integrate the framework-agnostic D3 components with
 * Observable's reactive cell system, wiring D3 events to Mutable cells.
 */

import * as d3 from 'npm:d3';
import * as Tyche from '../dist/tyche.js';

/**
 * Create a RidgeDotplot component wired to Observable Mutable cells
 *
 * @param {HTMLElement} container - DOM container for the visualization
 * @param {Object} data - RidgeDotplotData with variants and optional threshold
 * @param {Object} options - Configuration options
 * @param {number} options.ciLower - Lower percentile for CI (e.g., 0.1 for 10th)
 * @param {number} options.ciUpper - Upper percentile for CI (e.g., 0.9 for 90th)
 * @param {number} [options.threshold] - Optional threshold value
 * @param {number} [options.numDots=20] - Number of quantile dots to display
 * @param {boolean} [options.showViolin=true] - Show violin/KDE overlay
 * @param {Object} mutableCells - Observable Mutable cells to update
 * @param {Object} mutableCells.ciLower - Mutable cell for CI lower bound
 * @param {Object} mutableCells.ciUpper - Mutable cell for CI upper bound
 * @param {Object} [mutableCells.threshold] - Optional Mutable cell for threshold
 * @returns {Object} The RidgeDotplot component instance
 *
 * @example
 * ```js
 * // In Observable markdown:
 * viewof ciLower = Mutable(0.1);
 * viewof ciUpper = Mutable(0.9);
 * viewof threshold = Mutable(0.10);
 *
 * chart = {
 *   const container = html`<div class="ridge-plot"></div>`;
 *   const viz = createRidgePlot(
 *     container,
 *     { variants: liftData, threshold },
 *     { ciLower, ciUpper, numDots: 20 },
 *     { ciLower: viewof ciLower, ciUpper: viewof ciUpper, threshold: viewof threshold }
 *   );
 *   return container;
 * }
 * ```
 */
export function createRidgePlot(container, data, options, mutableCells) {
  const {
    ciLower = 0.1,
    ciUpper = 0.9,
    threshold,
    numDots = 20,
    showViolin = true,
    width = null, // null = use container width
    showCIBounds = true,
    showStatistics = true,
  } = options;

  // Create the D3 component using closure pattern
  const viz = Tyche.RidgeDotplot()
    .ciLower(ciLower)
    .ciUpper(ciUpper)
    .numDots(numDots)
    .showViolin(showViolin)
    .showCIBounds(showCIBounds)
    .showStatistics(showStatistics);

  if (width !== null) {
    viz.width(width);
  }

  // Wire D3 events to Observable Mutable cells
  if (mutableCells.ciLower && mutableCells.ciUpper) {
    viz.on('ciDrag', (event) => {
      mutableCells.ciLower.value = event.detail.lower;
      mutableCells.ciUpper.value = event.detail.upper;
    });
  }

  if (mutableCells.threshold) {
    viz.on('thresholdDrag', (event) => {
      mutableCells.threshold.value = event.detail.value;
    });
  }

  // Handle variant click for navigation to deep-dive
  viz.on('variantClick', (event) => {
    const variantName = event.detail.variant.name;
    // Navigate to condition-view page with variant parameter
    window.location.href = `/condition-view?variant=${encodeURIComponent(variantName)}`;
  });

  // Render the visualization
  d3.select(container).datum(data).call(viz);

  return viz;
}

/**
 * Create a QuantileDots component for deep-dive single-variant view
 *
 * @param {HTMLElement} container - DOM container for the visualization
 * @param {Object} data - QuantileDotsData with samples and optional threshold
 * @param {number[]} data.samples - Posterior samples
 * @param {number} [data.threshold] - Optional threshold for dot coloring
 * @param {Object} options - Configuration options
 * @param {number} options.ciLower - Lower percentile for CI
 * @param {number} options.ciUpper - Upper percentile for CI
 * @param {number} [options.numDots=100] - Number of dots (100 for deep-dive, 20 for overview)
 * @param {boolean} [options.showViolin=true] - Show KDE overlay
 * @param {number} [options.width=null] - Width (null = use container)
 * @param {number} [options.height=200] - Height in pixels
 * @param {Object} mutableCells - Observable Mutable cells to update
 * @returns {Object} The QuantileDots component instance
 */
export function createQuantileDots(container, data, options, mutableCells) {
  const {
    ciLower = 0.1,
    ciUpper = 0.9,
    numDots = 100, // Default to 100 for deep-dive
    showViolin = true,
    width = null,
    height = 200,
  } = options;

  // Create the D3 component
  const viz = Tyche.QuantileDots()
    .ciLower(ciLower)
    .ciUpper(ciUpper)
    .numDots(numDots)
    .showViolin(showViolin)
    .height(height);

  if (width !== null) {
    viz.width(width);
  }

  // Note: QuantileDots doesn't have draggable CI bounds built-in
  // Those are added by RidgeDotplot. For standalone use, we'd need
  // to add DraggableCIBounds separately if desired.

  // Render
  d3.select(container).datum(data).call(viz);

  return viz;
}

/**
 * Helper function to transform Tyche analysis results into RidgeDotplot data format
 *
 * @param {Object} analysisResult - Tyche ExperimentResult
 * @param {Object} variantComparison - Result from analysisResult.compareVariants()
 * @param {string} baseline - Name of baseline variant
 * @param {number} [threshold] - Optional threshold value
 * @returns {Object} Data formatted for RidgeDotplot
 */
export function prepareRidgePlotData(analysisResult, variantComparison, baseline, threshold) {
  const variants = [];

  // Extract lift samples for each treatment (comparison against baseline)
  for (const [variantName, comparison] of variantComparison.comparisons) {
    variants.push({
      name: variantName,
      displayName: formatVariantName(variantName),
      samples: Array.from(comparison.liftSamples), // Convert typed array to regular array
      isBaseline: false,
    });
  }

  return {
    variants,
    threshold,
  };
}

/**
 * Helper function to prepare absolute value data (not lift)
 *
 * @param {Object} analysisResult - Tyche ExperimentResult
 * @param {Array<string>} variantNames - List of variant names to include
 * @param {string} baseline - Name of baseline variant
 * @param {number} [threshold] - Optional threshold in absolute units
 * @returns {Object} Data formatted for RidgeDotplot (absolute values)
 */
export function prepareAbsoluteData(analysisResult, variantNames, baseline, threshold) {
  const variants = [];

  for (const variantName of variantNames) {
    const variantResult = analysisResult.getVariantResult(variantName);
    if (variantResult) {
      const samples = variantResult.getPosteriorSamples(10000);
      variants.push({
        name: variantName,
        displayName: formatVariantName(variantName),
        samples: Array.from(samples), // Convert typed array
        isBaseline: variantName === baseline,
      });
    }
  }

  return {
    variants,
    threshold,
  };
}

/**
 * Format variant name for display
 * @param {string} name - Internal variant name (e.g., 'treatment_a')
 * @returns {string} Display name (e.g., 'Treatment A')
 */
function formatVariantName(name) {
  // Simple capitalization and underscore replacement
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Update visualization with new CI bounds
 * Helper for reactive Observable cells
 *
 * @param {Object} viz - RidgeDotplot or QuantileDots instance
 * @param {number} ciLower - New lower bound
 * @param {number} ciUpper - New upper bound
 * @param {HTMLElement} container - Container to re-render into
 * @param {Object} data - Current data
 */
export function updateCIBounds(viz, ciLower, ciUpper, container, data) {
  viz.ciLower(ciLower).ciUpper(ciUpper);
  d3.select(container).datum(data).call(viz);
}

/**
 * Update visualization with new threshold
 *
 * @param {Object} viz - RidgeDotplot instance
 * @param {number} threshold - New threshold value
 * @param {HTMLElement} container - Container to re-render into
 * @param {Object} data - Current data (will update threshold property)
 */
export function updateThreshold(viz, threshold, container, data) {
  const updatedData = { ...data, threshold };
  d3.select(container).datum(updatedData).call(viz);
}
