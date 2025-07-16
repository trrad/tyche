/**
 * Browser-friendly A/B test analysis for development
 */

import { beta } from '../core/distributions/Beta';

export interface ABTestResults {
  probabilityOfImprovement: number;
  expectedLift: number;
  credibleInterval: [number, number];
  controlRate: number;
  treatmentRate: number;
}

/**
 * Analyze A/B test results using Bayesian inference
 */
export function analyzeABTest(
  controlConversions: number,
  controlTotal: number,
  treatmentConversions: number,
  treatmentTotal: number,
  priorAlpha: number = 1,
  priorBeta: number = 1
): ABTestResults {
  // Create posterior distributions
  const controlPosterior = beta(
    priorAlpha + controlConversions,
    priorBeta + controlTotal - controlConversions
  );
  
  const treatmentPosterior = beta(
    priorAlpha + treatmentConversions,
    priorBeta + treatmentTotal - treatmentConversions
  );
  
  // Simple RNG
  const rng = () => Math.random();
  
  // Monte Carlo simulation
  const samples = 10000;
  let treatmentWins = 0;
  const lifts: number[] = [];
  const controlSamples: number[] = [];
  const treatmentSamples: number[] = [];
  
  for (let i = 0; i < samples; i++) {
    const controlRate = controlPosterior.sample(rng);
    const treatmentRate = treatmentPosterior.sample(rng);
    
    controlSamples.push(controlRate);
    treatmentSamples.push(treatmentRate);
    
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
  const lowerIndex = Math.floor(lifts.length * 0.025);
  const upperIndex = Math.floor(lifts.length * 0.975);
  const medianIndex = Math.floor(lifts.length * 0.5);
  
  // Calculate observed rates
  const controlRate = controlConversions / controlTotal;
  const treatmentRate = treatmentConversions / treatmentTotal;
  
  return {
    probabilityOfImprovement,
    expectedLift: lifts[medianIndex],
    credibleInterval: [lifts[lowerIndex], lifts[upperIndex]],
    controlRate,
    treatmentRate
  };
}

/**
 * Generate samples for visualization
 */
export function generatePosteriorSamples(
  conversions: number,
  total: number,
  numSamples: number = 1000,
  priorAlpha: number = 1,
  priorBeta: number = 1
): number[] {
  const posterior = beta(
    priorAlpha + conversions,
    priorBeta + total - conversions
  );
  
  const rng = () => Math.random();
  const samples: number[] = [];
  
  for (let i = 0; i < numSamples; i++) {
    samples.push(posterior.sample(rng));
  }
  
  return samples;
}

/**
 * Simple histogram data for visualization
 */
export function createHistogram(
  samples: number[],
  bins: number = 50
): { x: number, y: number }[] {
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const binWidth = (max - min) / bins;
  
  const histogram = new Array(bins).fill(0);
  
  for (const sample of samples) {
    const binIndex = Math.min(
      Math.floor((sample - min) / binWidth),
      bins - 1
    );
    histogram[binIndex]++;
  }
  
  return histogram.map((count, i) => ({
    x: min + (i + 0.5) * binWidth,
    y: count / samples.length / binWidth  // Density
  }));
}