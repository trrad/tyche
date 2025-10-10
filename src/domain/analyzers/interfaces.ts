/**
 * Analyzer Framework Interfaces
 *
 * Defines the core interfaces for business-specific analysis patterns.
 * Analyzers orchestrate statistical engines to answer business questions,
 * separating business logic from statistical machinery.
 *
 * Based on InterfaceStandards.md and current task specification.
 */

import { ExperimentData } from '../types/experiment';
import { StandardData } from '../../core/data/StandardData';
import { ExperimentResult } from '../results/ExperimentResult';
import { VariantResult } from '../results/VariantResult';
import { Distribution } from '../../core/distributions/Distribution';

/**
 * Configuration options for analyzers
 */
export interface AnalyzerOptions {
  /** Prior distributions for model parameters */
  priors?: Map<string, Distribution>;

  /** Minimum practical effect size for business significance */
  minimumPracticalEffect?: number;

  /** Progress callback for long-running operations */
  progressCallback?: (progress: number) => void;
}

/**
 * Analyzer for comparing variants in experiments
 *
 * ExperimentAnalyzers take control + treatment data and return
 * ExperimentResult with cross-variant comparisons.
 *
 * Key responsibilities:
 * - Combine variant data for routing decisions
 * - Orchestrate ModelRouter and InferenceEngines
 * - Package results for business interpretation
 */
export interface ExperimentAnalyzer {
  /**
   * Analyze an experiment with multiple variants
   *
   * @param data Experiment data with control and treatments
   * @returns ExperimentResult with variant comparisons
   */
  analyze(data: ExperimentData): Promise<ExperimentResult>;

  /**
   * Configure analyzer with options (optional)
   *
   * @param options Configuration including priors and thresholds
   */
  configure?(options: AnalyzerOptions): void;
}

/**
 * Analyzer for single dataset analysis
 *
 * DatasetAnalyzers take a single dataset and return VariantResult.
 * Used for prior learning, historical analysis, etc.
 *
 * Key responsibilities:
 * - Route single dataset to appropriate model
 * - Fit model and return VariantResult
 * - Support prior extraction for downstream use
 */
export interface DatasetAnalyzer {
  /**
   * Analyze a single dataset
   *
   * @param data Standard data format (binomial or user-level)
   * @returns VariantResult for the dataset
   */
  analyze(data: StandardData): Promise<VariantResult>;

  /**
   * Configure analyzer with options (optional)
   *
   * @param options Configuration including priors and thresholds
   */
  configure?(options: AnalyzerOptions): void;
}
