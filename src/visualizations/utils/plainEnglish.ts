/**
 * Plain English Messaging Utilities
 *
 * Converts statistical concepts to plain, probabilistic English
 * following the Tyche design principles for uncertainty communication.
 */

/**
 * Convert a probability (0-1) to a qualitative confidence description
 *
 * @param probability - Value between 0 and 1
 * @returns Plain English confidence level
 *
 * @example
 * ```ts
 * getConfidenceLevel(0.97) // "very likely"
 * getConfidenceLevel(0.85) // "likely"
 * getConfidenceLevel(0.50) // "uncertain"
 * ```
 */
export function getConfidenceLevel(probability: number): string {
  if (probability >= 0.95) return 'very likely';
  if (probability >= 0.8) return 'likely';
  if (probability >= 0.6) return 'possible';
  if (probability >= 0.4) return 'uncertain';
  return 'unlikely';
}

/**
 * Convert a probability (0-1) to a qualitative confidence statement
 *
 * @param probability - Value between 0 and 1
 * @returns Plain English confidence statement
 *
 * @example
 * ```ts
 * getConfidenceStatement(0.97) // "We're quite confident"
 * getConfidenceStatement(0.85) // "We're moderately confident"
 * getConfidenceStatement(0.50) // "Results are inconclusive"
 * ```
 */
export function getConfidenceStatement(probability: number): string {
  if (probability >= 0.95) return "We're quite confident";
  if (probability >= 0.8) return "We're moderately confident";
  if (probability >= 0.6) return 'There is some evidence';
  if (probability >= 0.4) return 'Results are inconclusive';
  return 'There is little evidence';
}

/**
 * Format a credible interval in plain English
 *
 * @param lower - Lower bound value
 * @param upper - Upper bound value
 * @param coverage - Coverage probability (e.g., 0.8 for 80%)
 * @param unit - Unit suffix (e.g., '%' for percentages)
 * @returns Plain English interval description
 *
 * @example
 * ```ts
 * formatCredibleInterval(0.082, 0.227, 0.80, '%')
 * // "80% probability the true lift is between +8.2% and +22.7%"
 * ```
 */
export function formatCredibleInterval(
  lower: number,
  upper: number,
  coverage: number,
  unit: string = '%'
): string {
  const coveragePercent = (coverage * 100).toFixed(0);
  const lowerStr = formatValue(lower, unit).replace('.0%', '%');
  const upperStr = formatValue(upper, unit).replace('.0%', '%');

  return `${coveragePercent}% probability the true lift is between ${lowerStr} and ${upperStr}`;
}

/**
 * Format a value with appropriate sign and unit
 *
 * @param value - Numeric value
 * @param unit - Unit suffix
 * @returns Formatted string with sign
 *
 * @example
 * ```ts
 * formatValue(0.153, '%') // "+15.3%"
 * formatValue(-0.05, '%') // "-5.0%"
 * formatValue(52.3, '$') // "$52.30"
 * ```
 */
export function formatValue(value: number, unit: string = '%'): string {
  if (unit === '%') {
    const percentValue = (value * 100).toFixed(0); // Whole number rounding
    const sign = value >= 0 ? '+' : '';
    return `${sign}${percentValue}%`;
  } else if (unit === '$') {
    return `$${value.toFixed(2)}`;
  } else {
    return `${value.toFixed(2)}${unit}`;
  }
}

/**
 * Explain what a tail probability means in plain English
 *
 * @param tailProb - Tail probability (e.g., 0.1 for 10%)
 * @param bound - The bound value
 * @param isLower - Whether this is the lower tail (true) or upper tail (false)
 * @param unit - Unit suffix
 * @returns Plain English explanation
 *
 * @example
 * ```ts
 * explainTailProbability(0.1, 0.082, true, '%')
 * // "10% probability it's lower than +8.2%"
 *
 * explainTailProbability(0.1, 0.227, false, '%')
 * // "10% probability it's higher than +22.7%"
 * ```
 */
export function explainTailProbability(
  tailProb: number,
  bound: number,
  isLower: boolean,
  unit: string = '%'
): string {
  const probPercent = (tailProb * 100).toFixed(0);
  const boundStr = formatValue(bound, unit).replace('.0%', '%');
  const comparison = isLower ? 'lower' : 'higher';

  return `${probPercent}% probability it's ${comparison} than ${boundStr}`;
}

/**
 * Describe the direction and magnitude of a lift
 *
 * @param lift - Lift value (e.g., 0.15 for 15% increase, -0.08 for 8% decrease)
 * @param includeMedian - Whether to include "median" in the description
 * @returns Plain English lift description
 *
 * @example
 * ```ts
 * describeLiftDirection(0.152, false) // "15% median lift"
 * describeLiftDirection(-0.152, false) // "15% median decline"
 * describeLiftDirection(0.003, false) // "0% median lift"
 * ```
 */
