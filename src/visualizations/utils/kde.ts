/**
 * Kernel Density Estimation (KDE) for violin overlay visualization
 *
 * Implements Mike Bostock's approach with Silverman's rule for bandwidth selection
 * and Epanechnikov kernel (optimal for MSE).
 */

import * as d3 from 'd3';
import type { KDEPoint } from '../types/index.js';

/**
 * Compute kernel density estimation for violin overlay
 *
 * Uses:
 * - Silverman's rule for automatic bandwidth selection
 * - Epanechnikov kernel (most efficient, optimal for MSE)
 * - Robust bandwidth estimation using IQR
 *
 * @param samples - Raw posterior samples
 * @param domain - [min, max] range for evaluation
 * @param numPoints - Number of evaluation points (default: 50)
 * @returns Array of {value, density} points for visualization
 *
 * @example
 * ```ts
 * const samples = normalSamples(1000, 0, 1); // 1000 samples from N(0, 1)
 * const kde = computeKDE(samples, [-3, 3], 50);
 * // Returns 50 points with estimated density at each x-value
 * ```
 */
export function computeKDE(
  samples: number[],
  domain: [number, number],
  numPoints = 50
): KDEPoint[] {
  if (!samples || samples.length === 0) {
    throw new Error('computeKDE: samples array cannot be empty');
  }

  if (samples.length < 10) {
    console.warn('computeKDE: very few samples (< 10), KDE may be unreliable');
  }

  const [min, max] = domain;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(`computeKDE: domain must contain finite values, got [${min}, ${max}]`);
  }

  if (min >= max) {
    throw new Error(`computeKDE: domain min (${min}) must be < max (${max})`);
  }

  // Sort for quantile computation
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  // Automatic bandwidth using Silverman's rule of thumb
  // Use IQR for robustness to outliers
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  // Standard deviation estimate (robust version)
  const sigma = Math.min(d3.deviation(samples) || 1, iqr / 1.34);

  // Silverman bandwidth: h = 1.06 × σ × n^(-1/5)
  const bandwidth = 1.06 * sigma * Math.pow(n, -0.2);

  if (bandwidth <= 0 || !Number.isFinite(bandwidth)) {
    // Fallback to simple rule if bandwidth calculation fails
    const range = max - min;
    const fallbackBandwidth = range / 20;
    console.warn(
      `computeKDE: invalid bandwidth (${bandwidth}), using fallback (${fallbackBandwidth})`
    );
    return computeKDEWithBandwidth(samples, domain, fallbackBandwidth, numPoints);
  }

  return computeKDEWithBandwidth(samples, domain, bandwidth, numPoints);
}

/**
 * Compute KDE with explicit bandwidth
 *
 * @param samples - Raw samples
 * @param domain - [min, max] evaluation range
 * @param bandwidth - Kernel bandwidth
 * @param numPoints - Number of evaluation points
 * @returns KDE points
 */
function computeKDEWithBandwidth(
  samples: number[],
  domain: [number, number],
  bandwidth: number,
  numPoints: number
): KDEPoint[] {
  const [min, max] = domain;

  // Epanechnikov kernel (optimal for MSE)
  // K(u) = 3/4 * (1 - u^2) for |u| <= 1, else 0
  const kernel = (x: number): number => {
    const u = x / bandwidth;
    return Math.abs(u) <= 1 ? (0.75 * (1 - u * u)) / bandwidth : 0;
  };

  // Generate evaluation points along x-axis
  const points = Array.from(
    { length: numPoints },
    (_, i) => min + (i / (numPoints - 1)) * (max - min)
  );

  // Compute density at each evaluation point
  return points.map((x) => ({
    value: x,
    density: d3.mean(samples, (d) => kernel(x - d)) || 0,
  }));
}

/**
 * Compute KDE with custom bandwidth for special cases
 *
 * @param samples - Raw samples
 * @param domain - [min, max] evaluation range
 * @param bandwidth - Custom bandwidth value
 * @param numPoints - Number of evaluation points
 * @returns KDE points
 */
export function computeKDECustom(
  samples: number[],
  domain: [number, number],
  bandwidth: number,
  numPoints = 50
): KDEPoint[] {
  if (bandwidth <= 0 || !Number.isFinite(bandwidth)) {
    throw new Error(`computeKDECustom: bandwidth must be positive and finite, got ${bandwidth}`);
  }

  return computeKDEWithBandwidth(samples, domain, bandwidth, numPoints);
}
