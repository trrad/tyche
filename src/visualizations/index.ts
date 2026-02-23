/**
 * Tyche Visualization Components
 *
 * Framework-agnostic D3 components for Bayesian A/B test result visualization.
 * Built using Mike Bostock's reusable chart pattern with event-driven API.
 *
 * @packageDocumentation
 */

// Core Components
export { QuantileDots } from './core/QuantileDots.js';
export { RidgeDotplot } from './core/RidgeDotplot.js';
export { DraggableCIBounds } from './core/DraggableCIBounds.js';
export { ThresholdLine } from './core/ThresholdLine.js';
export { Tooltip } from './core/Tooltip.js';
export { HintArea } from './core/HintArea.js';
export { ContextMenu } from './core/ContextMenu.js';

// Types
export type {
  // Data interfaces
  QuantileDotsData,
  RidgeDotplotData,
  VariantData,
  SortedSamplePair,
  ColorScheme,

  // Options interfaces
  QuantileDotsOptions,
  CIBoundsOptions,
  ThresholdLineOptions,
  HintAreaOptions,
  ContextMenuOptions,
  ContextMenuItem,

  // Event detail interfaces
  DotHoverEventDetail,
  DotClickEventDetail,
  CIDragEventDetail,
  ThresholdDragEventDetail,
  VariantClickEventDetail,
} from './types/index.js';

// Utility functions
export {
  computeQuantiles,
  sortSamples,
  getCIBounds,
  getPercentile,
  getSortedPairs,
  convertPercentToEffect,
  convertEffectToPercent,
} from './utils/quantiles.js';

export { computeKDE } from './utils/kde.js';

export { validateSamples, validateCIBounds, validateNumDots } from './utils/validation.js';