export function describeLiftDirection(lift: number, includeMedian: boolean = false): string {
  const absValue = Math.abs(lift);
  const percentValue = (absValue * 100).toFixed(0); // Whole number rounding

  // Use "median" terminology to clarify this is the 50th percentile,
  // not the mean (which can be skewed by outliers in heavy-tailed lift distributions)
  if (lift >= 0) {
    return `${percentValue}% median lift`;
  } else {
    return `${percentValue}% median decline`;
  }
}

/**
 * Format a threshold probability statement
 *
 * @param probability - Probability of exceeding threshold (0-1)
 * @param threshold - Threshold value
 * @param unit - Unit suffix
 * @returns Plain English threshold statement
 *
 * @example
 * ```ts
 * formatThresholdProbability(0.89, 0.10, '%')
 * // "89% chance of improvement exceeding 10%"
 *
 * formatThresholdProbability(0.42, -0.015, '%')
 * // "42% chance of decrease smaller than 1.5%"
 * ```
 */
export function formatThresholdProbability(
  probability: number,
  threshold: number,
  unit: string = '%'
): string {
  const probPercent = (probability * 100).toFixed(0);

  if (unit === '%') {
    const absThreshold = Math.abs(threshold);
    const thresholdPercent = (absThreshold * 100).toFixed(0); // Whole number rounding

    if (threshold >= 0) {
      // Positive threshold: "X% chance of improvement exceeding Y%"
      return `${probPercent}% chance of improvement exceeding ${thresholdPercent}%`;
    } else {
      // Negative threshold: flip the perspective to avoid double negative
      // Instead of "X% chance better by at least -Y%", say "X% chance of decrease smaller than Y%"
      return `${probPercent}% chance of decrease smaller than ${thresholdPercent}%`;
    }
  } else {
    // For dollar amounts or other units
    const thresholdStr = formatValue(threshold, unit);
    return `${probPercent}% chance exceeding ${thresholdStr}`;
  }
}

/**
 * Describe the probability position of a value in plain English
 *
 * @param percentile - Percentile rank (0-1) within the full sample distribution
 * @returns Plain English probability statement
 *
 * @example
 * ```ts
 * describeProbabilityPosition(0.30)
 * // "30% chance below this value, 70% above"
 *
 * describeProbabilityPosition(0.50)
 * // "50% chance below this value, 50% above"
 * ```
 */
export function describeProbabilityPosition(percentile: number): string {
  const below = (percentile * 100).toFixed(0);
  const above = ((1 - percentile) * 100).toFixed(0);
  return `${below}% chance below this value, ${above}% above`;
}

/**
 * Create a plain English summary of where a value sits in a distribution
 *
 * @param value - The value to describe
 * @param percentile - Percentile rank (0-1)
 * @param isInCI - Whether value is within the credible interval
 * @returns Plain English description
 *
 * @example
 * ```ts
 * describeValuePosition(0.153, 0.50, true)
 * // "This represents the 50th percentile (median)"
 *
 * describeValuePosition(0.05, 0.05, false)
 * // "This represents the 5th percentile"
 * ```
 */
export function describeValuePosition(value: number, percentile: number, isInCI: boolean): string {
  const percentileStr = (percentile * 100).toFixed(0);
  const ordinal = getOrdinal(parseInt(percentileStr));

  let description = `This represents the ${ordinal} percentile`;

  if (percentile === 0.5) {
    description += ' (median)';
  }

  return description;
}

/**
 * Convert a number to its ordinal form (1st, 2nd, 3rd, etc.)
 */
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Create a CI position statement (whether a dot is in/out of CI)
 *
 * @param isInCI - Whether the value is within the credible interval
 * @param coverage - Coverage probability (e.g., 0.8)
 * @returns Plain English statement
 *
 * @example
 * ```ts
 * describeCIPosition(true, 0.80)
 * // "This dot is within the middle 80% range"
 *
 * describeCIPosition(false, 0.80)
 * // "This dot is in the outer 20% (tail)"
 * ```
 */
export function describeCIPosition(isInCI: boolean, coverage: number): string {
  const coveragePercent = (coverage * 100).toFixed(0);
  const tailPercent = ((1 - coverage) * 100).toFixed(0);

  if (isInCI) {
    return `This dot is within the middle ${coveragePercent}% range`;
  } else {
    return `This dot is in the outer ${tailPercent}% (tail)`;
  }
}
