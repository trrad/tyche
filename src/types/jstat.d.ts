// Basic type declarations for jstat
// Place this in src/types/jstat.d.ts

declare module 'jstat' {
    export interface jStat {
      beta: {
        sample(alpha: number, beta: number): number;
        inv(p: number, alpha: number, beta: number): number;
        pdf(x: number, alpha: number, beta: number): number;
        cdf(x: number, alpha: number, beta: number): number;
      };
      
      normal: {
        sample(mean: number, std: number): number;
        pdf(x: number, mean: number, std: number): number;
        inv(p: number, mean: number, std: number): number;
      };
      
      lognormal: {
        pdf(x: number, logMean: number, logStd: number): number;
      };
      
      variance(data: number[], sample?: boolean): number;
      mean(data: number[]): number;
      median(data: number[]): number;
      stdev(data: number[], flag?: boolean): number;
      
      // Special functions
      betaln(a: number, b: number): number;
      gammaln(x: number): number;
      gamma: {
        sample(shape: number, scale: number): number;
        inv(p: number, shape: number, scale: number): number;
        pdf(x: number, shape: number, scale: number): number;
        cdf(x: number, shape: number, scale: number): number;
      };
    }
    
    const jStat: jStat;
    export default jStat;
  }