/**
 * Experiment Data Structures
 *
 * Domain-level interfaces for experiment analysis.
 * These wrap the statistical layer's StandardData with experiment-specific metadata.
 */

import { StandardData } from '../../core/data/StandardData';

/**
 * Variant data - wraps StandardData with experiment metadata
 */
export interface VariantData {
  name: string;
  data: StandardData;
  metadata?: {
    description?: string;
  };
}

/**
 * Complete experiment structure with control and treatment variants
 */
export interface ExperimentData {
  id: string;
  name: string;

  variants: {
    control: VariantData;
    treatments: Map<string, VariantData>;
  };

  metadata: {
    startDate: Date;
    endDate?: Date;
    hypothesis: string;
    minimumPracticalEffect?: Record<string, number>;
  };
}
