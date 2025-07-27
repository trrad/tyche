export interface DensityPoint {
  value: number;
  density: number;
  quantile?: number;
}

/**
 * Calculate kernel density estimate using Gaussian kernel
 * Uses Scott's rule for bandwidth selection
 */
export function calculateKDE(
  samples: number[], 
  nPoints: number = 100,
  bandwidth?: number
): DensityPoint[] {
  if (samples.length === 0) return [];
  
  // Calculate statistics
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  
  // Scott's rule for bandwidth if not provided
  const h = bandwidth || (1.06 * std * Math.pow(n, -1/5));
  
  // Determine range with padding
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min;
  const paddedMin = min - range * 0.1;
  const paddedMax = max + range * 0.1;
  
  // Calculate density at each point
  const points: DensityPoint[] = [];
  
  for (let i = 0; i < nPoints; i++) {
    const value = paddedMin + (paddedMax - paddedMin) * i / (nPoints - 1);
    let density = 0;
    
    // Sum kernel contributions
    for (const sample of samples) {
      const u = (value - sample) / h;
      density += Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
    }
    
    density /= (n * h);
    
    // Calculate quantile (optional)
    const quantile = samples.filter(s => s <= value).length / n;
    
    points.push({ value, density, quantile });
  }
  
  return points;
}

/**
 * Alternative: Silverman's rule for bandwidth
 */
export function silvermanBandwidth(samples: number[]): number {
  const n = samples.length;
  const std = standardDeviation(samples);
  const iqr = interquartileRange(samples);
  
  return 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -1/5);
}

/**
 * Calculate statistics for violin plots
 */
export function calculateViolinStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  
  return {
    mean: samples.reduce((a, b) => a + b, 0) / n,
    median: sorted[Math.floor(n * 0.5)],
    q1: sorted[Math.floor(n * 0.25)],
    q3: sorted[Math.floor(n * 0.75)],
    ci95Lower: sorted[Math.floor(n * 0.025)],
    ci95Upper: sorted[Math.floor(n * 0.975)],
    ci80Lower: sorted[Math.floor(n * 0.1)],
    ci80Upper: sorted[Math.floor(n * 0.9)],
    min: sorted[0],
    max: sorted[n - 1],
    iqr: sorted[Math.floor(n * 0.75)] - sorted[Math.floor(n * 0.25)]
  };
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function interquartileRange(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return q3 - q1;
}

/**
 * Calculate histogram data from samples
 */
export function calculateHistogram(
  samples: number[],
  binCount: number = 30
): Array<{
  x0: number;
  x1: number;
  count: number;
  density: number;
}> {
  if (samples.length === 0) return [];
  
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = max - min;
  
  // Create bins
  const binWidth = range / binCount;
  const bins: Array<{
    x0: number;
    x1: number;
    count: number;
    density: number;
  }> = [];
  
  for (let i = 0; i < binCount; i++) {
    const x0 = min + i * binWidth;
    const x1 = min + (i + 1) * binWidth;
    
    // Count samples in this bin
    const count = samples.filter(s => s >= x0 && s < x1).length;
    
    // Calculate density (count / total samples / bin width)
    const density = count / (samples.length * binWidth);
    
    bins.push({ x0, x1, count, density });
  }
  
  return bins;
} 