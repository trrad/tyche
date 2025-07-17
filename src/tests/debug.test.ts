// debug-tests.ts
// Additional tests to help diagnose the Normal distribution issues

import { describe, test, expect } from 'vitest';
import { normal, RandomVariable } from '..';
import { erf, erfInv } from '../core/math/special';

describe('Debug Normal Distribution Issues', () => {
  
  describe('CDF/Inverse CDF debugging', () => {
    test('erf and erfInv round-trip', () => {
      // Test if erf and erfInv are inverses of each other
      const values = [-0.9, -0.5, 0, 0.5, 0.9];
      
      for (const x of values) {
        const y = erf(x);
        const xRecovered = erfInv(y);
        console.log(`x=${x}, erf(x)=${y}, erfInv(erf(x))=${xRecovered}`);
        expect(xRecovered).toBeCloseTo(x, 3);
      }
    });
    
    test('CDF implementation step-by-step', () => {
      const dist = normal(0, 1);
      const p = 0.7;
      
      // Manual inverse CDF calculation
      const erfInvArg = 2 * p - 1; // 2*0.7 - 1 = 0.4
      console.log(`erfInv argument: ${erfInvArg}`);
      
      const erfInvResult = erfInv(erfInvArg);
      console.log(`erfInv(${erfInvArg}) = ${erfInvResult}`);
      
      const x = Math.sqrt(2) * erfInvResult;
      console.log(`Quantile x = sqrt(2) * erfInv(0.4) = ${x}`);
      
      // Manual CDF calculation
      const standardized = x / Math.sqrt(2);
      console.log(`Standardized for CDF: ${standardized}`);
      
      const erfResult = erf(standardized);
      console.log(`erf(${standardized}) = ${erfResult}`);
      
      const cdfResult = 0.5 * (1 + erfResult);
      console.log(`CDF result: 0.5 * (1 + ${erfResult}) = ${cdfResult}`);
      
      // Compare with distribution methods
      const xFromDist = dist.inverseCDF(p);
      const cdfFromDist = dist.cdf(xFromDist);
      
      console.log(`\nDistribution inverseCDF(${p}) = ${xFromDist}`);
      console.log(`Distribution cdf(${xFromDist}) = ${cdfFromDist}`);
    });
  });
  
  describe('Gradient debugging', () => {
    test('subtract gradient direction', () => {
      // Test if subtract has the right gradient
      const a = RandomVariable.parameter(5, 'a');
      const b = RandomVariable.parameter(3, 'b');
      
      // c = a - b = 5 - 3 = 2
      const c = a.subtract(b);
      
      const gradients = c.backward();
      console.log(`Gradient of (a - b) w.r.t. a: ${gradients.get(a.getNode())}`);
      console.log(`Gradient of (a - b) w.r.t. b: ${gradients.get(b.getNode())}`);
      
      expect(gradients.get(a.getNode())).toBe(1);
      expect(gradients.get(b.getNode())).toBe(-1);
    });
    
    test('Normal logProb gradient breakdown', () => {
      const mu = RandomVariable.parameter(0, 'mu');
      const sigma = RandomVariable.parameter(1, 'sigma'); 
      const x = 1;
      
      // Build logProb step by step
      const xRV = RandomVariable.constant(x);
      
      // Step 1: diff = x - mu = 1 - 0 = 1
      const diff = xRV.subtract(mu);
      console.log(`diff = x - mu = ${diff.forward()}`);
      
      // Check gradient of diff w.r.t. mu
      const diffGrad = diff.backward();
      console.log(`Gradient of (x - mu) w.r.t. mu: ${diffGrad.get(mu.getNode())}`);
      
      // Step 2: standardized = diff / sigma = 1 / 1 = 1
      const standardized = diff.divide(sigma);
      console.log(`standardized = diff / sigma = ${standardized.forward()}`);
      
      // Step 3: squared = standardized^2 = 1
      const squared = standardized.pow(2);
      console.log(`squared = standardized^2 = ${squared.forward()}`);
      
      // Step 4: term3 = -0.5 * squared = -0.5
      const term3 = squared.multiply(-0.5);
      console.log(`term3 = -0.5 * squared = ${term3.forward()}`);
      
      // Check gradient of term3 w.r.t. mu
      const term3Grad = term3.backward();
      console.log(`\nGradient of term3 w.r.t. mu: ${term3Grad.get(mu.getNode())}`);
      
      // The full derivative should be:
      // d/dμ[-0.5 * ((x - μ) / σ)²] = -0.5 * 2 * (x - μ) / σ² * (-1)
      //                               = (x - μ) / σ²
      // At x=1, μ=0, σ=1: gradient = 1
      
      console.log('\nExpected gradient calculation:');
      console.log(`(x - μ) / σ² = (${x} - ${mu.forward()}) / ${sigma.forward()}² = ${(x - mu.forward()) / Math.pow(sigma.forward(), 2)}`);
    });
    
    test('Alternative gradient computation', () => {
      // Let's manually compute what the gradient should be
      const mu = 0, sigma = 1, x = 1;
      
      // Log prob = -0.5 * log(2π) - log(σ) - 0.5 * ((x - μ) / σ)²
      // d/dμ = 0 - 0 - 0.5 * d/dμ[(x - μ)² / σ²]
      //      = -0.5 * 2(x - μ) * (-1) / σ²
      //      = (x - μ) / σ²
      
      const manualGradient = (x - mu) / (sigma * sigma);
      console.log(`Manual gradient calculation: (x - μ) / σ² = ${manualGradient}`);
      
      // This should be +1, confirming our math is correct
      expect(manualGradient).toBe(1);
    });
  });
});