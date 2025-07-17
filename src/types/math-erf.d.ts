// src/types/math-erf.d.ts
declare module 'math-erf' {
    /**
     * Error function
     * @param x The input value
     * @returns erf(x)
     */
    export function erf(x: number): number;
    
    /**
     * Complementary error function
     * @param x The input value
     * @returns erfc(x) = 1 - erf(x)
     */
    export function erfc(x: number): number;
    
    /**
     * Inverse error function
     * @param x The input value (must be in (-1, 1))
     * @returns erf^(-1)(x)
     */
    export function erfInv(x: number): number;
    
    /**
     * Inverse complementary error function
     * @param x The input value (must be in (0, 2))
     * @returns erfc^(-1)(x)
     */
    export function erfcInv(x: number): number;
  }