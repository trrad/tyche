/**
 * Tests for enhanced Result Objects implementation (Issue #108)
 * Tests the full posterior comparison functionality using real implementations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExperimentResult, VariantResult, ComparisonUtils } from '../../domain/results';
import { ResultMetadata } from '../../domain/results/ResultMetadata';
import { BetaBinomialConjugate } from '../../inference/exact/BetaBinomialConjugate';
import { LogNormalConjugate } from '../../inference/exact/LogNormalConjugate';
import { CompoundInferenceEngine } from '../../inference/compound/CompoundInferenceEngine';
import { StandardDataFactory } from '../../core/data/StandardData';
import { UserData, ModelConfig } from '../../inference/base/types';

describe('Enhanced Result Objects (Issue #108)', () => {
  describe('Compound Model Comparisons (Primary Use Case)', () => {
    let controlResult: VariantResult;
    let treatmentResult: VariantResult;
    let experimentResult: ExperimentResult;

    beforeEach(async () => {
      // Create realistic e-commerce data (conversion + revenue)
      const controlUsers: UserData[] = [];
      const treatmentUsers: UserData[] = [];

      // Control: 3% conversion, $80 average order value when converted
      for (let i = 0; i < 5000; i++) {
        const converted = Math.random() < 0.03;
        const value = converted ? 60 + Math.random() * 40 : 0; // $60-100 AOV
        controlUsers.push({ userId: `c${i}`, converted, value });
      }

      // Treatment: 4% conversion, $85 average order value (both conversion and AOV improve)
      for (let i = 0; i < 5000; i++) {
        const converted = Math.random() < 0.04;
        const value = converted ? 65 + Math.random() * 40 : 0; // $65-105 AOV
        treatmentUsers.push({ userId: `t${i}`, converted, value });
      }

      const controlData = StandardDataFactory.fromUserLevel(controlUsers);
      const treatmentData = StandardDataFactory.fromUserLevel(treatmentUsers);

      const engine = new CompoundInferenceEngine();
      const config: ModelConfig = {
        structure: 'compound',
        frequencyType: 'beta',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      const controlFit = await engine.fit(controlData, config);
      const treatmentFit = await engine.fit(treatmentData, config);

      const metadata: ResultMetadata = {
        timestamp: new Date(),
        sampleSize: 5000,
        algorithm: 'compound',
        converged: true,
      };

      controlResult = new VariantResult(controlFit.posterior, { ...metadata });
      treatmentResult = new VariantResult(treatmentFit.posterior, { ...metadata });

      const variants = new Map<string, VariantResult>();
      variants.set('control', controlResult);
      variants.set('treatment', treatmentResult);

      experimentResult = new ExperimentResult(variants, {
        timestamp: new Date(),
        experimentId: 'ecommerce-revenue-test',
      });
    });

    it('should compute comparison with real compound posteriors', async () => {
      const comparison = await ComparisonUtils.computeComparison(controlResult, treatmentResult, {
        nSamples: 10000,
      });

      expect(comparison.liftSamples).toHaveLength(10000);
      expect(comparison.effectSamples).toHaveLength(10000);

      // Should have decomposition since these are compound models
      expect(comparison.decomposition).toBeDefined();
      expect(comparison.decomposition!.combined.frequencyContribution).toHaveLength(10000);
      expect(comparison.decomposition!.combined.valueContribution).toHaveLength(10000);

      // Expected: revenue per user should increase due to both conversion and AOV improvements
      // Control: ~3% × ~$80 = ~$2.4 revenue per user
      // Treatment: ~4% × ~$85 = ~$3.4 revenue per user
      // Lift: ~42% increase in revenue per user
      const avgLift =
        comparison.liftSamples.reduce((a, b) => a + b, 0) / comparison.liftSamples.length;
      expect(avgLift).toBeGreaterThan(0.2); // At least 20% lift

      // Should have high probability of positive effect
      expect(comparison.probabilityPositive).toBeGreaterThan(0.7);
    });

    it('should work with ExperimentResult.compareVariants for compound models', async () => {
      const comparison = await experimentResult.compareVariants();

      expect(comparison.comparisons.size).toBe(1);
      expect(comparison.comparisons.has('treatment')).toBe(true);

      const treatmentComparison = comparison.comparisons.get('treatment')!;
      expect(treatmentComparison.probabilityPositive).toBeGreaterThan(0.7);
      expect(treatmentComparison.metadata.variants.baseline).toBe('control');
      expect(treatmentComparison.metadata.variants.treatment).toBe('treatment');

      // Should have decomposition for compound models
      expect(treatmentComparison.decomposition).toBeDefined();
    });

    it('should identify winning variant correctly for compound models', async () => {
      const comparison = await experimentResult.compareVariants();
      expect(comparison.winningVariant).toBe('treatment');

      const summary = await experimentResult.getExperimentSummary();
      expect(summary.primaryEffect!.isCompound).toBe(true);
    });

    it('should isolate conversion effect vs value effect in decomposition', async () => {
      // Create scenario where only conversion improves, not AOV
      const controlUsers: UserData[] = [];
      const treatmentUsers: UserData[] = [];

      // Control: 2% conversion, $100 AOV
      for (let i = 0; i < 3000; i++) {
        const converted = Math.random() < 0.02;
        const value = converted ? 90 + Math.random() * 20 : 0; // $90-110
        controlUsers.push({ userId: `c${i}`, converted, value });
      }

      // Treatment: 3% conversion, same $100 AOV (only conversion improves)
      for (let i = 0; i < 3000; i++) {
        const converted = Math.random() < 0.03;
        const value = converted ? 90 + Math.random() * 20 : 0; // Same $90-110
        treatmentUsers.push({ userId: `t${i}`, converted, value });
      }

      const controlData = StandardDataFactory.fromUserLevel(controlUsers);
      const treatmentData = StandardDataFactory.fromUserLevel(treatmentUsers);

      const engine = new CompoundInferenceEngine();
      const config: ModelConfig = {
        structure: 'compound',
        frequencyType: 'beta',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      const controlFit = await engine.fit(controlData, config);
      const treatmentFit = await engine.fit(treatmentData, config);

      const controlResult = new VariantResult(controlFit.posterior, {
        timestamp: new Date(),
        sampleSize: 3000,
        algorithm: 'compound',
        converged: true,
      });

      const treatmentResult = new VariantResult(treatmentFit.posterior, {
        timestamp: new Date(),
        sampleSize: 3000,
        algorithm: 'compound',
        converged: true,
      });

      const comparison = await ComparisonUtils.computeComparison(controlResult, treatmentResult, {
        nSamples: 1000,
      });

      expect(comparison.decomposition).toBeDefined();
      const decomp = comparison.decomposition!;

      // Since only conversion improved, frequency should dominate the effect
      const avgFreqContribution =
        decomp.combined.frequencyContribution.reduce((a, b) => a + b, 0) /
        decomp.combined.frequencyContribution.length;

      expect(avgFreqContribution).toBeGreaterThan(0.8); // Frequency contributes >80%
    });
  });

  describe('Simple Conversion Testing (Legacy/Edge Case)', () => {
    let controlResult: VariantResult;
    let treatmentResult: VariantResult;

    beforeEach(async () => {
      // Simple conversion test (like button click rates)
      const controlData = StandardDataFactory.fromBinomial(45, 1000); // 4.5% click rate
      const treatmentData = StandardDataFactory.fromBinomial(65, 1000); // 6.5% click rate

      const engine = new BetaBinomialConjugate();

      const config: ModelConfig = {
        structure: 'simple',
        type: 'beta',
        components: 1,
      };

      const controlFit = await engine.fit(controlData, config);
      const treatmentFit = await engine.fit(treatmentData, config);

      const metadata: ResultMetadata = {
        timestamp: new Date(),
        sampleSize: 1000,
        algorithm: 'conjugate',
        converged: true,
      };

      controlResult = new VariantResult(controlFit.posterior, { ...metadata });
      treatmentResult = new VariantResult(treatmentFit.posterior, { ...metadata });
    });

    it('should compute comparison with real Beta posteriors for simple conversion', async () => {
      const comparison = await ComparisonUtils.computeComparison(controlResult, treatmentResult, {
        nSamples: 5000,
      });

      expect(comparison.liftSamples).toHaveLength(5000);
      expect(comparison.effectSamples).toHaveLength(5000);

      // Should NOT have decomposition since these are simple models
      expect(comparison.decomposition).toBeUndefined();

      // Expected lift: (6.5% - 4.5%) / 4.5% ≈ 44% increase
      const avgLift =
        comparison.liftSamples.reduce((a, b) => a + b, 0) / comparison.liftSamples.length;
      expect(avgLift).toBeCloseTo(0.44, 1);

      // Should have high probability of positive effect
      expect(comparison.probabilityPositive).toBeGreaterThan(0.95);
    });

    it('should handle zero baseline edge case', async () => {
      // Create data with some zero values
      const zeroValues = [0, 0, 1, 2, 3, 5, 8, 13];
      const zeroData = StandardDataFactory.fromUserLevel(
        zeroValues.map((value, i) => ({ userId: `z${i}`, converted: value > 0, value }))
      );

      const engine = new LogNormalConjugate();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'lognormal',
        components: 1,
      };
      const zeroFit = await engine.fit(zeroData, config);
      const zeroResult = new VariantResult(zeroFit.posterior, {
        timestamp: new Date(),
        sampleSize: 8,
        algorithm: 'conjugate',
        converged: true,
      });

      const comparison = await ComparisonUtils.computeComparison(zeroResult, treatmentResult, {
        nSamples: 1000,
      });

      // Should handle gracefully without throwing
      expect(comparison.liftSamples).toHaveLength(1000);
      expect(comparison.effectSamples).toHaveLength(1000);
    });
  });

  describe('Compound Model Decomposition', () => {
    let controlResult: VariantResult;
    let treatmentResult: VariantResult;

    beforeEach(async () => {
      // Create compound model data (conversion + value)
      const controlUsers: UserData[] = [];
      const treatmentUsers: UserData[] = [];

      // Control: 20% conversion, $50 average when converted
      for (let i = 0; i < 200; i++) {
        const converted = Math.random() < 0.2;
        const value = converted ? 40 + Math.random() * 20 : 0; // $40-60 when converted
        controlUsers.push({ userId: `c${i}`, converted, value });
      }

      // Treatment: 30% conversion, $50 average when converted (same value, better conversion)
      for (let i = 0; i < 200; i++) {
        const converted = Math.random() < 0.3;
        const value = converted ? 40 + Math.random() * 20 : 0; // Same value distribution
        treatmentUsers.push({ userId: `t${i}`, converted, value });
      }

      const controlData = StandardDataFactory.fromUserLevel(controlUsers);
      const treatmentData = StandardDataFactory.fromUserLevel(treatmentUsers);

      const engine = new CompoundInferenceEngine();

      // Create compound model config
      const config: ModelConfig = {
        structure: 'compound',
        frequencyType: 'beta',
        valueType: 'lognormal',
        valueComponents: 1,
      };

      const controlFit = await engine.fit(controlData, config);
      const treatmentFit = await engine.fit(treatmentData, config);

      const metadata: ResultMetadata = {
        timestamp: new Date(),
        sampleSize: 200,
        algorithm: 'compound',
        converged: true,
      };

      controlResult = new VariantResult(controlFit.posterior, { ...metadata });
      treatmentResult = new VariantResult(treatmentFit.posterior, { ...metadata });
    });

    it('should detect compound models', () => {
      expect(controlResult.isCompoundModel()).toBe(true);
      expect(treatmentResult.isCompoundModel()).toBe(true);
    });

    it('should compute decomposition for compound models', async () => {
      const comparison = await ComparisonUtils.computeComparison(controlResult, treatmentResult, {
        nSamples: 1000,
      });

      expect(comparison.decomposition).toBeDefined();
      const decomp = comparison.decomposition!;

      expect(decomp.combined.frequencyContribution).toHaveLength(1000);
      expect(decomp.combined.valueContribution).toHaveLength(1000);
      expect(decomp.components.frequencyEffect).toHaveLength(1000);
      expect(decomp.components.valueEffect).toHaveLength(1000);

      // Contributions should sum to 1 (approximately)
      for (let i = 0; i < 100; i++) {
        // Check first 100 samples
        const total =
          decomp.combined.frequencyContribution[i] + decomp.combined.valueContribution[i];
        expect(total).toBeCloseTo(1, 1);
      }

      // Since we increased conversion rate but kept value same,
      // frequency should dominate the effect
      const avgFreqContribution =
        decomp.combined.frequencyContribution.reduce((a, b) => a + b, 0) /
        decomp.combined.frequencyContribution.length;
      expect(avgFreqContribution).toBeGreaterThan(0.6); // Frequency contributes >60%
    });

    it('should work in full experiment comparison', async () => {
      const variants = new Map<string, VariantResult>();
      variants.set('control', controlResult);
      variants.set('treatment', treatmentResult);

      const experimentResult = new ExperimentResult(variants, {
        timestamp: new Date(),
        experimentId: 'compound-test',
      });

      const comparison = await experimentResult.compareVariants();
      const treatmentComparison = comparison.comparisons.get('treatment')!;

      expect(treatmentComparison.decomposition).toBeDefined();
      expect(treatmentComparison.probabilityPositive).toBeGreaterThan(0.5);

      const summary = await experimentResult.getExperimentSummary();
      expect(summary.primaryEffect!.isCompound).toBe(true);
    });
  });

  describe('VariantResult Helper Methods', () => {
    let result: VariantResult;

    beforeEach(async () => {
      const data = StandardDataFactory.fromBinomial(45, 150);
      const engine = new BetaBinomialConjugate();
      const config: ModelConfig = {
        structure: 'simple',
        type: 'beta',
        components: 1,
      };
      const fit = await engine.fit(data, config);

      result = new VariantResult(fit.posterior, {
        timestamp: new Date(),
        sampleSize: 150,
        algorithm: 'conjugate',
        converged: true,
      });
    });

    it('should provide posterior samples', () => {
      const samples = result.getPosteriorSamples(500);
      expect(samples).toHaveLength(500);
      expect(samples.every((s) => typeof s === 'number' && s >= 0 && s <= 1)).toBe(true);
    });

    it('should provide summary statistics', () => {
      const stats = result.getSummaryStats(1000);

      expect(stats.mean).toBeCloseTo(0.3, 0.1); // Should be around 30%
      expect(stats.variance).toBeGreaterThan(0);
      expect(stats.credibleInterval[0]).toBeLessThan(stats.credibleInterval[1]);
      expect(stats.credibleInterval[0]).toBeGreaterThanOrEqual(0);
      expect(stats.credibleInterval[1]).toBeLessThanOrEqual(1);
    });

    it('should use analytical methods when available', () => {
      const stats = result.getSummaryStats(1000);

      // Beta posterior should have analytical forms
      expect(result.getPosterior().hasAnalyticalForm()).toBe(true);
      expect(typeof stats.mean).toBe('number');
      expect(typeof stats.variance).toBe('number');
    });
  });

  describe('Multiple Treatments', () => {
    it('should handle experiments with multiple treatments', async () => {
      // Create multiple variants
      const controlData = StandardDataFactory.fromBinomial(20, 100);
      const treatment1Data = StandardDataFactory.fromBinomial(25, 100);
      const treatment2Data = StandardDataFactory.fromBinomial(30, 100);

      const engine = new BetaBinomialConjugate();

      const controlFit = await engine.fit(controlData);
      const treatment1Fit = await engine.fit(treatment1Data);
      const treatment2Fit = await engine.fit(treatment2Data);

      const metadata: ResultMetadata = {
        timestamp: new Date(),
        sampleSize: 100,
        algorithm: 'conjugate',
        converged: true,
      };

      const variants = new Map<string, VariantResult>();
      variants.set('control', new VariantResult(controlFit.posterior, { ...metadata }));
      variants.set('treatment1', new VariantResult(treatment1Fit.posterior, { ...metadata }));
      variants.set('treatment2', new VariantResult(treatment2Fit.posterior, { ...metadata }));

      const experimentResult = new ExperimentResult(variants, {
        timestamp: new Date(),
        experimentId: 'multi-treatment-test',
      });

      const comparison = await experimentResult.compareVariants();

      expect(comparison.comparisons.size).toBe(2);
      expect(comparison.comparisons.has('treatment1')).toBe(true);
      expect(comparison.comparisons.has('treatment2')).toBe(true);

      // Treatment2 should win (highest conversion rate)
      expect(comparison.winningVariant).toBe('treatment2');

      const treatments = experimentResult.getTreatmentVariants();
      expect(treatments.size).toBe(2);
    });

    it('should handle custom baseline selection', async () => {
      const controlData = StandardDataFactory.fromBinomial(15, 100);
      const treatment1Data = StandardDataFactory.fromBinomial(25, 100);
      const treatment2Data = StandardDataFactory.fromBinomial(35, 100);

      const engine = new BetaBinomialConjugate();

      const controlFit = await engine.fit(controlData);
      const treatment1Fit = await engine.fit(treatment1Data);
      const treatment2Fit = await engine.fit(treatment2Data);

      const metadata: ResultMetadata = {
        timestamp: new Date(),
        sampleSize: 100,
        algorithm: 'conjugate',
        converged: true,
      };

      const variants = new Map<string, VariantResult>();
      variants.set('control', new VariantResult(controlFit.posterior, { ...metadata }));
      variants.set('treatment1', new VariantResult(treatment1Fit.posterior, { ...metadata }));
      variants.set('treatment2', new VariantResult(treatment2Fit.posterior, { ...metadata }));

      const experimentResult = new ExperimentResult(variants, {
        timestamp: new Date(),
        experimentId: 'custom-baseline-test',
      });

      // Use treatment1 as baseline
      const comparison = await experimentResult.compareVariants({ baseline: 'treatment1' });

      expect(comparison.comparisons.size).toBe(2);
      expect(comparison.comparisons.has('control')).toBe(true);
      expect(comparison.comparisons.has('treatment2')).toBe(true);

      // Check metadata reflects correct baseline
      const controlComparison = comparison.comparisons.get('control')!;
      expect(controlComparison.metadata.variants.baseline).toBe('treatment1');
      expect(controlComparison.metadata.variants.treatment).toBe('control');
    });
  });
});
