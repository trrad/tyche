// src/tests/scenarios/test-scenarios.ts
import { DataGenerator } from '../utilities/synthetic/DataGenerator';
import { UserData } from '../../inference/base/types';

/**
 * Centralized test scenarios for consistent validation across the test suite
 * Uses the unified DataGenerator API with random parameters
 */
export const TestScenarios = {
  // Beta-Binomial scenarios (conversion rates)
  betaBinomial: {
    typical: {
      description: 'Typical e-commerce conversion rate',
      generateData: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const p = 0.01 + Math.random() * 0.14; // Random rate 1-15%
        return DataGenerator.scenarios.betaBinomial.realistic(p, n || 10000, seed || 12345).data;
      },
      generateDataset: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const p = 0.01 + Math.random() * 0.14; // Random rate 1-15%
        return DataGenerator.scenarios.betaBinomial.realistic(p, n || 10000, seed || 12345);
      }
    },
    
    highConversion: {
      description: 'High conversion rate (e.g., email clicks)',
      generateData: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const p = 0.15 + Math.random() * 0.25; // Random rate 15-40%
        return DataGenerator.scenarios.betaBinomial.realistic(p, n || 1000, seed || 12345).data;
      },
      generateDataset: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const p = 0.15 + Math.random() * 0.25; // Random rate 15-40%
        return DataGenerator.scenarios.betaBinomial.realistic(p, n || 1000, seed || 12345);
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
      generateData: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const median = 10 + Math.random() * 200; // Random median $10-$210
        const logMean = Math.log(median);
        const logStd = 0.3 + Math.random() * 0.5; // Random spread
        return DataGenerator.scenarios.revenue.realistic(logMean, logStd, n || 1000, seed || 12345).data;
      },
      generateDataset: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const median = 10 + Math.random() * 200; // Random median $10-$210
        const logMean = Math.log(median);
        const logStd = 0.3 + Math.random() * 0.5; // Random spread
        return DataGenerator.scenarios.revenue.realistic(logMean, logStd, n || 1000, seed || 12345);
      }
    },
    
    saas: {
      description: 'SaaS MRR distribution',
      generateData: (n?: number, seed?: number) => {
        // Extract just the revenue values from the compound model
        const dataset = DataGenerator.scenarios.saas.clean(n || 500, seed || 12345);
        return dataset.data.filter((u: any) => u.converted).map((u: any) => u.value);
      },
      generateDataset: (n?: number, seed?: number) => {
        return DataGenerator.scenarios.saas.clean(n || 500, seed || 12345);
      }
    },
    
    withOutliers: {
      description: 'Revenue with whale customers',
      generateData: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const median = 50 + Math.random() * 300; // Random median $50-$350
        const logMean = Math.log(median);
        const logStd = 0.5 + Math.random() * 0.8; // Higher spread for outliers
        return DataGenerator.scenarios.revenue.noisy(logMean, logStd, n || 1000, seed || 12345).data;
      },
      generateDataset: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const median = 50 + Math.random() * 300; // Random median $50-$350
        const logMean = Math.log(median);
        const logStd = 0.5 + Math.random() * 0.8; // Higher spread for outliers
        return DataGenerator.scenarios.revenue.noisy(logMean, logStd, n || 1000, seed || 12345);
      }
    }
  },

  // Compound scenarios
  compound: {
    controlVariant: {
      description: 'Random conversion & AOV',
      generateUsers: (n?: number, seed?: number) => {
        return DataGenerator.scenarios.ecommerce.clean(n || 1000, seed || 12345).data;
      },
      generateDataset: (n?: number, seed?: number) => {
        return DataGenerator.scenarios.ecommerce.clean(n || 1000, seed || 12345);
      }
    },
    
    treatmentVariant: {
      description: 'Improved conversion & AOV',
      generateUsers: (n?: number, seed?: number) => {
        // Create a modified version with higher conversion and revenue
        const gen = new DataGenerator(seed || 12346);
        const users: any[] = [];
        const convRate = 0.05 + Math.random() * 0.15; // Random 5-20%
        
        for (let i = 0; i < (n || 1000); i++) {
          const converted = Math.random() < convRate;
          let value = 0;
          
          if (converted) {
            // LogNormal with random parameters
            const median = 40 + Math.random() * 80; // Random median $40-$120
            const logMean = Math.log(median);
            const logStd = 0.6 + Math.random() * 0.4; // Random spread
            value = Math.exp(gen.continuous('normal', { mean: logMean, std: logStd }, 1).data[0]);
          }
          
          users.push({ converted, value });
        }
        
        return users;
      }
    },
    
    multimodalRevenue: {
      description: 'Budget vs premium customer segments',
      generateUsers: (n?: number, seed?: number) => {
        // This uses the segments scenario but returns as compound data
        const gen = new DataGenerator(seed || 12345);
        const convRate = 0.05 + Math.random() * 0.15; // Random 5-20%
        const users: any[] = [];
        
        // Generate segment revenues
        const segmentData = DataGenerator.scenarios.segments.realistic(n || 2000, seed || 12345);
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
      generateData: (n?: number, seed?: number) => {
        const gen = new DataGenerator(seed || 12345);
        const mean1 = 5 + Math.random() * 15; // Random first component
        const mean2 = 20 + Math.random() * 20; // Random second component
        const weight1 = 0.3 + Math.random() * 0.4; // Random weight 30-70%
        return gen.mixture([
          { distribution: 'normal', params: [mean1, 2], weight: weight1 },
          { distribution: 'normal', params: [mean2, 3], weight: 1 - weight1 }
        ], n || 500).data;
      }
    },
    
    revenueMixture: {
      description: 'LogNormal mixture for customer tiers',
      generateData: (n?: number, seed?: number) => {
        return DataGenerator.scenarios.segments.realistic(n || 500, seed || 12345).data;
      },
      generateDataset: (n?: number, seed?: number) => {
        return DataGenerator.scenarios.segments.realistic(n || 500, seed || 12345);
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