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
     * Sample a single value from the distribution
     */
    sample(): number;
    
    /**
     * Sample multiple values from the distribution
     */
    sampleN(n: number): number[];
    
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
  
  /**
   * Base class providing common functionality
   */
  export abstract class BaseDistribution implements Distribution {
    abstract pdf(x: number): number;
    abstract sample(): number;
    abstract mean(): number;
    abstract variance(): number;
    abstract support(): { min: number; max: number };
    
    /**
     * Default implementation of log PDF using PDF
     * Subclasses should override for numerical stability
     */
    logPdf(x: number): number {
      return Math.log(this.pdf(x));
    }
    
    /**
     * Default implementation of multiple sampling
     */
    sampleN(n: number): number[] {
      const samples: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        samples[i] = this.sample();
      }
      return samples;
    }
    
    /**
     * Check if value is in support of distribution
     */
    protected checkSupport(x: number): void {
      const { min, max } = this.support();
      if (x < min || x > max || isNaN(x)) {
        throw new Error(`Value ${x} is outside support [${min}, ${max}]`);
      }
    }
  }