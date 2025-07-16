/**
 * Simple A/B Test Analysis
 * 
 * This example shows how clean the code is with our pragmatic TypeScript approach
 */

import { beta, binomial } from '../src/core/distributions';
import { RandomVariable } from '../src/core/RandomVariable';

// Define experiment results
interface ExperimentResults {
  posteriorMean: number;
  credibleInterval: [number, number];
  probabilityOfImprovement: number;
  expectedLift: number;
}

/**
 * Analyze an A/B test with Beta-Binomial model
 */
export function analyzeABTest(
  controlConversions: number,
  controlTotal: number,
  treatmentConversions: number,
  treatmentTotal: number,
  priorStrength: number = 1
): ExperimentResults {
  // Create posterior distributions
  const controlPosterior = beta(
    priorStrength + controlConversions,
    priorStrength + controlTotal - controlConversions
  );
  
  const treatmentPosterior = beta(
    priorStrength + treatmentConversions,
    priorStrength + treatmentTotal - treatmentConversions
  );
  
  // Simple RNG
  const rng = () => Math.random();
  
  // Monte Carlo simulation
  const samples = 10000;
  let treatmentWins = 0;
  const lifts: number[] = [];
  
  for (let i = 0; i < samples; i++) {
    const controlRate = controlPosterior.sample(rng);
    const treatmentRate = treatmentPosterior.sample(rng);
    
    if (treatmentRate > controlRate) {
      treatmentWins++;
    }
    
    // Calculate relative lift
    if (controlRate > 0) {
      lifts.push((treatmentRate - controlRate) / controlRate);
    }
  }
  
  // Calculate statistics
  const probabilityOfImprovement = treatmentWins / samples;
  
  // Sort lifts for percentiles
  lifts.sort((a, b) => a - b);
  const lowerIndex = Math.floor(samples * 0.025);
  const upperIndex = Math.floor(samples * 0.975);
  const medianIndex = Math.floor(samples * 0.5);
  
  return {
    posteriorMean: treatmentPosterior.mean().forward(),
    credibleInterval: [lifts[lowerIndex], lifts[upperIndex]],
    probabilityOfImprovement,
    expectedLift: lifts[medianIndex]
  };
}

/**
 * Power analysis for experiment design
 */
export function calculateSampleSize(
  baselineRate: number,
  minimumDetectableEffect: number,
  power: number = 0.8,
  alpha: number = 0.05
): number {
  // This is where we'd use our distributions for power calculation
  // For now, a simple approximation
  
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableEffect);
  const pooled = (p1 + p2) / 2;
  
  // Normal approximation for sample size
  const z_alpha = 1.96; // Two-tailed 95%
  const z_beta = 0.84;  // 80% power
  
  const n = 2 * pooled * (1 - pooled) * Math.pow(z_alpha + z_beta, 2) / 
            Math.pow(p2 - p1, 2);
  
  return Math.ceil(n);
}

/**
 * Example usage
 */
export function runExample() {
  console.log('=== Simple A/B Test Analysis ===\n');
  
  // Test data
  const control = { conversions: 120, total: 1000 };
  const treatment = { conversions: 145, total: 1000 };
  
  console.log(`Control: ${control.conversions}/${control.total} = ${(control.conversions/control.total*100).toFixed(1)}%`);
  console.log(`Treatment: ${treatment.conversions}/${treatment.total} = ${(treatment.conversions/treatment.total*100).toFixed(1)}%`);
  
  // Analyze
  const results = analyzeABTest(
    control.conversions,
    control.total,
    treatment.conversions,
    treatment.total
  );
  
  console.log('\nResults:');
  console.log(`Probability treatment is better: ${(results.probabilityOfImprovement * 100).toFixed(1)}%`);
  console.log(`Expected lift: ${(results.expectedLift * 100).toFixed(1)}%`);
  console.log(`95% Credible interval: [${(results.credibleInterval[0] * 100).toFixed(1)}%, ${(results.credibleInterval[1] * 100).toFixed(1)}%]`);
  
  // Sample size calculation
  const requiredSampleSize = calculateSampleSize(0.12, 0.20);
  console.log(`\nTo detect a 20% lift from 12% baseline with 80% power: ${requiredSampleSize} per group`);
}

// Clean, simple, focused on the domain
if (require.main === module) {
  runExample();
}