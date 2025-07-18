// tests/models/ConversionValueModel.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ConversionValueModel, 
  VariantData, 
  UserData 
} from '../../../src/models/ConversionValueModel';
import { beta } from '../../../src/core/distributions/Beta';
import { ComputationGraph } from '../../../src/core/ComputationGraph';

describe('ConversionValueModel', () => {
  let model: ConversionValueModel;
  let graph: ComputationGraph;
  
  beforeEach(() => {
    graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);
    model = new ConversionValueModel();
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
      expect(summary).toContain('revenue/user: $17.00'); // 170/10
    });
    
    it('should handle variants with no conversions', () => {
      const data: VariantData = {
        name: 'LowPerformer',
        users: Array(100).fill({ converted: false, value: 0 })
      };
      
      model.addVariant(data);
      const summary = model.getSummary();
      
      expect(summary).toContain('Conversion Rate: 0.0%');
      expect(summary).toContain('Mean revenue: $0.00');
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
      
      const results = await model.analyze();
      const treatmentDiagnostics = results.outlierInfluence.get('Treatment')!;
      
      expect(treatmentDiagnostics.topValueContribution).toBeGreaterThan(0.95); // >95% from one user
      expect(treatmentDiagnostics.top5ValueContribution).toBeGreaterThan(0.95);
    });
  });
  
  describe('Distribution Detection', () => {
    it('should detect exponential-like distributions', () => {
      const model = new ConversionValueModel(beta(1, 1), 'auto');
      
      // Generate exponential-like data
      const values = Array(100).fill(null).map(() => -Math.log(Math.random()) * 50);
      
      // @ts-ignore - accessing private method for testing
      const detected = model.detectValueDistribution(values);
      
      // With CV ≈ 1, should suggest exponential
      expect(['exponential', 'gamma']).toContain(detected);
    });
    
    it('should detect highly skewed (lognormal) distributions', () => {
      const model = new ConversionValueModel(beta(1, 1), 'auto');
      
      // Generate lognormal data with known high CV
      // Using normal(0, 2) in log space gives CV = sqrt(exp(4) - 1) ≈ 7.3
      const values = Array(200).fill(null).map(() => {
        // Box-Muller for normal in log space
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.exp(0 + 2 * z) * 100; // LogNormal(0, 2) scaled
      });
      
      // @ts-ignore - accessing private method for testing
      const detected = model.detectValueDistribution(values);
      
      // Should detect as lognormal due to high CV
      expect(detected).toBe('lognormal');
    });
    
    it('should auto-detect distribution when adding variants', () => {
      const model = new ConversionValueModel(beta(1, 1), 'auto', 'revenue');
      
      // Add variant with highly skewed lognormal data
      const users: UserData[] = [
        ...Array(50).fill(null).map(() => {
          // Generate proper lognormal with high CV
          const u1 = Math.random();
          const u2 = Math.random();
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          return { 
            converted: true, 
            value: Math.exp(0 + 2 * z) * 100 // LogNormal(0, 2)
          };
        }),
        ...Array(50).fill({ converted: false, value: 0 })
      ];
      
      model.addVariant({ name: 'HighSkew', users });
      
      // Check summary includes detected distribution
      const summary = model.getSummary();
      expect(summary).toContain('Auto-detected value distribution: lognormal');
    });
    
    it('should default to gamma when insufficient data for auto-detection', () => {
      const model = new ConversionValueModel(beta(1, 1), 'auto');
      
      // Add variant with too few values
      const users: UserData[] = [
        { converted: true, value: 100 },
        { converted: true, value: 150 },
        { converted: false, value: 0 }
      ];
      
      model.addVariant({ name: 'SmallData', users });
      
      // @ts-ignore - accessing private method for testing
      const effective = model.getEffectiveDistribution();
      expect(effective).toBe('gamma'); // Default when no detection
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
      
      const results = await model.analyze();
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
      
      const results = await model.analyze();
      const drivers = results.effectDrivers.get('Treatment')!;
      
      // Effect is purely from value change
      expect(drivers.valueComponent).toBeGreaterThan(0.9);
      expect(drivers.conversionComponent).toBeLessThan(0.1);
    });
  });
  
  describe('Posterior Inference', () => {
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
      
      const results = await model.analyze({ iterations: 1000 });
      
      // Check posterior samples exist and are reasonable
      expect(results.conversionRates.get('Control')).toHaveLength(1000);
      expect(results.conversionRates.get('Treatment')).toHaveLength(1000);
      
      // Mean conversion rates should be close to observed
      const controlConvMean = results.conversionRates.get('Control')!
        .reduce((a, b) => a + b) / 1000;
      const treatmentConvMean = results.conversionRates.get('Treatment')!
        .reduce((a, b) => a + b) / 1000;
      
      expect(controlConvMean).toBeCloseTo(0.5, 1);
      expect(treatmentConvMean).toBeCloseTo(0.6, 1);
      
      // Relative effects should show positive lift
      const relEffects = results.relativeEffects.get('Treatment')!;
      const meanLift = relEffects.overall.reduce((a, b) => a + b) / relEffects.overall.length;
      
      expect(meanLift).toBeGreaterThan(0); // Treatment better than control
    });
  });
  
  describe('Edge Cases', () => {
    it('should handle single user variants', () => {
      const data: VariantData = {
        name: 'Tiny',
        users: [{ converted: true, value: 100 }]
      };
      
      expect(() => model.addVariant(data)).not.toThrow();
    });
    
    it('should handle all zero values', () => {
      const data: VariantData = {
        name: 'NoRevenue',
        users: Array(100).fill({ converted: true, value: 0 })
      };
      
      expect(() => model.addVariant(data)).not.toThrow();
    });
    
    it('should require reference variant for analysis', async () => {
      const data: VariantData = {
        name: 'Only',
        users: [{ converted: true, value: 100 }]
      };
      
      model.addVariant(data);
      
      // Should not throw - uses first variant as reference
      await expect(model.analyze()).resolves.toBeDefined();
    });
  });
});