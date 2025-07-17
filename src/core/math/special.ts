// src/core/math/special.ts
/**
 * Special mathematical functions using best-in-class micro-libraries
 */

// Note: You'll need to install these packages:
// npm install --save gamma math-erf

// Import from micro-libraries (these provide correct implementations)
export { logGamma } from 'gamma';
export { erf, erfc, erfInv } from 'math-erf';

// Re-import for local use
import { logGamma } from 'gamma';

/**
 * Log of the beta function: log(B(a,b)) = log(Γ(a)) + log(Γ(b)) - log(Γ(a+b))
 */
export function logBeta(a: number, b: number): number {
  if (a <= 0 || b <= 0) return -Infinity;
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Log factorial - efficient implementation
 */
export function logFactorial(n: number): number {
  if (n < 0) return -Infinity;
  if (n <= 1) return 0;
  
  // For small n, use exact calculation
  if (n < 20) {
    let result = 0;
    for (let i = 2; i <= n; i++) {
      result += Math.log(i);
    }
    return result;
  }
  
  // For large n, use gamma function
  // n! = Γ(n+1), so log(n!) = log(Γ(n+1))
  return logGamma(n + 1);
}

/**
 * Log binomial coefficient: log(n choose k)
 */
export function logBinomial(n: number, k: number): number {
  if (k > n || k < 0 || n < 0) return -Infinity;
  if (k === 0 || k === n) return 0;
  
  // Use symmetry property
  if (k > n - k) {
    k = n - k;
  }
  
  // For small values, use direct calculation for accuracy
  if (n < 20) {
    let result = 0;
    for (let i = 0; i < k; i++) {
      result += Math.log(n - i) - Math.log(i + 1);
    }
    return result;
  }
  
  // For large values, use gamma function
  // (n choose k) = n! / (k! * (n-k)!)
  // log(n choose k) = log(n!) - log(k!) - log((n-k)!)
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Digamma function (psi function) - derivative of log gamma
 * Simple approximation for now
 */
export function digamma(x: number): number {
  if (x <= 0) return NaN;
  
  // For large x, use asymptotic expansion
  if (x > 10) {
    return Math.log(x) - 0.5/x - 1/(12*x*x);
  }
  
  // For small x, use recurrence relation to shift to large x
  let result = 0;
  while (x < 10) {
    result -= 1/x;
    x += 1;
  }
  
  return result + Math.log(x) - 0.5/x - 1/(12*x*x);
}

/**
 * Log of the absolute value of the gamma function
 * Returns [log|Γ(x)|, sign of Γ(x)]
 */
export function logAbsGamma(x: number): [number, number] {
  if (x > 0) {
    return [logGamma(x), 1];
  }
  
  // For negative x, use reflection formula
  // Γ(x)Γ(1-x) = π/sin(πx)
  const logAbsValue = Math.log(Math.PI) - Math.log(Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  
  // Sign alternates for negative integers
  const sign = Math.floor(-x) % 2 === 0 ? 1 : -1;
  
  return [logAbsValue, sign];
}