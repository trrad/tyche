// src/tests/scenarios/test-scenarios.ts
import { DataGenerator } from '../utilities/synthetic/DataGenerator';
import { UserData } from '../../inference/base/types';

/**
 * Centralized test scenarios for consistent validation across the test suite
 * Uses the unified DataGenerator API
 */
export const TestScenarios = {
  // Beta-Binomial scenarios (conversion rates)
  betaBinomial: {
    typical: {
      description: 'Typical e-commerce conversion rate',
      trueRate: 0.03,
      sampleSize: 10000,
      generateData: (n?: number) => {
        return DataGenerator.scenarios.betaBinomial.realistic(0.03, n || 10000, 12345).data;
      },
      generateDataset: (n?: number) => {
        return DataGenerator.scenarios.betaBinomial.realistic(0.03, n || 10000, 12345);
      }
    },
    
    highConversion: {
      description: 'High conversion rate (e.g., email clicks)',
      trueRate: 0.25,
      sampleSize: 1000,
      generateData: (n?: number) => {
        return DataGenerator.scenarios.betaBinomial.realistic(0.25, n || 1000, 12345).data;
      },
      generateDataset: (n?: number) => {
        return DataGenerator.scenarios.betaBinomial.realistic(0.25, n || 1000, 12345);
      }
    },
    
    edgeCases: {
      allSuccess: { successes: 100, trials: 100 },
      noSuccess: { successes: 0, trials: 100 },
      singleTrial: { successes: 1, trials: 1 },
      largeSample: { successes: 50000, trials: 1000000 }
    }
  },

  // Revenue scenarios (LogNormal)
  revenue: {
    ecommerce: {
      description: 'Typical e-commerce transaction values',
      generateData: (n?: number) => {
        return DataGenerator.scenarios.revenue.realistic(3.5, 0.5, n || 1000, 12345).data;
      },
      generateDataset: (n?: number) => {
        return DataGenerator.scenarios.revenue.realistic(3.5, 0.5, n || 1000, 12345);
      }
    },
    
    saas: {
      description: 'SaaS MRR distribution',
      generateData: (n?: number) => {
        // Extract just the revenue values from the compound model
        const dataset = DataGenerator.scenarios.saas.clean(n || 500, 12345);
        return dataset.data.filter((u: any) => u.converted).map((u: any) => u.value);
      },
      generateDataset: (n?: number) => {
        return DataGenerator.scenarios.saas.clean(n || 500, 12345);
      }
    },
    
    withOutliers: {
      description: 'Revenue with whale customers',
      generateData: (n?: number) => {
        return DataGenerator.scenarios.revenue.noisy(3.5, 0.5, n || 1000, 12345).data;
      },
      generateDataset: (n?: number) => {
        return DataGenerator.scenarios.revenue.noisy(3.5, 0.5, n || 1000, 12345);
      }
    }
  },

  // Compound scenarios
  compound: {
    controlVariant: {
      description: '5% conversion, $55 AOV',
      generateUsers: (n?: number) => {
        return DataGenerator.scenarios.ecommerce.clean(n || 1000, 12345).data;
      },
      generateDataset: (n?: number) => {
        return DataGenerator.scenarios.ecommerce.clean(n || 1000, 12345);
      }
    },
    
    treatmentVariant: {
      description: '6.5% conversion, $60 AOV',
      generateUsers: (n?: number) => {
        // Create a modified version with higher conversion and revenue
        const gen = new DataGenerator(12346);
        const users: any[] = [];
        const convRate = 0.065;
        
        for (let i = 0; i < (n || 1000); i++) {
          const converted = Math.random() < convRate;
          let value = 0;
          
          if (converted) {
            // LogNormal with mean ~$60
            const logMean = 4.1;
            const logStd = 0.8;
            value = Math.exp(gen.continuous('normal', { mean: logMean, std: logStd }, 1).data[0]);
          }
          
          users.push({ converted, value });
        }
        
        return users;
      }
    },
    
    multimodalRevenue: {
      description: 'Budget vs premium customer segments',
      generateUsers: (n?: number) => {
        // This uses the segments scenario but returns as compound data
        const gen = new DataGenerator(12345);
        const convRate = 0.08;
        const users: any[] = [];
        
        // Generate segment revenues
        const segmentData = DataGenerator.scenarios.segments.realistic(n || 2000, 12345);
        const revenues = segmentData.data as number[];
        
        // Convert to compound format
        revenues.forEach(revenue => {
          if (Math.random() < convRate) {
            users.push({ converted: true, value: revenue });
          } else {
            users.push({ converted: false, value: 0 });
          }
        });
        
        return users;
      }
    }
  },

  // Mixture scenarios
  mixtures: {
    bimodal: {
      description: 'Two clear normal components',
      generateData: (n?: number) => {
        const gen = new DataGenerator(12345);
        return gen.mixture([
          { distribution: 'normal', params: [10, 2], weight: 0.6 },
          { distribution: 'normal', params: [25, 3], weight: 0.4 }
        ], n || 500).data;
      }
    },
    
    revenueMixture: {
      description: 'LogNormal mixture for customer tiers',
      generateData: (n?: number) => {
        return DataGenerator.scenarios.segments.realistic(n || 500, 12345).data;
      },
      generateDataset: (n?: number) => {
        return DataGenerator.scenarios.segments.realistic(n || 500, 12345);
      }
    }
  },

  // Numerical edge cases
  numerical: {
    logSumExp: {
      overflow: [1000, 1001, 1002],
      underflow: [-1000, -1001, -1002],
      mixed: [-100, 0, 100],
      empty: [],
      allNegInf: [-Infinity, -Infinity]
    },
    
    gradients: {
      normal: [3, 4], // norm = 5
      needsClipping: [30, 40], // norm = 50
      zero: [0, 0],
      tiny: [1e-10, 1e-10]
    }
  }
};

/**
 * Tolerance levels for different types of comparisons
 */
export const Tolerances = {
  EXACT: 1e-10,
  TIGHT: 1e-6,
  NUMERICAL: 1e-4,
  STATISTICAL: 0.01,
  PARAMETER_RECOVERY: 0.1, // 10% relative error is OK for parameter recovery
  BUSINESS_METRIC: 0.2 // 20% for high-level business metrics
};

/**
 * Helper to check if a value is within tolerance
 */
export function isWithinTolerance(
  actual: number, 
  expected: number, 
  tolerance: number = Tolerances.STATISTICAL
): boolean {
  if (expected === 0) {
    return Math.abs(actual) < tolerance;
  }
  return Math.abs((actual - expected) / expected) < tolerance;
}

/**
 * Helper to check if arrays are close
 */
export function arraysAreClose(
  actual: number[], 
  expected: number[], 
  tolerance: number = Tolerances.STATISTICAL
): boolean {
  if (actual.length !== expected.length) return false;
  return actual.every((val, i) => isWithinTolerance(val, expected[i], tolerance));
}