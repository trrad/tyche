/**
 * Basic Examples demonstrating Tyche's distributions and inference
 * 
 * This shows how to use the library for common statistical analyses
 * including A/B testing, parameter estimation, and Bayesian updating.
 */

import { RandomVariable } from '../src/core/RandomVariable';
import { beta } from '../src/core/distributions/Beta';
import { binomial } from '../src/core/distributions/Binomial';
import { normal } from '../src/core/distributions/Normal';
import { ComputationGraph } from '../src/core/ComputationGraph';

/**
 * Example 1: Beta-Binomial A/B Test Analysis
 * Classic conjugate analysis for conversion rate testing
 */
export async function betaBinomialExample() {
  console.log('=== Beta-Binomial A/B Test Example ===\n');
  
  // Prior: Beta(1, 1) - uniform prior
  const priorAlpha = 1;
  const priorBeta = 1;
  
  console.log(`Prior: Beta(${priorAlpha}, ${priorBeta})`);
  
  // Data from our A/B test
  const controlData = { successes: 45, trials: 500 };
  const treatmentData = { successes: 58, trials: 500 };
  
  console.log(`\nControl: ${controlData.successes}/${controlData.trials} = ${(controlData.successes/controlData.trials*100).toFixed(1)}%`);
  console.log(`Treatment: ${treatmentData.successes}/${treatmentData.trials} = ${(treatmentData.successes/treatmentData.trials*100).toFixed(1)}%`);
  
  // Analytical posterior (conjugate update)
  const controlPosterior = {
    alpha: priorAlpha + controlData.successes,
    beta: priorBeta + controlData.trials - controlData.successes
  };
  
  const treatmentPosterior = {
    alpha: priorAlpha + treatmentData.successes,
    beta: priorBeta + treatmentData.trials - treatmentData.successes
  };
  
  // Create beta distributions
  const controlDist = beta(controlPosterior.alpha, controlPosterior.beta);
  const treatmentDist = beta(treatmentPosterior.alpha, treatmentPosterior.beta);
  
  // Calculate posterior statistics
  console.log(`\nPosterior distributions:`);
  console.log(`Control: Beta(${controlPosterior.alpha}, ${controlPosterior.beta})`);
  console.log(`  Mean: ${controlDist.mean().forward().toFixed(4)}`);
  console.log(`  Std: ${Math.sqrt(controlDist.variance().forward()).toFixed(4)}`);
  
  console.log(`Treatment: Beta(${treatmentPosterior.alpha}, ${treatmentPosterior.beta})`);
  console.log(`  Mean: ${treatmentDist.mean().forward().toFixed(4)}`);
  console.log(`  Std: ${Math.sqrt(treatmentDist.variance().forward()).toFixed(4)}`);
  
  // Monte Carlo estimate of P(treatment > control)
  const nSamples = 10000;
  let treatmentWins = 0;
  const rng = () => Math.random();
  
  for (let i = 0; i < nSamples; i++) {
    const controlSample = controlDist.sample(rng);
    const treatmentSample = treatmentDist.sample(rng);
    
    if (treatmentSample > controlSample) {
      treatmentWins++;
    }
  }
  
  const probTreatmentBetter = treatmentWins / nSamples;
  console.log(`\nP(treatment > control) ≈ ${(probTreatmentBetter * 100).toFixed(1)}%`);
  
  // Calculate lift distribution
  const lifts: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const controlSample = controlDist.sample(rng);
    const treatmentSample = treatmentDist.sample(rng);
    lifts.push((treatmentSample - controlSample) / controlSample * 100);
  }
  
  lifts.sort((a, b) => a - b);
  const medianLift = lifts[Math.floor(lifts.length / 2)];
  const lowerLift = lifts[Math.floor(lifts.length * 0.025)];
  const upperLift = lifts[Math.floor(lifts.length * 0.975)];
  
  console.log(`\nRelative lift: ${medianLift.toFixed(1)}% [${lowerLift.toFixed(1)}%, ${upperLift.toFixed(1)}%]`);
}

/**
 * Example 2: Normal Distribution Parameter Estimation
 * Using gradient descent to find MLE for normal distribution
 */
