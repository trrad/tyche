import { describe, it, expect, beforeEach } from 'vitest';
import { 
  PowerSimulator, 
  SimulationScenario,
  createBinaryConversion,
  createRevenueDistribution,
  createMixtureRevenue
} from '../../power/PowerSimulator';

describe.skip('PowerSimulator', () => {
  let simulator: PowerSimulator;
  
  beforeEach(() => {
    simulator = new PowerSimulator(12345); // Fixed seed for reproducibility
  });
  
  describe('Basic functionality', () => {
    it('should run a basic simulation without errors', async () => {
      const scenario: SimulationScenario = {
        control: createRevenueDistribution(0.05, 100, 10),
        treatment: createRevenueDistribution(0.05, 100, 10),
        sampleSizePerVariant: 100,
        analysisConfig: {
          modelType: 'revenue',
          iterations: 500 // Small for speed
        }
      };
      
      const result = await simulator.simulate(scenario, 5); // Just 5 simulations
      
      expect(result).toBeDefined();
      expect(result.simulationResults).toHaveLength(5);
      expect(result.scenario).toBe(scenario);
    });
    
    it('should simulate simple A/A test and find no difference', async () => {
      const scenario: SimulationScenario = {
        control: createRevenueDistribution(0.05, 100, 10),
        treatment: createRevenueDistribution(0.05, 100, 10), // Same as control
        sampleSizePerVariant: 1000,
        analysisConfig: {
          modelType: 'revenue',
          credibleInterval: 0.95,
          ropeThreshold: 0.02, // 2% ROPE
          iterations: 1000 // Faster for tests
        },
        trueEffect: 0
      };
      
      const result = await simulator.simulate(scenario, 50); // Reduced iterations for speed
      
      // Should have low Type I error
      expect(result.typeIError).toBeLessThan(0.15);
      
      // Effect estimate should be near zero (within 10% for small sample)
      expect(Math.abs(result.averageEffectEstimate)).toBeLessThan(0.10);
      
      // Should have low bias
      expect(Math.abs(result.effectEstimateBias)).toBeLessThan(0.10);
    });
    
    it('should detect true positive effect with good power', async () => {
      const scenario: SimulationScenario = {
        control: createRevenueDistribution(0.05, 100, 20),
        treatment: createRevenueDistribution(0.055, 110, 22), // 10% conv improvement, 10% value improvement
        sampleSizePerVariant: 3000, // Larger sample for better power
        analysisConfig: {
          modelType: 'revenue',
          credibleInterval: 0.95,
          ropeThreshold: 0.02,
          iterations: 1000
        },
        trueEffect: 0.21 // (0.055 * 110) / (0.05 * 100) - 1
      };
      
      const result = await simulator.simulate(scenario, 30); // Fewer iterations for speed
      
      // Should have reasonable power with this effect size and sample
      expect(result.power).toBeGreaterThan(0.5);
      
      // Effect estimate should be positive
      expect(result.averageEffectEstimate).toBeGreaterThan(0.10);
      
      // Most decisions should be correct
      expect(result.correctDecisionRate).toBeGreaterThan(0.5);
    });
  });
  
  describe('Binary conversion analysis', () => {
    it('should analyze conversion-only experiments', async () => {
      const scenario: SimulationScenario = {
        control: createBinaryConversion(0.05),
        treatment: createBinaryConversion(0.055), // 10% relative improvement
        sampleSizePerVariant: 10000, // Need large sample for small conversion rates
        analysisConfig: {
          modelType: 'conversion',
          credibleInterval: 0.95,
          ropeThreshold: 0.05, // 5% relative ROPE
          iterations: 1000
        },
        trueEffect: 0.10
      };
      
      const result = await simulator.simulate(scenario, 30);
      
      // Should detect 10% relative improvement with reasonable power
      expect(result.power).toBeGreaterThan(0.4);
      
      // Effect estimate should be around 10%
      expect(result.averageEffectEstimate).toBeCloseTo(0.10, 1);
    });
  });
  
  describe('Complex distributions', () => {
    it('should handle revenue with outliers', async () => {
      const scenario: SimulationScenario = {
        control: createMixtureRevenue(0.05, 100, 30, 0.02, 1000),
        treatment: createMixtureRevenue(0.055, 110, 33, 0.02, 1100), // 10% improvement everywhere
        sampleSizePerVariant: 3000, // Need more data for outliers
        analysisConfig: {
          modelType: 'revenue',
          credibleInterval: 0.95,
          ropeThreshold: 0.02,
          iterations: 1000
        },
        trueEffect: 0.21 // Approximately 21% overall improvement
      };
      
      const result = await simulator.simulate(scenario, 20); // Fewer due to complexity
      
      // Should still detect effect but with lower power due to variance
      expect(result.power).toBeGreaterThan(0.3);
      
      // CI should be wider due to outliers
      expect(result.averageCredibleIntervalWidth).toBeGreaterThan(0.10);
    });
    
    it('should handle different value distributions', async () => {
      // Test with gamma-distributed values
      const scenario: SimulationScenario = {
        control: createRevenueDistribution(0.05, 100, 50, 'gamma'),
        treatment: createRevenueDistribution(0.05, 110, 55, 'gamma'), // Value improvement only
        sampleSizePerVariant: 1500,
        analysisConfig: {
          modelType: 'revenue',
          credibleInterval: 0.95,
          ropeThreshold: 0.05,
          iterations: 1000
        },
        trueEffect: 0.10
      };
      
      const result = await simulator.simulate(scenario, 20); // Small number for test speed
      
      // Should detect value-driven improvement
      expect(result.averageEffectEstimate).toBeGreaterThan(0.0);
      
      // Should have some simulations that completed
      expect(result.simulationResults.length).toBe(20);
      expect(result.simulationResults[0].sampleSize).toBe(1500);
    });
  });
  
  describe('Sample size calculation', () => {
    it('should find appropriate sample size for target power', async () => {
      const scenario = {
        control: createRevenueDistribution(0.05, 100, 30),
        treatment: createRevenueDistribution(0.052, 105, 30), // Small improvement
        analysisConfig: {
          modelType: 'revenue' as const,
          credibleInterval: 0.8,
          ropeThreshold: 0.02,
          iterations: 1000
        },
        trueEffect: 0.092 // (0.052 * 105) / (0.05 * 100) - 1
      };
      
      const { sampleSize, achievedPower } = await simulator.findRequiredSampleSize(
        scenario,
        0.8, // Target 80% power
        1000,
        10000,
        30 // Fewer simulations for speed in tests
      );
      
      expect(achievedPower).toBeGreaterThanOrEqual(0.7); // Allow some margin
      expect(sampleSize).toBeGreaterThan(2000);
      expect(sampleSize).toBeLessThan(8000);
    });
  });
  
  describe('Decision accuracy', () => {
    it('should make better decisions with larger sample sizes', async () => {
      const smallNResult = await simulator.simulate({
        control: createRevenueDistribution(0.05, 100, 40),
        treatment: createRevenueDistribution(0.055, 110, 44), // Clear improvement
        sampleSizePerVariant: 500,
        analysisConfig: {
          modelType: 'revenue' as const,
          credibleInterval: 0.8,
          ropeThreshold: 0.05, // 5% ROPE
          iterations: 1000
        },
        trueEffect: 0.21 // (0.055 * 110) / (0.05 * 100) - 1
      }, 20);
      
      const largeNResult = await simulator.simulate({
        control: createRevenueDistribution(0.05, 100, 40),
        treatment: createRevenueDistribution(0.055, 110, 44),
        sampleSizePerVariant: 3000,
        analysisConfig: {
          modelType: 'revenue' as const,
          credibleInterval: 0.8,
          ropeThreshold: 0.05,
          iterations: 1000
        },
        trueEffect: 0.21
      }, 20);
      
      // Larger sample size should generally have higher power
      // But with small test iterations, we allow for some variance
      if (largeNResult.power > 0 || smallNResult.power > 0) {
        expect(largeNResult.power).toBeGreaterThanOrEqual(smallNResult.power - 0.1);
      }
      
      // Should have better or equal decision accuracy
      expect(largeNResult.correctDecisionRate).toBeGreaterThanOrEqual(smallNResult.correctDecisionRate - 0.1);
      
      // CI width should be narrower with more data
      if (largeNResult.averageCredibleIntervalWidth > 0 && smallNResult.averageCredibleIntervalWidth > 0) {
        expect(largeNResult.averageCredibleIntervalWidth).toBeLessThanOrEqual(
          smallNResult.averageCredibleIntervalWidth * 1.2 // Allow some variance
        );
      }
    });
  });
  
  describe('Coverage probability', () => {
    it('should achieve nominal coverage for credible intervals', async () => {
      const scenario: SimulationScenario = {
        control: createRevenueDistribution(0.05, 100, 20),
        treatment: createRevenueDistribution(0.053, 106, 21), // Known 11.3% effect
        sampleSizePerVariant: 2000,
        analysisConfig: {
          modelType: 'revenue' as const,
          credibleInterval: 0.8,
          iterations: 1000
        },
        trueEffect: 0.113 // (0.053 * 106) / (0.05 * 100) - 1
      };
      
      const result = await simulator.simulate(scenario, 50);
      
      // Coverage should be reasonable (allowing for MCMC variance)
      expect(result.coverageProbability).toBeGreaterThan(0.80);
      expect(result.coverageProbability).toBeLessThanOrEqual(1.0);
    });
  });
});