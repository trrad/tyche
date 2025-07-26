import { describe, test, expect } from 'vitest';
import { ConversionValueModelVI, UserData } from '../../../models/ConversionValueModelVI';

describe('ConversionValueModelVI', () => {
  test('basic model creation and summary', () => {
    const model = new ConversionValueModelVI();
    
    model.addVariant({
      name: 'Control',
      users: [
        { converted: true, value: 100 },
        { converted: false, value: 0 },
        { converted: true, value: 120 },
      ]
    });
    
    const summary = model.getSummary();
    expect(summary).toContain('Control');
    expect(summary).toContain('Users: 3');
    expect(summary).toContain('Conversions: 2');
  });
  
  test('VI analysis with beta-binomial', async () => {
    const model = new ConversionValueModelVI();
    
    // Generate test data
    const controlUsers: UserData[] = [];
    const treatmentUsers: UserData[] = [];
    
    // Control: 10% conversion rate
    for (let i = 0; i < 100; i++) {
      controlUsers.push({ 
        converted: i < 10, 
        value: i < 10 ? 100 : 0 
      });
    }
    
    // Treatment: 15% conversion rate
    for (let i = 0; i < 100; i++) {
      treatmentUsers.push({ 
        converted: i < 15, 
        value: i < 15 ? 100 : 0 
      });
    }
    
    model.addVariant({ name: 'Control', users: controlUsers });
    model.addVariant({ name: 'Treatment', users: treatmentUsers });
    
    const results = await model.analyze({
      modelType: 'beta-binomial',
      maxIterations: 100
    });
    
    // Check structure
    expect(results.conversionRates).toBeDefined();
    expect(results.conversionRates.size).toBe(2);
    expect(results.diagnostics).toBeDefined();
    expect(results.diagnostics.converged).toBe(true);
    
    // Check posterior means are reasonable
    const controlMean = results.conversionRates.get('Control')!
      .reduce((a, b) => a + b, 0) / 1000;
    const treatmentMean = results.conversionRates.get('Treatment')!
      .reduce((a, b) => a + b, 0) / 1000;
    
    expect(controlMean).toBeGreaterThan(0.05);
    expect(controlMean).toBeLessThan(0.15);
    expect(treatmentMean).toBeGreaterThan(0.10);
    expect(treatmentMean).toBeLessThan(0.20);
  });
  
  test('model type auto-detection', async () => {
    const model = new ConversionValueModelVI();
    
    // Create data with zero inflation
    const users: UserData[] = [];
    
    // 80% don't convert (zero values)
    for (let i = 0; i < 80; i++) {
      users.push({ converted: false, value: 0 });
    }
    
    // 20% convert with varying values
    for (let i = 0; i < 20; i++) {
      users.push({ 
        converted: true, 
        value: Math.exp(Math.random() * 2 + 3) // Log-normal-ish
      });
    }
    
    model.addVariant({ name: 'Test', users });
    
    // Auto-detect should pick zero-inflated model
    const results = await model.analyze({
      modelType: 'auto',
      maxIterations: 100
    });
    
    expect(results).toBeDefined();
    expect(results.diagnostics.converged).toBe(true);
  });
  
  test('outlier detection', async () => {
    const model = new ConversionValueModelVI();
    
    const users: UserData[] = [
      { converted: true, value: 100 },
      { converted: true, value: 110 },
      { converted: true, value: 95 },
      { converted: true, value: 2500 }, // Outlier!
      { converted: false, value: 0 },
    ];
    
    model.addVariant({ name: 'Test', users });
    
    const results = await model.analyze();
    
    const outlierInfo = results.outlierInfluence.get('Test')!;
    expect(outlierInfo.topValueContribution).toBeGreaterThan(80); // Outlier is >80% of revenue
  });
  
  test('effect decomposition', async () => {
    const model = new ConversionValueModelVI();
    
    // Control: 10% conversion, $100 average
    model.addVariant({
      name: 'Control',
      users: Array(100).fill(null).map((_, i) => ({
        converted: i < 10,
        value: i < 10 ? 100 : 0
      }))
    });
    
    // Treatment: 20% conversion, $100 average (pure conversion effect)
    model.addVariant({
      name: 'Treatment', 
      users: Array(100).fill(null).map((_, i) => ({
        converted: i < 20,
        value: i < 20 ? 100 : 0
      }))
    });
    
    const results = await model.analyze();
    
    const drivers = results.effectDrivers.get('Treatment')!;
    expect(drivers.conversionComponent).toBeGreaterThan(80); // Most effect from conversion
    expect(drivers.valueComponent).toBeLessThan(20); // Little from value change
  });
});