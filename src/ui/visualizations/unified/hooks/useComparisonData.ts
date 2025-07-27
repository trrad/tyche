import { useMemo } from 'react';
import { DistributionState, ComparisonConfig, ComparisonResult } from '../types';

interface UseComparisonDataOptions {
  distributionStates: DistributionState[];
  comparison?: ComparisonConfig;
  enabled: boolean;
}

export function useComparisonData({
  distributionStates,
  comparison,
  enabled
}: UseComparisonDataOptions): ComparisonResult[] | null {
  return useMemo(() => {
    if (!enabled || !comparison?.mode || distributionStates.length < 2) {
      return null;
    }
    
    // All distributions must have samples
    if (distributionStates.some(d => !d.samples)) {
      return null;
    }
    
    // Determine baseline
    const baselineId = comparison.baseline || distributionStates[0].id;
    const baseline = distributionStates.find(d => d.id === baselineId);
    if (!baseline || !baseline.samples) return null;
    
    // Compare each non-baseline distribution to baseline
    const comparisons: ComparisonResult[] = [];
    
    for (const dist of distributionStates) {
      if (dist.id === baselineId || !dist.samples) continue;
      
      const comparisonSamples = computeComparison(
        baseline.samples,
        dist.samples,
        comparison.mode
      );
      
      if (comparisonSamples.length === 0) continue;
      
      const stats = calculateComparisonStats(
        comparisonSamples,
        comparison.mode,
        baseline.samples,
        dist.samples
      );
      
      comparisons.push({
        id: `${dist.id}_vs_${baselineId}`,
        label: `${dist.label} vs ${baseline.label}`,
        baselineId,
        comparisonId: dist.id,
        samples: comparisonSamples,
        stats
      });
    }
    
    return comparisons;
  }, [distributionStates, comparison, enabled]);
}

// Compute pairwise comparison between distributions
function computeComparison(
  baseline: number[],
  treatment: number[],
  mode: NonNullable<ComparisonConfig['mode']>
): number[] {
  const n = Math.min(baseline.length, treatment.length);
  const comparison: number[] = [];
  
  for (let i = 0; i < n; i++) {
    let value: number;
    
    switch (mode) {
      case 'difference':
        value = treatment[i] - baseline[i];
        break;
        
      case 'ratio':
        if (baseline[i] > 0) {
          value = treatment[i] / baseline[i];
        } else {
          continue; // Skip zero baseline values
        }
        break;
        
      case 'log-ratio':
        if (baseline[i] > 0 && treatment[i] > 0) {
          value = Math.log(treatment[i]) - Math.log(baseline[i]);
        } else {
          continue; // Skip non-positive values
        }
        break;
        
      case 'percentage-change':
        if (baseline[i] !== 0) {
          value = (treatment[i] - baseline[i]) / Math.abs(baseline[i]);
        } else {
          continue; // Skip zero baseline values
        }
        break;
        
      default:
        continue;
    }
    
    if (isFinite(value) && !isNaN(value)) {
      comparison.push(value);
    }
  }
  
  return comparison;
}

// Calculate statistics for comparison
function calculateComparisonStats(
  comparisonSamples: number[],
  mode: NonNullable<ComparisonConfig['mode']>,
  baselineSamples: number[],
  treatmentSamples: number[]
) {
  const sorted = [...comparisonSamples].sort((a, b) => a - b);
  const n = sorted.length;
  
  // Basic statistics
  const mean = comparisonSamples.reduce((sum, x) => sum + x, 0) / n;
  const median = sorted[Math.floor(n * 0.5)];
  
  // Multiple uncertainty intervals
  const quantile = (q: number) => sorted[Math.floor(n * q)];
  const ci95: [number, number] = [quantile(0.025), quantile(0.975)];
  const ci80: [number, number] = [quantile(0.1), quantile(0.9)];
  const ci50: [number, number] = [quantile(0.25), quantile(0.75)];
  
  // Probability of improvement (continuous measure)
  let threshold: number;
  switch (mode) {
    case 'difference':
      threshold = 0;
      break;
    case 'ratio':
    case 'percentage-change':
      threshold = mode === 'ratio' ? 1 : 0;
      break;
    case 'log-ratio':
      threshold = 0;
      break;
    default:
      threshold = 0;
  }
  
  const probabilityOfImprovement = sorted.filter(x => x > threshold).length / n;
  
  // Expected improvement (average positive effect)
  const improvements = comparisonSamples.filter(x => x > threshold);
  const expectedImprovement = improvements.length > 0
    ? improvements.reduce((sum, x) => sum + (x - threshold), 0) / n
    : 0;
  
  // Probability of exceeding various thresholds (for continuous reasoning)
  const exceedanceProbabilities = new Map<number, number>();
  const thresholds = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
  for (const t of thresholds) {
    const adjustedThreshold = mode === 'ratio' ? 1 + t : t;
    exceedanceProbabilities.set(t, sorted.filter(x => x > adjustedThreshold).length / n);
  }
  
  // Risk metrics
  const valueAtRisk05 = quantile(0.05); // 5% worst case
  const conditionalValueAtRisk05 = sorted.slice(0, Math.floor(n * 0.05))
    .reduce((sum, x) => sum + x, 0) / Math.floor(n * 0.05);
  
  return {
    mean,
    median,
    ci95,
    ci80,
    ci50,
    probabilityOfImprovement,
    expectedImprovement,
    exceedanceProbabilities,
    valueAtRisk05,
    conditionalValueAtRisk05,
    
    // Legacy fields for compatibility
    probabilityOfIncrease: probabilityOfImprovement,
    medianRatio: mode === 'ratio' ? median : 
                 mode === 'log-ratio' ? Math.exp(median) :
                 treatmentSamples[Math.floor(n * 0.5)] / baselineSamples[Math.floor(n * 0.5)]
  };
} 