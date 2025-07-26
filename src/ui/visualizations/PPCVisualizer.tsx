// src/visualization/PPCVisualizer.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, ComposedChart, ScatterChart, Scatter 
} from 'recharts';
import { Posterior } from '../../inference/base/types';
import { CompoundPosterior } from '../../models/compound/CompoundModel';

interface PPCVisualizerProps {
  data: any;
  posterior: Posterior | CompoundPosterior;
  modelType: string;
  numPPCSamples?: number;
  showDiagnostics?: boolean;
  showComponents?: boolean;
}

export const PPCVisualizer: React.FC<PPCVisualizerProps> = ({
  data,
  posterior,
  modelType,
  numPPCSamples = 1000,
  showDiagnostics = true,
  showComponents = false
}) => {
  const [ppcSamples, setPPCSamples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  // Generate PPC samples
  useEffect(() => {
    setLoading(true);
    const samples: any[] = [];
    
    const generateSamples = async () => {
      // Handle different model types
      if ((modelType === 'compound-beta-gamma' || modelType === 'compound-beta-lognormal' || modelType === 'compound-beta-lognormalmixture') && 
          'frequency' in posterior && 'severity' in posterior) {
        // Compound model
        const compoundPosterior = posterior as CompoundPosterior;
        
        // Generate user-level samples for conversion rate estimation
        const userSamples: any[] = [];
        for (let i = 0; i < numPPCSamples; i++) {
          const freq = compoundPosterior.frequency.sample()[0];
          const converted = Math.random() < freq;
          const value = converted ? compoundPosterior.severity.sample()[0] : 0;
          userSamples.push({ converted, value });
        }
        
        // ADDITIONALLY, generate pure revenue samples for better density estimation
        // These are samples conditional on conversion
        const revenueSamples: number[] = [];
        const revenueOnlySampleSize = Math.max(5000, numPPCSamples * 5); // At least 5000 samples
        
        for (let i = 0; i < revenueOnlySampleSize; i++) {
          revenueSamples.push(compoundPosterior.severity.sample()[0]);
        }
        
        // Store both types of samples
        samples.push({
          userLevel: userSamples,
          revenueOnly: revenueSamples
        });
        
      } else if (modelType === 'beta-binomial') {
        // Binary outcomes
        const p = posterior.sample()[0];
        const n = data.trials || 1000;
        let successes = 0;
        for (let i = 0; i < n; i++) {
          if (Math.random() < p) successes++;
        }
        samples.push({ successes, trials: n });
      } else {
        // Continuous data
        for (let i = 0; i < numPPCSamples; i++) {
          samples.push(posterior.sample()[0]);
        }
      }
      
      setPPCSamples(samples);
      
      // Compute diagnostics if requested
      if (showDiagnostics) {
        const diag = computeDiagnostics(data, samples, modelType);
        setDiagnostics(diag);
      }
      
      setLoading(false);
    };
    
    generateSamples();
  }, [data, posterior, modelType, numPPCSamples, showDiagnostics]);

  // Compute diagnostic statistics
  function computeDiagnostics(observed: any, predicted: any[], type: string): any {
    if (type === 'beta-binomial') {
      const obsRate = observed.successes / observed.trials;
      const predRates = predicted.map(p => p.successes / p.trials);
      const meanPredRate = predRates.reduce((a, b) => a + b, 0) / predRates.length;
      
      return {
        observedRate: obsRate,
        predictedRate: meanPredRate,
        bias: meanPredRate - obsRate,
        coverage: checkCoverage(obsRate, predRates, 0.95)
      };
    }
    
      if (type === 'compound-beta-gamma' || type === 'compound-beta-lognormal' || type === 'compound-beta-lognormalmixture') {
    // Handle compound model structure
    const userLevelSamples = predicted[0].userLevel;
    const revenueOnlySamples = predicted[0].revenueOnly;
    
    // For compound models, compute diagnostics for both components
    const obsConvRate = observed.filter((d: any) => d.converted).length / observed.length;
    const predConvRate = userLevelSamples.filter((p: any) => p.converted).length / userLevelSamples.length;
    
    const obsRevenues = observed.filter((d: any) => d.converted && d.value > 0).map((d: any) => d.value);
    
    return {
      conversion: {
        observed: obsConvRate,
        predicted: predConvRate,
        bias: predConvRate - obsConvRate
      },
      revenue: {
        observedMean: obsRevenues.reduce((a: number, b: number) => a + b, 0) / obsRevenues.length,
        predictedMean: revenueOnlySamples.reduce((a: number, b: number) => a + b, 0) / revenueOnlySamples.length,
        ksStatistic: computeKS(obsRevenues, revenueOnlySamples)
      }
    };
  }
    
    // For continuous data
    const obsData = Array.isArray(observed) ? observed : observed.data || [];
    const mean = obsData.reduce((a: number, b: number) => a + b, 0) / obsData.length;
    const predMean = predicted.reduce((a, b) => a + b, 0) / predicted.length;
    
    return {
      observedMean: mean,
      predictedMean: predMean,
      bias: predMean - mean,
      ksStatistic: computeKS(obsData, predicted)
    };
  }

  function checkCoverage(value: number, samples: number[], level: number): boolean {
    const sorted = [...samples].sort((a, b) => a - b);
    const lower = sorted[Math.floor((1 - level) / 2 * sorted.length)];
    const upper = sorted[Math.floor((1 + level) / 2 * sorted.length)];
    return value >= lower && value <= upper;
  }

  function computeKS(data1: number[], data2: number[]): number {
    // Simplified KS statistic
    const all = [...data1, ...data2].sort((a, b) => a - b);
    let maxDiff = 0;
    
    for (const x of all) {
      const cdf1 = data1.filter(d => d <= x).length / data1.length;
      const cdf2 = data2.filter(d => d <= x).length / data2.length;
      maxDiff = Math.max(maxDiff, Math.abs(cdf1 - cdf2));
    }
    
    return maxDiff;
  }

  // Prepare visualization data
  const chartData = useMemo(() => {
    if (loading || !ppcSamples.length) return [];
    
    if (modelType === 'beta-binomial') {
      // Binary outcome visualization
      const observed = data.successes / data.trials;
      const predictions = ppcSamples.map(s => s.successes / s.trials);
      const bins = createHistogram(predictions, 20);
      
      return bins.map(bin => ({
        ...bin,
        observed: Math.abs(bin.x - observed) < 0.025 ? 0.2 : 0
      }));
    } else if (modelType === 'compound-beta-gamma' || modelType === 'compound-beta-lognormal' || modelType === 'compound-beta-lognormalmixture') {
      // Extract the compound samples
      const compoundSamples = ppcSamples[0]; // We only push one item for compound models
      const userLevelSamples = compoundSamples.userLevel;
      const revenueOnlySamples = compoundSamples.revenueOnly;
      
      // Parse observed data
      const observedData = Array.isArray(data) ? data : (data.data || []);
      
      // Conversion data (use user-level samples)
      const convData = {
        observed: observedData.filter((d: any) => d.converted).length / observedData.length,
        predicted: userLevelSamples.filter((s: any) => s.converted).length / userLevelSamples.length
      };
      
      // Revenue data - compare observed with revenue-only samples
      const observedRevenues = observedData
        .filter((d: any) => d.converted && d.value > 0)
        .map((d: any) => d.value);
      
      // Use the dedicated revenue samples for smooth density
      const predictedRevenues = revenueOnlySamples;
      
      // Determine x-range
      const allRevenues = [...observedRevenues, ...predictedRevenues];
      const minRevenue = Math.min(...allRevenues);
      const maxRevenue = Math.max(...allRevenues);
      const range = maxRevenue - minRevenue;
      
      const xMin = Math.max(0, minRevenue - range * 0.1);
      const xMax = maxRevenue + range * 0.1;
      
      // Create histogram for observed
      const bins = 30;
      const binWidth = (xMax - xMin) / bins;
      const histogram = [];
      
      for (let i = 0; i < bins; i++) {
        const binStart = xMin + i * binWidth;
        const binEnd = binStart + binWidth;
        const binCenter = (binStart + binEnd) / 2;
        
        const obsCount = observedRevenues.filter((x: number) => x >= binStart && x < binEnd).length;
        const predCount = predictedRevenues.filter((x: number) => x >= binStart && x < binEnd).length;
        
        histogram.push({
          x: binCenter,
          observed: obsCount / observedRevenues.length / binWidth,
          predicted: predCount / predictedRevenues.length / binWidth
        });
      }
      
      return { conversion: convData, revenue: histogram };
    } else {
      // Continuous data (including mixtures)
      const obsData = Array.isArray(data) ? data : data.data || [];
      
      // Check if this is a positive distribution for kernel density
      const isPositive = ['lognormal', 'lognormal-mixture', 'gamma', 'exponential'].some(t => modelType.includes(t));
      
      if (isPositive) {
        // Create x-range for smooth curve
        const allData = [...obsData, ...ppcSamples];
        const dataMin = Math.min(...allData);
        const dataMax = Math.max(...allData);
        const range = dataMax - dataMin;
        
        // For positive distributions, start at 0 or slightly below min
        const xMin = Math.max(0, dataMin - range * 0.1);
        const xMax = dataMax + range * 0.2;
        
        const xRange = [];
        const steps = 100;
        for (let i = 0; i <= steps; i++) {
          xRange.push(xMin + (xMax - xMin) * i / steps);
        }
        
        // Create smooth density curves
        const observedDensity = createKernelDensity(obsData, xRange, undefined, true);
        const predictedDensity = createKernelDensity(ppcSamples, xRange, undefined, true);
        
        return { observedDensity, predictedDensity, xRange };
      } else {
        // Use histogram for general continuous data
        return createOverlayHistogram(obsData, ppcSamples, 30, modelType);
      }
    }
  }, [loading, ppcSamples, data, modelType]);

  function createHistogram(data: number[], bins: number) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / bins;
    
    const histogram = [];
    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binWidth;
      const binEnd = binStart + binWidth;
      const count = data.filter(x => x >= binStart && x < binEnd).length;
      
      histogram.push({
        x: (binStart + binEnd) / 2,
        y: count / data.length / binWidth,
        count
      });
    }
    
    return histogram;
  }

  // Helper function to compute variance
  function variance(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / data.length;
  }

  // Kernel density estimation for smooth curves
  function createKernelDensity(
    data: number[], 
    xRange: number[], 
    bandwidth?: number,
    enforcePositive?: boolean
  ): Array<{x: number, y: number}> {
    if (!bandwidth) {
      // Scott's rule for bandwidth selection
      const std = Math.sqrt(variance(data));
      bandwidth = 1.06 * std * Math.pow(data.length, -0.2);
    }
    
    return xRange.map(x => {
      // Skip negative x values for positive distributions
      if (enforcePositive && x < 0) {
        return { x, y: 0 };
      }
      
      let density = 0;
      for (const xi of data) {
        // Gaussian kernel
        const z = (x - xi) / bandwidth;
        density += Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
      }
      density /= (data.length * bandwidth);
      
      return { x, y: density };
    });
  }

  function createOverlayHistogram(
    observed: number[], 
    predicted: number[], 
    bins: number,
    modelType?: string
  ) {
    // Filter out any invalid predictions (shouldn't happen but defensive)
    const validPredicted = predicted.filter(x => !isNaN(x) && isFinite(x));
    
    // For positive-only distributions, enforce zero minimum
    const isPositiveModel = modelType && [
      'lognormal', 
      'lognormal-mixture', 
      'gamma', 
      'exponential',
      'compound-beta-gamma',
      'compound-beta-lognormal',
      'compound-beta-lognormalmixture'
    ].includes(modelType);
    
    const allData = [...observed, ...validPredicted];
    let min = Math.min(...allData);
    let max = Math.max(...allData);
    
    // For positive distributions, constrain to positive range
    if (isPositiveModel) {
      min = Math.max(0, min * 0.9);  // Start slightly below min, but never negative
      max = max * 1.1;  // Extend slightly above max
    }
    
    const binWidth = (max - min) / bins;
    
    const histogram = [];
    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binWidth;
      const binEnd = binStart + binWidth;
      
      const obsCount = observed.filter(x => x >= binStart && x < binEnd).length;
      const predCount = validPredicted.filter(x => x >= binStart && x < binEnd).length;
      
      histogram.push({
        x: (binStart + binEnd) / 2,
        observed: obsCount / observed.length / binWidth,
        predicted: predCount / validPredicted.length / binWidth
      });
    }
    
    return histogram;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600 animate-pulse">
          Generating posterior predictive samples...
        </div>
      </div>
    );
  }

  // Render based on model type
  if (modelType === 'beta-binomial') {
    const barData = chartData as Array<{x: number; y: number; observed: number}>;
    return (
      <div className="space-y-4">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="x" 
              tickFormatter={(v: number) => `${(v * 100).toFixed(1)}%`}
              label={{ value: 'Conversion Rate', position: 'insideBottom', offset: -5 }}
            />
            <YAxis label={{ value: 'Density', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(v: any) => v.toFixed(3)} />
            <Bar dataKey="y" fill="#3B82F6" name="Posterior Predictive" />
            <Bar dataKey="observed" fill="#EF4444" name="Observed" />
          </BarChart>
        </ResponsiveContainer>
        
        {showDiagnostics && diagnostics && (
          <div className="bg-gray-50 p-4 rounded">
            <h4 className="font-semibold mb-2">Diagnostics</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>Observed Rate: {(diagnostics.observedRate * 100).toFixed(2)}%</div>
              <div>Predicted Rate: {(diagnostics.predictedRate * 100).toFixed(2)}%</div>
              <div>Bias: {(diagnostics.bias * 100).toFixed(2)}pp</div>
              <div>95% Coverage: {diagnostics.coverage ? '✓' : '✗'}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (modelType === 'compound-beta-gamma' || modelType === 'compound-beta-lognormal' || modelType === 'compound-beta-lognormalmixture') {
    const { conversion, revenue } = chartData as any;
    
    // Check if we have revenue data
    if (!revenue || revenue.length === 0) {
      return (
        <div className="p-4 bg-yellow-50 text-yellow-800 rounded">
          No revenue data to display. Check that the data includes converted users with positive values.
        </div>
      );
    }
    
    const getModelName = () => {
      switch (modelType) {
        case 'compound-beta-gamma': return 'Beta × Gamma';
        case 'compound-beta-lognormal': return 'Beta × LogNormal';
        case 'compound-beta-lognormalmixture': return 'Beta × LogNormal Mixture';
        default: return modelType;
      }
    };
    
    return (
      <div className="space-y-6">
        <div className="text-sm text-gray-600 mb-2">
          Model: {getModelName()}
        </div>
        
        {/* Conversion comparison */}
        <div>
          <h4 className="font-semibold mb-2">Conversion Rate</h4>
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded">
            <div>
              <span className="text-sm text-gray-600">Observed:</span>
              <span className="ml-2 font-mono">{(conversion.observed * 100).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-sm text-gray-600">Predicted:</span>
              <span className="ml-2 font-mono">{(conversion.predicted * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
        
        {/* Revenue distribution - now with proper overlay */}
        <div>
          <h4 className="font-semibold mb-2">Revenue Distribution (Converted Users)</h4>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="x" 
                tickFormatter={(v) => {
                  // For lognormal mixture, format as currency if values are large
                  if (modelType === 'compound-beta-lognormalmixture' && v > 100) {
                    return `$${v.toFixed(0)}`;
                  }
                  return `$${v.toFixed(0)}`;
                }}
                label={{ value: 'Revenue', position: 'insideBottom', offset: -5 }}
              />
              <YAxis label={{ value: 'Density', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                formatter={(v: any, name: string) => [v.toFixed(4), name]}
                labelFormatter={(v) => `$${v.toFixed(2)}`}
              />
              <Legend />
              
              {/* Observed data as bars */}
              <Bar 
                dataKey="observed" 
                fill="#EF4444" 
                opacity={0.6}
                name="Observed Data"
              />
              
              {/* Predicted as line/area */}
              <Line 
                type="monotone" 
                dataKey="predicted" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
                name="Posterior Predictive"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        {/* Diagnostics */}
        {showDiagnostics && diagnostics && (
          <div className="bg-gray-50 p-4 rounded">
            <h4 className="font-semibold mb-2">Diagnostics</h4>
            <div className="space-y-3">
              <div>
                <h5 className="text-sm font-medium text-gray-700">Conversion</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>Observed: {(diagnostics.conversion.observed * 100).toFixed(2)}%</div>
                  <div>Predicted: {(diagnostics.conversion.predicted * 100).toFixed(2)}%</div>
                  <div>Bias: {(diagnostics.conversion.bias * 100).toFixed(2)}pp</div>
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-700">Revenue (Converted Users)</h5>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>Observed Mean: ${diagnostics.revenue.observedMean.toFixed(2)}</div>
                  <div>Predicted Mean: ${diagnostics.revenue.predictedMean.toFixed(2)}</div>
                  <div>KS Statistic: {diagnostics.revenue.ksStatistic.toFixed(3)}</div>
                </div>
              </div>
              {modelType === 'compound-beta-lognormalmixture' && (
                <div className="text-xs text-gray-600 mt-2">
                  Note: LogNormal mixture models may show multimodal revenue distributions representing different customer segments.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Default continuous visualization
  const isPositiveDistribution = ['lognormal', 'lognormal-mixture', 'gamma', 'exponential'].some(t => modelType.includes(t));
  
  if (isPositiveDistribution && (chartData as any).observedDensity) {
    // Kernel density visualization for positive distributions
    const { observedDensity, predictedDensity } = chartData as any;
    return (
      <div className="space-y-4">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={observedDensity}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="x" 
              tickFormatter={(v: number) => {
                // For lognormal mixture, format as currency if values are large
                if (modelType === 'lognormal-mixture' && v > 100) {
                  return `$${v.toFixed(0)}`;
                }
                return v.toFixed(1);
              }}
              label={{ value: 'Value', position: 'insideBottom', offset: -5 }}
            />
            <YAxis label={{ value: 'Density', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(v: any) => v.toFixed(4)} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="y" 
              stroke="#3B82F6" 
              strokeWidth={2} 
              dot={false}
              name="Observed Data"
            />
            <Line 
              type="monotone" 
              data={predictedDensity}
              dataKey="y" 
              stroke="#EF4444" 
              strokeWidth={2} 
              dot={false}
              name="Posterior Predictive"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    );
  } else {
    // Histogram visualization for general continuous data
    const continuousData = chartData as Array<{x: number; observed: number; predicted: number}>;
    return (
      <div className="space-y-4">
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={continuousData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="x" 
              tickFormatter={(v: number) => {
                // For lognormal mixture, format as currency if values are large
                if (modelType === 'lognormal-mixture' && v > 100) {
                  return `$${v.toFixed(0)}`;
                }
                return v.toFixed(1);
              }}
              label={{ value: 'Value', position: 'insideBottom', offset: -5 }}
            />
            <YAxis label={{ value: 'Density', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(v: any) => v.toFixed(4)} />
            <Legend />
            <Bar 
              dataKey="observed" 
              fill="#3B82F6" 
              opacity={0.5} 
              name="Observed Data"
            />
            <Line 
              type="monotone" 
              dataKey="predicted" 
              stroke="#EF4444" 
              strokeWidth={3} 
              dot={false}
              name="Posterior Predictive"
            />
          </ComposedChart>
        </ResponsiveContainer>
        
        {showDiagnostics && diagnostics && (
          <div className="bg-gray-50 p-4 rounded">
            <h4 className="font-semibold mb-2">Diagnostics</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>Observed Mean: {diagnostics.observedMean.toFixed(2)}</div>
              <div>Predicted Mean: {diagnostics.predictedMean.toFixed(2)}</div>
              <div>Bias: {diagnostics.bias.toFixed(2)}</div>
              <div>KS Statistic: {diagnostics.ksStatistic.toFixed(3)}</div>
            </div>
            {(modelType === 'normal-mixture' || modelType === 'lognormal-mixture') && (
              <p className="text-xs text-gray-600 mt-2">
                Note: Mixture models may show bimodal distributions. Check if components are well-separated.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
};