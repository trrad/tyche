/**
 * Shared utility functions for Observable notebooks
 */

import * as d3 from 'd3';

/**
 * Compute credible interval from samples
 * @param {number[]} samples - Posterior samples
 * @param {number} level - CI level (e.g., 0.80 for 80%)
 * @returns {[number, number]} [lower, upper] bounds
 */
export function credibleInterval(samples, level) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const lower = (1 - level) / 2;
  const upper = 1 - lower;
  return [
    sorted[Math.floor(lower * samples.length)],
    sorted[Math.floor(upper * samples.length)]
  ];
}

/**
 * Compute probability that samples exceed a threshold
 * @param {number[]} samples - Posterior samples
 * @param {number} threshold - Threshold value
 * @returns {number} Probability (0 to 1)
 */
export function probabilityAbove(samples, threshold) {
  return samples.filter(s => s > threshold).length / samples.length;
}

/**
 * Compute probability that samples are below a threshold
 * @param {number[]} samples - Posterior samples
 * @param {number} threshold - Threshold value
 * @returns {number} Probability (0 to 1)
 */
export function probabilityBelow(samples, threshold) {
  return samples.filter(s => s < threshold).length / samples.length;
}

/**
 * Bin samples for histogram with automatic threshold selection
 * @param {number[]} samples - Data to bin
 * @param {number} nBins - Number of bins (default: 40)
 * @returns {object[]} Binned data with x0, x1, length properties
 */
export function bin(samples, nBins = 40) {
  const binGenerator = d3.bin().thresholds(nBins);
  const bins = binGenerator(samples);
  return bins.map(b => ({
    x0: b.x0,
    x1: b.x1,
    length: b.length
  }));
}

/**
 * Compute KS statistic between observed and predicted distributions
 * @param {number[]} observed - Observed data
 * @param {number[]} predicted - Predicted samples
 * @returns {number} KS statistic
 */
export function ksStatistic(observed, predicted) {
  const sortedObs = [...observed].sort((a, b) => a - b);
  const sortedPred = [...predicted].sort((a, b) => a - b);

  let maxDiff = 0;
  const allValues = [...new Set([...sortedObs, ...sortedPred])].sort((a, b) => a - b);

  for (const value of allValues) {
    const obsECDF = sortedObs.filter(x => x <= value).length / sortedObs.length;
    const predECDF = sortedPred.filter(x => x <= value).length / sortedPred.length;
    maxDiff = Math.max(maxDiff, Math.abs(obsECDF - predECDF));
  }

  return maxDiff;
}

/**
 * Check calibration: what % of observed data falls within CI?
 * @param {number[]} observed - Observed data
 * @param {number[]} predicted - Predicted samples
 * @param {number} level - CI level (e.g., 0.80)
 * @returns {number} Percentage of observed data in CI (0 to 100)
 */
export function calibration(observed, predicted, level) {
  const [lower, upper] = credibleInterval(predicted, level);
  const inCI = observed.filter(x => x >= lower && x <= upper).length;
  return (inCI / observed.length) * 100;
}

/**
 * Format number as percentage
 * @param {number} value - Value between 0 and 1
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercent(value, decimals = 1) {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format currency
 * @param {number} value - Dollar amount
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted currency
 */
export function formatCurrency(value, decimals = 2) {
  return `$${value.toFixed(decimals)}`;
}

/**
 * Compute basic summary statistics
 * @param {number[]} samples - Data
 * @returns {object} {mean, median, std, min, max}
 */
export function summaryStats(samples) {
  const mean = d3.mean(samples);
  const median = d3.median(samples);
  const std = d3.deviation(samples);
  const min = d3.min(samples);
  const max = d3.max(samples);
  return { mean, median, std, min, max };
}