export async function normalExample() {
  console.log('\n\n=== Normal Distribution MLE Example ===\n');
  
  // Generate some data
  const trueMean = 5;
  const trueStd = 2;
  const data = [3.2, 5.1, 4.8, 6.2, 5.5, 4.1, 5.9, 3.8, 7.1, 4.5];
  
  console.log(`Data: [${data.map(x => x.toFixed(1)).join(', ')}]`);
  console.log(`True parameters: μ=${trueMean}, σ=${trueStd}`);
  
  // Create parameters to optimize
  const mu = RandomVariable.parameter(0, 'mu');
  const sigma = RandomVariable.parameter(1, 'sigma');
  
  // Create normal distribution
  const dist = normal(mu, sigma);
  
  // Negative log likelihood
  let nll = RandomVariable.constant(0);
  for (const x of data) {
    nll = nll.subtract(dist.logProb(x));
  }
  
  console.log(`\nInitial parameters: μ=${mu.forward()}, σ=${sigma.forward()}`);
  console.log(`Initial NLL: ${nll.forward().toFixed(4)}`);
  
  // Optimize using gradient descent
  const graph = ComputationGraph.current();
  const learningRate = 0.01;
  
  for (let i = 0; i < 50; i++) {
    graph.gradientStep(nll.getNode(), learningRate);
    
    if (i % 10 === 0) {
      console.log(`Step ${i}: μ=${mu.forward().toFixed(4)}, σ=${sigma.forward().toFixed(4)}, NLL=${nll.forward().toFixed(4)}`);
    }
  }
  
  // Calculate analytical MLE for comparison
  const sampleMean = data.reduce((a, b) => a + b, 0) / data.length;
  const sampleVar = data.reduce((a, b) => a + (b - sampleMean) ** 2, 0) / data.length;
  const sampleStd = Math.sqrt(sampleVar);
  
  console.log(`\nFinal parameters: μ=${mu.forward().toFixed(4)}, σ=${sigma.forward().toFixed(4)}`);
  console.log(`Analytical MLE: μ=${sampleMean.toFixed(4)}, σ=${sampleStd.toFixed(4)}`);
}

/**
 * Example 3: Hierarchical Model with Multiple Distributions
 * Combining Beta, Binomial, and Normal distributions
 */
export async function hierarchicalExample() {
  console.log('\n\n=== Hierarchical Model Example ===\n');
  console.log('Modeling conversion rates across multiple ad campaigns');
  
  // Hyperprior on the mean conversion rate
  const globalMean = beta(10, 40); // Prior belief: ~20% conversion
  
  // Data from 3 campaigns
  const campaigns = [
    { name: 'Campaign A', successes: 12, trials: 100 },
    { name: 'Campaign B', successes: 25, trials: 100 },
    { name: 'Campaign C', successes: 18, trials: 100 }
  ];
  
  console.log('\nCampaign data:');
  campaigns.forEach(c => {
    console.log(`${c.name}: ${c.successes}/${c.trials} = ${(c.successes/c.trials*100).toFixed(1)}%`);
  });
  
  // Posterior for each campaign (simplified - not full hierarchical)
  const rng = () => Math.random();
  const globalSamples: number[] = [];
  
  // Sample from global prior
  for (let i = 0; i < 1000; i++) {
    globalSamples.push(globalMean.sample(rng));
  }
  
  console.log(`\nGlobal prior mean: ${(globalSamples.reduce((a, b) => a + b, 0) / globalSamples.length * 100).toFixed(1)}%`);
  
  // Update each campaign
  campaigns.forEach(campaign => {
    // Use global prior as starting point
    const posterior = beta(
      10 + campaign.successes,
      40 + campaign.trials - campaign.successes
    );
    
    console.log(`\n${campaign.name} posterior:`);
    console.log(`  Beta(${10 + campaign.successes}, ${40 + campaign.trials - campaign.successes})`);
    console.log(`  Mean: ${(posterior.mean().forward() * 100).toFixed(1)}%`);
    
    // Sample-based 95% credible interval
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      samples.push(posterior.sample(rng));
    }
    samples.sort((a, b) => a - b);
    const lower = samples[Math.floor(samples.length * 0.025)];
    const upper = samples[Math.floor(samples.length * 0.975)];
    console.log(`  95% CI: [${(lower * 100).toFixed(1)}%, ${(upper * 100).toFixed(1)}%]`);
  });
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  await betaBinomialExample();
  await normalExample();
  await hierarchicalExample();
}

// Run if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}