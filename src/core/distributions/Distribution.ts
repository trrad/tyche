/**
 * Base interface for all probability distributions
 */
export interface Distribution {
  /**
   * Probability density function (PDF) for continuous distributions
   * Probability mass function (PMF) for discrete distributions
   */
  pdf(x: number): number;

  /**
   * Log probability density/mass function
   * More numerically stable for many calculations
   */
  logPdf(x: number): number;

  /**
   * Cumulative distribution function
   */
  cdf(x: number): number;

  /**
   * Sample values from the distribution
   */
  sample(n: number, rng?: () => number): number[];

  /**
   * Expected value of the distribution
   */
  mean(): number;

  /**
   * Variance of the distribution
   */
  variance(): number;

  /**
   * Support of the distribution (where PDF/PMF > 0)
   */
  support(): { min: number; max: number };
}
