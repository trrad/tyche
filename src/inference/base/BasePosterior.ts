/**
 * Base implementation of Posterior with automatic sampling and caching
 * Provides synchronous mean, variance, and credibleInterval from cached samples
 */

import { Posterior } from './types';

export abstract class BasePosterior implements Posterior {
  protected cachedSamples: number[] | null = null;
  protected defaultSampleSize: number = 10000;

  constructor(sampleSize?: number) {
    if (sampleSize) {
      this.defaultSampleSize = sampleSize;
    }
    // Eagerly cache samples on construction
    this.ensureSamples();
  }

  /**
   * Abstract method that derived classes must implement
   * This is where the actual sampling logic lives
   */
  protected abstract generateSamples(n: number): number[];

  /**
   * Ensure we have cached samples, generating them if needed
   */
  protected ensureSamples(n?: number): void {
    const sampleSize = n || this.defaultSampleSize;
    if (!this.cachedSamples || this.cachedSamples.length < sampleSize) {
      const samples = this.generateSamples(sampleSize);
      if (samples instanceof Promise) {
        // If async, we can't cache in constructor
        // Will need to handle this case differently
        console.warn('Async sampling detected - caching will be deferred');
        this.cachedSamples = null;
      } else {
        this.cachedSamples = samples;
      }
    }
  }

  /**
   * Get samples, using cache when possible
   */
  sample(n: number = 1000): number[] {
    // If we're asking for fewer samples than cached, return subset
    if (this.cachedSamples && n <= this.cachedSamples.length) {
      // Return a random subset to avoid bias
      const indices = new Array(n)
        .fill(0)
        .map(() => Math.floor(Math.random() * this.cachedSamples!.length));
      return indices.map((i) => this.cachedSamples![i]);
    }

    // Otherwise generate fresh samples
    const samples = this.generateSamples(n);

    // Update cache if we generated more than we had
    if (n >= this.defaultSampleSize) {
      this.cachedSamples = samples;
    }

    return samples;
  }

  /**
   * Calculate mean from cached samples
   */
  mean(): number[] {
    // If derived class has analytical mean, it should override this
    if (!this.cachedSamples) {
      // Need to generate samples synchronously
      const samples = this.generateSamples(this.defaultSampleSize);
      if (samples instanceof Promise) {
        throw new Error(
          'Cannot compute synchronous mean from async sampler. Override mean() in derived class.'
        );
      }
      this.cachedSamples = samples;
    }

    const sum = this.cachedSamples.reduce((a, b) => a + b, 0);
    return [sum / this.cachedSamples.length];
  }

  /**
   * Calculate variance from cached samples
   */
  variance(): number[] {
    // If derived class has analytical variance, it should override this
    if (!this.cachedSamples) {
      const samples = this.generateSamples(this.defaultSampleSize);
      if (samples instanceof Promise) {
        throw new Error(
          'Cannot compute synchronous variance from async sampler. Override variance() in derived class.'
        );
      }
      this.cachedSamples = samples;
    }

    const mean = this.mean()[0];
    const squaredDiffs = this.cachedSamples.map((x) => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (this.cachedSamples.length - 1);
    return [variance];
  }

  /**
   * Calculate credible interval from cached samples
   */
  credibleInterval(level: number = 0.95): Array<[number, number]> {
    if (!this.cachedSamples) {
      const samples = this.generateSamples(this.defaultSampleSize);
      if (samples instanceof Promise) {
        throw new Error(
          'Cannot compute synchronous credible interval from async sampler. Override credibleInterval() in derived class.'
        );
      }
      this.cachedSamples = samples;
    }

    // Sort samples
    const sorted = [...this.cachedSamples].sort((a, b) => a - b);

    // Calculate quantiles
    const alpha = (1 - level) / 2;
    const lowerIndex = Math.floor(alpha * sorted.length);
    const upperIndex = Math.floor((1 - alpha) * sorted.length);

    return [[sorted[lowerIndex], sorted[upperIndex]]];
  }

  /**
   * Update sample cache size and regenerate if needed
   */
  updateSampleSize(n: number): void {
    this.defaultSampleSize = n;
    this.cachedSamples = null; // Clear cache to force regeneration
    this.ensureSamples();
  }

  /**
   * By default, posteriors that use sampling don't have analytical form
   * Override in derived classes that do have analytical forms
   */
  hasAnalyticalForm(): boolean {
    return false;
  }
}
