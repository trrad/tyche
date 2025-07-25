/**
 * Abstract base class for all inference engines
 */

import { DataInput, FitOptions, InferenceResult, InferenceEngine as IInferenceEngine } from '../base/types';

export abstract class InferenceEngine implements IInferenceEngine {
  constructor(protected readonly name: string) {}

  /**
   * Fit the model to data - must be implemented by subclasses
   */
  abstract fit(data: DataInput, options?: FitOptions): Promise<InferenceResult>;
  
  /**
   * Check if this engine can handle the given data
   */
  abstract canHandle(data: DataInput): boolean;
  
  /**
   * Get a description of the inference method
   */
  getDescription(): string {
    return this.name;
  }
  
  /**
   * Validate input data - common validation logic
   */
  protected validateInput(data: DataInput): void {
    if (!data || !data.data) {
      throw new Error('Invalid input: data is required');
    }
    
    // Check for array data
    if (Array.isArray(data.data)) {
      if (data.data.length === 0) {
        throw new Error('Invalid input: data array cannot be empty');
      }
      
      // Check for NaN or Infinity
      const hasInvalid = data.data.some(x => !isFinite(x));
      if (hasInvalid) {
        throw new Error('Invalid input: data contains NaN or Infinity');
      }
    }
    // Check for binomial data
    else if ('successes' in data.data && 'trials' in data.data) {
      const { successes, trials } = data.data;
      
      if (!Number.isInteger(successes) || !Number.isInteger(trials)) {
        throw new Error('Invalid input: successes and trials must be integers');
      }
      
      if (successes < 0 || trials < 0) {
        throw new Error('Invalid input: successes and trials must be non-negative');
      }
      
      if (successes > trials) {
        throw new Error('Invalid input: successes cannot exceed trials');
      }
    }
    // Check for summary stats
    else if ('n' in data.data) {
      if (data.data.n <= 0) {
        throw new Error('Invalid input: n must be positive');
      }
    }
  }
  
  /**
   * Measure runtime of an async operation
   */
  protected async measureRuntime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; runtime: number }> {
    const start = performance.now();
    const result = await operation();
    const runtime = performance.now() - start;
    return { result, runtime };
  }
}