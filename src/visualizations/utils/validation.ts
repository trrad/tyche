/**
 * Input validation utilities for visualization components
 *
 * Provides descriptive error messages for invalid inputs
 */

import type { ScaleLinear } from 'd3-scale';

/**
 * Validate samples array
 *
 * @param samples - Samples to validate
 * @param componentName - Name of component for error messages
 * @throws Error if samples are invalid
 */
export function validateSamples(
  samples: unknown,
  componentName: string
): asserts samples is number[] {
  if (!samples) {
    throw new Error(`${componentName}: samples cannot be null or undefined`);
  }

  if (!Array.isArray(samples)) {
    throw new Error(`${componentName}: samples must be an array, got ${typeof samples}`);
  }

  if (samples.length === 0) {
    throw new Error(`${componentName}: samples array cannot be empty`);
  }

  // Check for non-numeric values
  const invalidIndex = samples.findIndex((x) => typeof x !== 'number');
  if (invalidIndex !== -1) {
    throw new Error(
      `${componentName}: samples must contain only numbers, found ${typeof samples[invalidIndex]} at index ${invalidIndex}`
    );
  }

  // Check for non-finite values
  const nonFiniteIndex = samples.findIndex((x) => !Number.isFinite(x));
  if (nonFiniteIndex !== -1) {
    throw new Error(
      `${componentName}: samples must contain only finite numbers, found ${samples[nonFiniteIndex]} at index ${nonFiniteIndex}`
    );
  }

  if (samples.length < 10) {
    console.warn(
      `${componentName}: very few samples (${samples.length}), visualization may be unreliable`
    );
  }
}

/**
 * Validate CI bounds (percentiles)
 *
 * @param lower - Lower percentile (0.0-1.0)
 * @param upper - Upper percentile (0.0-1.0)
 * @param componentName - Name of component for error messages
 * @throws Error if bounds are invalid
 */
export function validateCIBounds(lower: number, upper: number, componentName: string): void {
  if (typeof lower !== 'number' || !Number.isFinite(lower)) {
    throw new Error(`${componentName}: ciLower must be a finite number, got ${lower}`);
  }

  if (typeof upper !== 'number' || !Number.isFinite(upper)) {
    throw new Error(`${componentName}: ciUpper must be a finite number, got ${upper}`);
  }

  if (lower < 0 || lower > 1) {
    throw new Error(`${componentName}: ciLower must be between 0 and 1, got ${lower}`);
  }

  if (upper < 0 || upper > 1) {
    throw new Error(`${componentName}: ciUpper must be between 0 and 1, got ${upper}`);
  }

  if (lower >= upper) {
    throw new Error(`${componentName}: ciLower (${lower}) must be < ciUpper (${upper})`);
  }
}

/**
 * Validate D3 scale
 *
 * @param scale - D3 scale to validate
 * @param componentName - Name of component for error messages
 * @throws Error if scale is invalid
 */
export function validateScale(
  scale: unknown,
  componentName: string
): asserts scale is ScaleLinear<number, number> {
  if (!scale || typeof scale !== 'function') {
    throw new Error(`${componentName}: scale is required and must be a d3.scaleLinear instance`);
  }

  // Check if it has the expected scale methods
  const scaleObj = scale as any;
  if (typeof scaleObj.domain !== 'function' || typeof scaleObj.range !== 'function') {
    throw new Error(
      `${componentName}: scale must be a valid D3 scale with domain() and range() methods`
    );
  }
}

/**
 * Validate positive number
 *
 * @param value - Value to validate
 * @param name - Parameter name for error messages
 * @param componentName - Component name for error messages
 * @throws Error if value is not a positive number
 */
export function validatePositive(value: number, name: string, componentName: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${componentName}: ${name} must be a finite number, got ${value}`);
  }

  if (value <= 0) {
    throw new Error(`${componentName}: ${name} must be positive, got ${value}`);
  }
}

/**
 * Validate non-negative number
 *
 * @param value - Value to validate
 * @param name - Parameter name for error messages
 * @param componentName - Component name for error messages
 * @throws Error if value is not non-negative
 */
export function validateNonNegative(value: number, name: string, componentName: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${componentName}: ${name} must be a finite number, got ${value}`);
  }

  if (value < 0) {
    throw new Error(`${componentName}: ${name} must be non-negative, got ${value}`);
  }
}

/**
 * Validate number of dots/quantiles
 *
 * @param numDots - Number of dots to validate
 * @param componentName - Component name for error messages
 * @throws Error if numDots is invalid
 */
export function validateNumDots(numDots: number, componentName: string): void {
  if (typeof numDots !== 'number' || !Number.isFinite(numDots) || !Number.isInteger(numDots)) {
    throw new Error(`${componentName}: numDots must be an integer, got ${numDots}`);
  }

  if (numDots < 2) {
    throw new Error(`${componentName}: numDots must be >= 2, got ${numDots}`);
  }

  if (numDots > 1000) {
    console.warn(
      `${componentName}: numDots is very large (${numDots}), performance may be affected`
    );
  }
}

/**
 * Validate variant data array for RidgeDotplot
 *
 * @param variants - Variant data array to validate
 * @param componentName - Component name for error messages
 * @throws Error if variants array is invalid
 */
export function validateVariants(variants: unknown, componentName: string): void {
  if (!Array.isArray(variants)) {
    throw new Error(`${componentName}: variants must be an array`);
  }

  if (variants.length === 0) {
    throw new Error(`${componentName}: variants array cannot be empty`);
  }

  // Validate each variant
  variants.forEach((variant, index) => {
    if (!variant || typeof variant !== 'object') {
      throw new Error(`${componentName}: variant at index ${index} must be an object`);
    }

    const v = variant as any;

    if (typeof v.name !== 'string' || v.name.length === 0) {
      throw new Error(`${componentName}: variant at index ${index} must have a non-empty name`);
    }

    if (typeof v.displayName !== 'string' || v.displayName.length === 0) {
      throw new Error(
        `${componentName}: variant at index ${index} must have a non-empty displayName`
      );
    }

    if (!Array.isArray(v.samples) || v.samples.length === 0) {
      throw new Error(`${componentName}: variant '${v.name}' must have a non-empty samples array`);
    }

    // Validate samples within variant
    validateSamples(v.samples, `${componentName} (variant '${v.name}')`);
  });
}
