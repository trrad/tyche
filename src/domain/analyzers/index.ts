/**
 * Analyzer Framework - Public API
 *
 * Exports all analyzer interfaces and implementations for business-specific
 * analysis patterns. Analyzers orchestrate statistical engines to answer
 * business questions, separating business logic from statistical machinery.
 */

// Core interfaces
export type { ExperimentAnalyzer, DatasetAnalyzer, AnalyzerOptions } from './interfaces';

// Concrete analyzer implementations
export { ConversionAnalyzer } from './ConversionAnalyzer';
export { RevenueAnalyzer } from './RevenueAnalyzer';
export { PriorLearner } from './PriorLearner';

// Import the types we need for the factory functions
import type { ExperimentAnalyzer } from './interfaces';
import { ConversionAnalyzer } from './ConversionAnalyzer';
import { RevenueAnalyzer } from './RevenueAnalyzer';
import { PriorLearner } from './PriorLearner';

/**
 * Factory function for creating analyzers by type
 * Useful for dynamic analyzer selection in higher-level APIs
 */
export function createAnalyzer(type: 'conversion' | 'revenue'): ExperimentAnalyzer {
  switch (type) {
    case 'conversion':
      return new ConversionAnalyzer();
    case 'revenue':
      return new RevenueAnalyzer();
    default:
      throw new Error(`Unknown analyzer type: ${type}`);
  }
}

/**
 * Create a PriorLearner for historical data analysis
 */
export function createPriorLearner(): PriorLearner {
  return new PriorLearner();
}
