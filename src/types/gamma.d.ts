// src/types/gamma.d.ts
declare module 'gamma' {
    /**
     * Natural logarithm of the gamma function
     * @param x The input value
     * @returns log(Γ(x))
     */
    export function logGamma(x: number): number;
    
    /**
     * Gamma function
     * @param x The input value
     * @returns Γ(x)
     */
    export function gamma(x: number): number;
  }