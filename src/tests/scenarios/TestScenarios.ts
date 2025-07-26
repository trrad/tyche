// src/tests/scenarios/test-scenarios.ts
import jStat from 'jstat';
import { SyntheticDataGenerator } from '../utilities/synthetic/DataGenerator';
import { BusinessScenarios } from '../utilities/synthetic/BusinessScenarios';

/**
 * Centralized test scenarios for consistent validation across the test suite
 * Leverages existing test utilities
 */
export const TestScenarios = {
  // Beta-Binomial scenarios (conversion rates)
  betaBinomial: {
    typical: {
      description: 'Typical e-commerce conversion rate',
      trueRate: 0.03,
      sampleSize: 10000,
      generateData: () => {
        const generator = new SyntheticDataGenerator(Date.now());
        const successes = Math.round(300 + (Math.random() - 0.5) * 40); // ~3% with variance
        return { successes, trials: 10000 };
      },
      generateFromBusiness: () => {
        const scenarios = new BusinessScenarios();
        const data = scenarios.ecommerce({
          baseConversionRate: 0.03,
          conversionLift: 0,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 50, variance: 400 },
          revenueLift: 0,
          sampleSize: 10000
        });
        const conversions = data.control.filter(u => u.converted).length;
        return { successes: conversions, trials: data.control.length };
      }
    },
    
    highConversion: {
      description: 'High conversion rate (e.g., email clicks)',
      trueRate: 0.25,
      sampleSize: 1000,
      generateData: () => ({
        successes: Math.round(250 + (Math.random() - 0.5) * 30),
        trials: 1000
      })
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
      generateData: (n: number = 1000) => {
        const generator = new SyntheticDataGenerator();
        // Mix of small and large purchases
        const small = generator.generateFromDistribution('lognormal', [3.5, 0.5], Math.floor(n * 0.8));
        const large = generator.generateFromDistribution('lognormal', [5, 0.3], Math.floor(n * 0.2));
        return [...small, ...large].sort(() => Math.random() - 0.5);
      },
      generateFromBusiness: (n: number = 1000) => {
        const scenarios = new BusinessScenarios();
        const data = scenarios.ecommerce({
          baseConversionRate: 1.0, // All converted for revenue-only test
          conversionLift: 0,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 55, variance: 600 },
          revenueLift: 0,
          sampleSize: n
        });
        return data.control.map(u => u.value).filter(v => v > 0);
      }
    },
    
    saas: {
      description: 'SaaS MRR distribution',
      generateData: (n: number = 500) => {
        const generator = new SyntheticDataGenerator();
        // Three tiers: starter, pro, enterprise
        const starter = generator.generateFromDistribution('lognormal', [2.3, 0.2], Math.floor(n * 0.6));
        const pro = generator.generateFromDistribution('lognormal', [3.9, 0.2], Math.floor(n * 0.3));
        const enterprise = generator.generateFromDistribution('lognormal', [5.3, 0.3], Math.floor(n * 0.1));
        return [...starter, ...pro, ...enterprise].sort(() => Math.random() - 0.5);
      }
    }
  },

  // Compound model scenarios (conversion + revenue)
  compound: {
    controlVariant: {
      description: 'Typical control in A/B test',
      conversionRate: 0.05,
      revenueParams: { logMean: 4, logStd: 0.8 }, // ~$55 average
      generateUsers: (n: number = 2000) => {
        const scenarios = new BusinessScenarios();
        const data = scenarios.ecommerce({
          baseConversionRate: 0.05,
          conversionLift: 0,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 55, variance: 1200 },
          revenueLift: 0,
          sampleSize: n
        });
        return data.control;
      }
    },
    
    treatmentVariant: {
      description: 'Treatment with improved conversion and AOV',
      conversionRate: 0.065, // 30% relative lift
      revenueParams: { logMean: 4.1, logStd: 0.8 }, // ~$60 average
      generateUsers: (n: number = 2000) => {
        const scenarios = new BusinessScenarios();
        const data = scenarios.ecommerce({
          baseConversionRate: 0.05,
          conversionLift: 0.3,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 55, variance: 1200 },
          revenueLift: 0.09, // ~9% AOV lift
          sampleSize: n * 2 // We'll take treatment half
        });
        return data.treatment;
      }
    }
  },

  // Mixture scenarios
  mixtures: {
    bimodal: {
      description: 'Clear two-component mixture',
      components: [
        { mean: -5, std: 1, weight: 0.4 },
        { mean: 5, std: 1, weight: 0.6 }
      ],
      generateData: (n: number = 1000) => {
        const generator = new SyntheticDataGenerator();
        const n1 = Math.floor(n * 0.4);
        const n2 = n - n1;
        const comp1 = generator.generateFromDistribution('normal', [-5, 1], n1);
        const comp2 = generator.generateFromDistribution('normal', [5, 1], n2);
        return [...comp1, ...comp2].sort(() => Math.random() - 0.5);
      }
    },
    
    revenueMixture: {
      description: 'Revenue with customer segments',
      generateData: (n: number = 1000) => {
        const scenarios = new BusinessScenarios();
        // Generate high-value and low-value customer segments
        const lowValue = scenarios.ecommerce({
          baseConversionRate: 1.0,
          conversionLift: 0,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 20, variance: 100 },
          revenueLift: 0,
          sampleSize: Math.floor(n * 0.7)
        });
        const highValue = scenarios.ecommerce({
          baseConversionRate: 1.0,
          conversionLift: 0,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 200, variance: 10000 },
          revenueLift: 0,
          sampleSize: Math.floor(n * 0.3)
        });
        
        const allValues = [
          ...lowValue.control.map(u => u.value),
          ...highValue.control.map(u => u.value)
        ].filter(v => v > 0);
        
        return allValues.sort(() => Math.random() - 0.5);
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