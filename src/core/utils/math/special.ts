// src/core/math/special.ts
/**
 * Special mathematical functions - standalone implementations
 */

// Simple but accurate logGamma using Stirling's approximation
export function logGamma(x: number): number {
    if (x <= 0) return NaN;
    
    if (x > 10) {
      const LOG_SQRT_TWO_PI = 0.91893853320467274178;
      return (x - 0.5) * Math.log(x) - x + LOG_SQRT_TWO_PI + 1/(12*x);
    }
    
    let result = 0;
    while (x < 10) {
      result -= Math.log(x);
      x += 1;
    }
    
    const LOG_SQRT_TWO_PI = 0.91893853320467274178;
    return result + (x - 0.5) * Math.log(x) - x + LOG_SQRT_TWO_PI + 1/(12*x);
  }
  
  // Error function - good enough for Normal CDF
  export function erf(x: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    
    return sign * y;
  }
  
  export function erfc(x: number): number {
    return 1 - erf(x);
  }
  
  // Inverse error function - approximation
  export function erfInv(x: number): number {
    if (x >= 1) return Infinity;
    if (x <= -1) return -Infinity;
    if (x === 0) return 0;
    
    // More accurate implementation using rational approximation
    // Based on "A handy approximation for the error function and its inverse"
    // by Sergei Winitzki
    
    const a = 0.147;  // Winitzki's constant
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    
    const ln1mx2 = Math.log(1 - x * x);
    const firstTerm = 2 / (Math.PI * a) + ln1mx2 / 2;
    const secondTerm = ln1mx2 / a;
    
    const result = Math.sqrt(
      Math.sqrt(firstTerm * firstTerm - secondTerm) - firstTerm
    );
    
    return sign * result;
  }
  
  // Rest of your functions...
  export function logBeta(a: number, b: number): number {
    if (a <= 0 || b <= 0) return -Infinity;
    return logGamma(a) + logGamma(b) - logGamma(a + b);
  }
  
  export function logFactorial(n: number): number {
    if (n < 0) return -Infinity;
    if (n <= 1) return 0;
    
    if (n < 20) {
      let result = 0;
      for (let i = 2; i <= n; i++) {
        result += Math.log(i);
      }
      return result;
    }
    
    return logGamma(n + 1);
  }
  
  export function logBinomial(n: number, k: number): number {
    if (k > n || k < 0 || n < 0) return -Infinity;
    if (k === 0 || k === n) return 0;
    
    if (k > n - k) k = n - k;
    
    if (n < 20) {
      let result = 0;
      for (let i = 0; i < k; i++) {
        result += Math.log(n - i) - Math.log(i + 1);
      }
      return result;
    }
    
    return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  }