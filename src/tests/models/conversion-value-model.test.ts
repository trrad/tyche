// tests/models/ConversionValueModel.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ConversionValueModel, 
  VariantData, 
  UserData 
} from '../../../src/models/ConversionValueModel';
import { ComputationGraph } from '../../../src/core/ComputationGraph';

// Mock sampler for testing
class MockSampler {
  sample(model: any, iterations: number, chains: number = 1, warmup: number = 0) {
    // Generate fake samples for testing
    const dimension = model.dimension();
    const samples: number[][] = [];
    
    // Generate some variations around initial values
    const initial = model.initialValues();
    for (let i = 0; i < iterations - warmup; i++) {
      const sample = initial.map((v: number) => v + (Math.random() - 0.5) * 0.1);
      samples.push(sample);
    }
    
    return {
      samples,
      acceptanceRate: 0.45,
      diagnostics: {
        acceptanceRate: 0.45,
        effectiveSampleSize: iterations * 0.5,
        rHat: 1.01
      }
    };
  }
}

describe.skip('ConversionValueModel', () => {
  let model: ConversionValueModel;
  let graph: ComputationGraph;
  let mockSampler: MockSampler;
  
  beforeEach(() => {
    graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);
    model = new ConversionValueModel(graph);
    mockSampler = new MockSampler();
  });
  
  describe('Data Handling', () => {
    it('should correctly summarize variant data', () => {
      const data: VariantData = {
        name: 'Control',
        users: [
          { converted: false, value: 0 },
          { converted: true, value: 10 },
          { converted: false, value: 0 },
          { converted: true, value: 20 },
          { converted: true, value: 15 },
          { converted: false, value: 0 },
          { converted: true, value: 100 }, // Outlier
          { converted: false, value: 0 },
          { converted: true, value: 25 },
          { converted: false, value: 0 }
        ]
      };
      
      model.addVariant(data);
      const summary = model.getSummary();
      
      expect(summary).toContain('Trials: 10');
      expect(summary).toContain('Conversion Rate: 50.0%');
      expect(summary).toContain('Mean revenue: $34.00'); // (10+20+15+100+25)/5
      expect(summary).toContain('Median revenue: $20.00');
      expect(summary).toContain('Max revenue: $100.00');
      expect(summary).toContain('revenue/user: $17.00'); // (34*5)/10
    });
    
    it('should handle variants with no conversions', () => {
      const data: VariantData = {
        name: 'LowPerformer',
        users: Array(100).fill({ converted: false, value: 0 })
      };
      
      model.addVariant(data);
      const summary = model.getSummary();
      
      expect(summary).toContain('Conversion Rate: 0.0%');
      expect(summary).not.toContain('Mean revenue:'); // No revenue section when no conversions
    });
    
    it('should track outlier influence', async () => {
      // Control with normal distribution
      const control: VariantData = {
        name: 'Control',
        users: [
          ...Array(50).fill(null).map(() => ({ converted: true, value: 20 + Math.random() * 10 })),
          ...Array(50).fill({ converted: false, value: 0 })
        ]
      };
      
      // Treatment with one huge outlier
      const normalValues = Array(49).fill(null).map(() => ({ converted: true, value: 20 + Math.random() * 10 }));
      const normalTotal = normalValues.reduce((sum, u) => sum + u.value, 0);
      
      const treatment: VariantData = {
        name: 'Treatment',
        users: [
          { converted: true, value: normalTotal * 20 }, // Outlier is 20x the sum of all others!
          ...normalValues,
          ...Array(50).fill({ converted: false, value: 0 })
        ]
      };
      
      model.addVariant(control);
      model.addVariant(treatment);
      
      const results = await model.analyze({ sampler: mockSampler });
      const treatmentDiagnostics = results.outlierInfluence.get('Treatment')!;
      
      expect(treatmentDiagnostics.topValueContribution).toBeGreaterThan(0.95); // >95% from one user
      expect(treatmentDiagnostics.top5ValueContribution).toBeGreaterThan(0.95);
    });
  });
  
  describe('Model Structure', () => {
    it('should create parameters for each variant', () => {
      const control: VariantData = {
        name: 'Control',
        users: [
          { converted: true, value: 100 },
          { converted: false, value: 0 }
        ]
      };
      
      const treatment: VariantData = {
        name: 'Treatment',
        users: [
          { converted: true, value: 120 },
          { converted: false, value: 0 }
        ]
      };
      
      model.addVariant(control);
      model.addVariant(treatment);
      
      const params = model.getParameters();
      const paramNames = model.getParameterNames();
      
      // Should have 3 parameters per variant (conversionRate, valueMean, valueShape)
      expect(params.length).toBe(6);
      expect(paramNames).toContain('Control_conversionRate');
      expect(paramNames).toContain('Control_valueMean');
      expect(paramNames).toContain('Control_valueShape');
      expect(paramNames).toContain('Treatment_conversionRate');
      expect(paramNames).toContain('Treatment_valueMean');
      expect(paramNames).toContain('Treatment_valueShape');
    });
    
    it('should compute joint log probability', () => {
      const data: VariantData = {
        name: 'Test',
        users: [
          { converted: true, value: 50 },
          { converted: false, value: 0 },
          { converted: true, value: 75 }
        ]
      };
      
      model.addVariant(data);
      const logProb = model.getJointLogProb();
      
      // Should be a RandomVariable
      expect(logProb).toBeDefined();
      expect(typeof logProb.forward).toBe('function');
      
      // Log probability should be a finite negative number
      const logProbValue = logProb.forward();
      expect(isFinite(logProbValue)).toBe(true);
      expect(logProbValue).toBeLessThan(0);
    });
  });
  
  describe('Distribution Detection', () => {
    it('should detect exponential-like distributions', () => {
      // Generate exponential-like data
      const values = Array(100).fill(null).map(() => -Math.log(Math.random()) * 50);
      
      const detected = model.detectValueDistribution(values);
      
      // With CV ≈ 1, should suggest exponential
      expect(['exponential', 'gamma']).toContain(detected);
    });
    
    it('should detect highly skewed (lognormal) distributions', () => {
      // Generate lognormal data with known high CV
      const values = Array(200).fill(null).map(() => {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.exp(0 + 2 * z) * 100; // LogNormal(0, 2) scaled
      });
      
      const detected = model.detectValueDistribution(values);
      
      // Should detect as lognormal due to high CV
      expect(detected).toBe('lognormal');
    });
  });
  
  describe('Effect Decomposition', () => {
    it('should identify conversion-driven effects', async () => {
      const control: VariantData = {
        name: 'Control',
        users: [
          // 10% conversion, $100 average
          ...Array(10).fill(null).map(() => ({ converted: true, value: 100 })),
          ...Array(90).fill({ converted: false, value: 0 })
        ]
      };
      
      const treatment: VariantData = {
        name: 'Treatment',
        users: [
          // 20% conversion, same $100 average
          ...Array(20).fill(null).map(() => ({ converted: true, value: 100 })),
          ...Array(80).fill({ converted: false, value: 0 })
        ]
      };
      
      model.addVariant(control);
      model.addVariant(treatment);
      
      const results = await model.analyze({ sampler: mockSampler });
      const drivers = results.effectDrivers.get('Treatment')!;
      
      // Effect is purely from conversion rate change
      expect(drivers.conversionComponent).toBeGreaterThan(0.9);
      expect(drivers.valueComponent).toBeLessThan(0.1);
    });
    
    it('should identify value-driven effects', async () => {
      const control: VariantData = {
        name: 'Control',
        users: [
          // 20% conversion, $50 average
          ...Array(20).fill(null).map(() => ({ converted: true, value: 50 })),
          ...Array(80).fill({ converted: false, value: 0 })
        ]
      };
      
      const treatment: VariantData = {
        name: 'Treatment',
        users: [
          // Same 20% conversion, $100 average
          ...Array(20).fill(null).map(() => ({ converted: true, value: 100 })),
          ...Array(80).fill({ converted: false, value: 0 })
        ]
      };
      
      model.addVariant(control);
      model.addVariant(treatment);
      
      const results = await model.analyze({ sampler: mockSampler });
      const drivers = results.effectDrivers.get('Treatment')!;
      
      // Effect is purely from value change
      expect(drivers.valueComponent).toBeGreaterThan(0.9);
      expect(drivers.conversionComponent).toBeLessThan(0.1);
    });
  });
  
  describe('MCMC Integration', () => {
    it('should fit model with sampler', async () => {
      const control: VariantData = {
        name: 'Control',
        users: [
          ...Array(50).fill(null).map(() => ({ converted: true, value: 90 + Math.random() * 20 })),
          ...Array(50).fill({ converted: false, value: 0 })
        ]
      };
      
      const treatment: VariantData = {
        name: 'Treatment',
        users: [
          ...Array(60).fill(null).map(() => ({ converted: true, value: 100 + Math.random() * 20 })),
          ...Array(40).fill({ converted: false, value: 0 })
        ]
      };
      
      model.addVariant(control);
      model.addVariant(treatment);
      
      const result = await model.fit(mockSampler, { iterations: 100, warmup: 50 });
      
      expect(result).toBeDefined();
      expect(result.samples).toBeDefined();
      expect(result.samples.length).toBe(50); // 100 - 50 warmup
      expect(result.acceptanceRate).toBeCloseTo(0.45, 2);
    });
  });
  
  describe('Posterior Analysis', () => {
    it('should compute reasonable posteriors', async () => {
      const control: VariantData = {
        name: 'Control',
        users: [
          ...Array(50).fill(null).map(() => ({ converted: true, value: 90 + Math.random() * 20 })),
          ...Array(50).fill({ converted: false, value: 0 })
        ]
      };
      
      const treatment: VariantData = {
        name: 'Treatment',
        users: [
          ...Array(60).fill(null).map(() => ({ converted: true, value: 100 + Math.random() * 20 })),
          ...Array(40).fill({ converted: false, value: 0 })
        ]
      };
      
      model.addVariant(control);
      model.addVariant(treatment);
      
      const results = await model.analyze({ 
        sampler: mockSampler, 
        iterations: 1000 
      });
      
      // Check posterior samples exist and are reasonable
      expect(results.conversionRates.get('Control')).toBeDefined();
      expect(results.conversionRates.get('Treatment')).toBeDefined();
      expect(results.meanValues.get('Control')).toBeDefined();
      expect(results.meanValues.get('Treatment')).toBeDefined();
      
      // Check relative effects
      const relEffects = results.relativeEffects.get('Treatment');
      expect(relEffects).toBeDefined();
      expect(relEffects!.overall).toBeDefined();
      expect(relEffects!.overall.length).toBeGreaterThan(0);
      
      // Should show positive lift on average (Treatment better)
      const meanLift = relEffects!.overall.reduce((a, b) => a + b) / relEffects!.overall.length;
      expect(meanLift).toBeGreaterThan(0);
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle single user variants', () => {
      const data: VariantData = {
        name: 'Tiny',
        users: [{ converted: true, value: 100 }]
      };
      
      expect(() => model.addVariant(data)).not.toThrow();
      
      // Should be able to compute log probability
      const logProb = model.getJointLogProb();
      expect(() => logProb.forward()).not.toThrow();
    });
    
    it('should handle all zero values', () => {
      const data: VariantData = {
        name: 'NoRevenue',
        users: Array(100).fill({ converted: true, value: 0 })
      };
      
      expect(() => model.addVariant(data)).not.toThrow();
    });
    
    it('should handle empty data gracefully', async () => {
      const data: VariantData = {
        name: 'Empty',
        users: []
      };
      
      model.addVariant(data);
      
      // Should not throw during analysis
      await expect(model.analyze({ sampler: mockSampler })).resolves.toBeDefined();
    });
  });
});