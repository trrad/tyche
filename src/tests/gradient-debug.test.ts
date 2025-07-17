// Final test to isolate the gradient sign issue
import { describe, test, expect } from 'vitest';
import { RandomVariable, log } from '../core/RandomVariable';

describe('Final Gradient Debug', () => {
  test('Manual Normal logProb construction', () => {
    const x = 1;
    const mu = RandomVariable.parameter(0, 'mu');
    const sigma = RandomVariable.parameter(1, 'sigma');
    
    // Build exactly what Normal.logProb does
    const xRV = RandomVariable.constant(x);
    
    // Term 1: -0.5 * log(2π)
    const term1 = RandomVariable.constant(-0.5 * Math.log(2 * Math.PI));
    
    // Term 2: -log(σ)
    const term2 = log(sigma).neg();
    
    // Term 3: -0.5 * ((x - μ) / σ)²
    const diff = xRV.subtract(mu);
    const standardized = diff.divide(sigma);
    const squared = standardized.pow(2);
    const term3 = squared.multiply(-0.5);
    
    // Check each term's gradient separately
    console.log('\n=== Term-by-term gradient analysis ===');
    
    // Term 1 gradient (should be 0)
    const grad1 = term1.backward();
    console.log('Term1 gradient w.r.t. mu:', grad1.get(mu.getNode()) || 0);
    
    // Term 2 gradient (should be 0 w.r.t. mu)
    const grad2 = term2.backward();
    console.log('Term2 gradient w.r.t. mu:', grad2.get(mu.getNode()) || 0);
    
    // Term 3 gradient (this is where the action is)
    const grad3 = term3.backward();
    console.log('Term3 gradient w.r.t. mu:', grad3.get(mu.getNode()));
    
    // Now combine all terms like in the actual implementation
    const logProb = term1.add(term2).add(term3);
    
    const fullGrad = logProb.backward();
    console.log('\nFull logProb gradient w.r.t. mu:', fullGrad.get(mu.getNode()));
    
    // The issue might be in how add() combines gradients
  });
  
  test('Check add operation gradient accumulation', () => {
    const a = RandomVariable.parameter(1, 'a');
    const b = RandomVariable.constant(2);
    const c = RandomVariable.constant(3);
    
    // d = b + c (no dependency on a)
    const d = b.add(c);
    
    // e = a + d (dependency on a)
    const e = a.add(d);
    
    const gradE = e.backward();
    console.log('Gradient of (a + (b + c)) w.r.t. a:', gradE.get(a.getNode()));
    // Should be 1
    
    // Now test with a more complex expression
    const x = RandomVariable.parameter(0, 'x');
    const term1 = RandomVariable.constant(-1);
    const term2 = RandomVariable.constant(-2);
    const term3 = x.multiply(3); // 3x
    
    const result = term1.add(term2).add(term3);
    const gradResult = result.backward();
    console.log('Gradient of (-1 + -2 + 3x) w.r.t. x:', gradResult.get(x.getNode()));
    // Should be 3
  });
  
  test('Isolate the exact computation path', () => {
    // Let's trace EXACTLY what happens in the failing test
    const mu = RandomVariable.parameter(0, 'mu');
    const sigma = RandomVariable.parameter(1, 'sigma');
    
    // Create the exact same computation
    const x = RandomVariable.constant(1);
    const LOG_TWO_PI = Math.log(2 * Math.PI);
    
    // Step by step with intermediate gradient checks
    console.log('\n=== Step-by-step computation ===');
    
    // diff = x - mu = 1 - 0 = 1
    const diff = x.subtract(mu);
    console.log('diff value:', diff.forward());
    const diffGrad = diff.backward();
    console.log('d(diff)/d(mu):', diffGrad.get(mu.getNode())); // Should be -1
    
    // standardized = diff / sigma = 1 / 1 = 1  
    const standardized = diff.divide(sigma);
    console.log('\nstandardized value:', standardized.forward());
    const stdGrad = standardized.backward();
    console.log('d(standardized)/d(mu):', stdGrad.get(mu.getNode())); // Should be -1/sigma = -1
    
    // squared = standardized^2 = 1
    const squared = standardized.pow(2);
    console.log('\nsquared value:', squared.forward());
    const sqGrad = squared.backward();
    console.log('d(squared)/d(mu):', sqGrad.get(mu.getNode())); // Should be 2*standardized*(-1/sigma) = -2
    
    // term3 = -0.5 * squared = -0.5
    const term3 = squared.multiply(-0.5);
    console.log('\nterm3 value:', term3.forward());
    const t3Grad = term3.backward();
    console.log('d(term3)/d(mu):', t3Grad.get(mu.getNode())); // Should be -0.5 * (-2) = 1
    
    // This should give us +1!
    expect(t3Grad.get(mu.getNode())).toBeCloseTo(1);
  });
});