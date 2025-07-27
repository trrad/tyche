import React, { useState, useEffect } from 'react';
import * as d3 from 'd3';
import { UnifiedDistributionViz } from './UnifiedDistributionViz';
import { Distribution } from './types';
import { Posterior } from '../../../inference/base/types';
import { PosteriorProxy } from '../../../workers/PosteriorProxy';

/**
 * Example 1: Simple single distribution
 * Replaces: AsyncDistributionPlot
 */
export const SimpleDistributionExample: React.FC<{
  posterior: any;
  title?: string;
}> = ({ posterior, title = 'Parameter Distribution' }) => {
  return (
    <UnifiedDistributionViz
      distributions={[{
        id: 'main',
        label: title,
        posterior
      }]}
      display={{
        mode: 'density',
        showMean: true,
        showCI: true,
        ciLevels: [0.8, 0.5] // Show multiple uncertainty levels
      }}
      width={600}
      height={400}
      title={title}
    />
  );
};

/**
 * Example 2: Posterior Predictive Check
 * Replaces: AsyncPPCVisualizer
 */
export const PPCExample: React.FC<{
  observedData: number[];
  posterior: Posterior | PosteriorProxy;
  title?: string;
  showDiagnostics?: boolean;
}> = ({ observedData, posterior, title = "Posterior Predictive Check", showDiagnostics = true }) => {
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Calculate diagnostics when data changes
  useEffect(() => {
    if (!showDiagnostics || !observedData.length) return;

    setLoading(true);
    
    const calculateDiagnostics = async () => {
      try {
        // Generate samples for diagnostics
        let samples: number[];
        if (posterior instanceof PosteriorProxy) {
          samples = await posterior.sample(5000);
        } else {
          samples = [];
          for (let i = 0; i < 5000; i++) {
            const sample = posterior.sample()[0];
            if (!isNaN(sample) && isFinite(sample)) {
              samples.push(sample);
            }
          }
        }

        // Compute statistics
        const obsMean = observedData.reduce((a, b) => a + b, 0) / observedData.length;
        const predMean = samples.reduce((a, b) => a + b, 0) / samples.length;
        
        const obsVar = observedData.reduce((sum, x) => sum + Math.pow(x - obsMean, 2), 0) / observedData.length;
        const predVar = samples.reduce((sum, x) => sum + Math.pow(x - predMean, 2), 0) / samples.length;
        
        // Compute KS statistic
        const ks = computeKS(observedData, samples);
        
        // Check calibration
        const calibration = checkCalibration(observedData, samples);
        
        setDiagnostics({
          observedMean: obsMean,
          predictedMean: predMean,
          bias: predMean - obsMean,
          relativeBias: (predMean - obsMean) / obsMean,
          observedStd: Math.sqrt(obsVar),
          predictedStd: Math.sqrt(predVar),
          ksStatistic: ks,
          calibration
        });
      } catch (err) {
        console.error('Failed to calculate diagnostics:', err);
      } finally {
        setLoading(false);
      }
    };

    calculateDiagnostics();
  }, [observedData, posterior, showDiagnostics]);

  // Helper functions for diagnostics
  const computeKS = (observed: number[], predicted: number[]): number => {
    const sortedObs = [...observed].sort((a, b) => a - b);
    const sortedPred = [...predicted].sort((a, b) => a - b);
    
    let maxDiff = 0;
    const allValues = [...new Set([...sortedObs, ...sortedPred])].sort((a, b) => a - b);
    
    for (const value of allValues) {
      const obsECDF = sortedObs.filter(x => x <= value).length / sortedObs.length;
      const predECDF = sortedPred.filter(x => x <= value).length / sortedPred.length;
      maxDiff = Math.max(maxDiff, Math.abs(obsECDF - predECDF));
    }
    
    return maxDiff;
  };

  const checkCalibration = (observed: number[], predicted: number[]): { ci80: number; ci95: number } => {
    const sorted = [...predicted].sort((a, b) => a - b);
    
    const ci80Lower = sorted[Math.floor(sorted.length * 0.1)];
    const ci80Upper = sorted[Math.floor(sorted.length * 0.9)];
    const ci95Lower = sorted[Math.floor(sorted.length * 0.025)];
    const ci95Upper = sorted[Math.floor(sorted.length * 0.975)];
    
    const inCI80 = observed.filter(x => x >= ci80Lower && x <= ci80Upper).length;
    const inCI95 = observed.filter(x => x >= ci95Lower && x <= ci95Upper).length;
    
    return {
      ci80: (inCI80 / observed.length) * 100,
      ci95: (inCI95 / observed.length) * 100
    };
  };

  return (
    <div className="space-y-6">
      {/* Main PPC Visualization */}
      <UnifiedDistributionViz
        distributions={[
          {
            id: 'observed',
            label: 'Observed Data',
            samples: observedData,
            color: '#6b7280',
            metadata: { isObserved: true }
          } as Distribution,
          {
            id: 'predictive',
            label: 'Posterior Predictive',
            posterior: posterior,
            color: '#3b82f6'
          }
        ]}
        display={{
          mode: 'density',
          showCI: true,
          ciLevels: [0.8],
          opacity: 0.7
        }}
        width={700}
        height={400}
        title={title}
      />

      {/* Diagnostics Panel */}
      {showDiagnostics && diagnostics && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-3">
          <h3 className="font-semibold text-gray-800">Model Fit Diagnostics</h3>
          
          {loading ? (
            <div className="text-gray-600">Computing diagnostics...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Observed Mean:</span>
                  <span className="ml-2 font-mono">{diagnostics.observedMean.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Predicted Mean:</span>
                  <span className="ml-2 font-mono">{diagnostics.predictedMean.toFixed(2)}</span>
                </div>
                
                <div>
                  <span className="text-gray-600">Observed Std Dev:</span>
                  <span className="ml-2 font-mono">{diagnostics.observedStd.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Predicted Std Dev:</span>
                  <span className="ml-2 font-mono">{diagnostics.predictedStd.toFixed(2)}</span>
                </div>
                
                <div>
                  <span className="text-gray-600">Bias:</span>
                  <span className="ml-2 font-mono">{diagnostics.bias.toFixed(3)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Relative Bias:</span>
                  <span className="ml-2 font-mono">{(diagnostics.relativeBias * 100).toFixed(1)}%</span>
                </div>
              </div>
              
              <div className="border-t pt-3 mt-3">
                <div className="text-sm">
                  <span className="text-gray-600">KS Statistic:</span>
                  <span className="ml-2 font-mono">{diagnostics.ksStatistic.toFixed(3)}</span>
                  <span className="ml-2 text-gray-500">
                    ({diagnostics.ksStatistic < 0.05 ? 'Good fit' : 
                      diagnostics.ksStatistic < 0.1 ? 'Moderate fit' : 'Poor fit'})
                  </span>
                </div>
                
                <div className="text-sm mt-2">
                  <span className="text-gray-600">Calibration:</span>
                  <div className="ml-4 mt-1 space-y-1">
                    <div>80% CI contains {diagnostics.calibration.ci80.toFixed(1)}% of data</div>
                    <div>95% CI contains {diagnostics.calibration.ci95.toFixed(1)}% of data</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Example 3: A/B Test Comparison
 * Replaces: AsyncUpliftPlot
 */
export const ABTestExample: React.FC<{
  controlPosterior: any;
  treatmentPosterior: any;
  metric?: string;
  practicalThreshold?: number;
}> = ({ controlPosterior, treatmentPosterior, metric = 'Conversion Rate', practicalThreshold }) => {
  return (
    <UnifiedDistributionViz
      distributions={[
        {
          id: 'control',
          label: 'Control',
          posterior: controlPosterior,
          metadata: { isBaseline: true }
        },
        {
          id: 'treatment', 
          label: 'Treatment',
          posterior: treatmentPosterior
        }
      ]}
      comparison={{
        mode: 'difference',
        baseline: 'control',
        showProbabilityOfImprovement: true,
        showExpectedImprovement: true,
        showProbabilityOfPracticalImprovement: !!practicalThreshold,
        practicalThreshold,
        probabilityGradient: true
      }}
      display={{
        mode: 'density',
        showMean: true,
        showCI: true,
        ciLevels: [0.8, 0.5] // Show uncertainty, not "significance"
      }}
      title={`A/B Test: ${metric}`}
      subtitle="Treatment effect distribution"
      formatValue={v => `${(v * 100).toFixed(2)}%`}
      formatDifference={v => `${v > 0 ? '+' : ''}${(v * 100).toFixed(2)}pp`}
    />
  );
};

/**
 * Example 4: Multi-variant Test (A/B/n)
 * Replaces: AsyncComparisonPlot
 */
export const MultiVariantExample: React.FC<{
  variants: Array<{ id: string; name: string; posterior: any }>;
}> = ({ variants }) => {
  return (
    <UnifiedDistributionViz
      distributions={variants.map((v, i) => ({
        id: v.id,
        label: v.name,
        posterior: v.posterior,
        metadata: { 
          variantIndex: i,
          isBaseline: i === 0 
        }
      }))}
      display={{
        mode: variants.length > 4 ? 'ridge' : 'density',
        showMean: true,
        showCI: variants.length <= 4
      }}
      comparison={{
        mode: 'overlay',
        showProbabilityOfImprovement: true
      }}
      title="Multi-Variant Experiment"
      subtitle={`Comparing ${variants.length} variants`}
      width={800}
      height={variants.length > 4 ? 100 + variants.length * 80 : 400}
    />
  );
};

/**
 * Example 5: Revenue Model Components
 * Shows compound model decomposition
 */
export const RevenueModelExample: React.FC<{
  compoundPosterior: any;
}> = ({ compoundPosterior }) => {
  return (
    <UnifiedDistributionViz
      distributions={[
        {
          id: 'conversion',
          label: 'Conversion Rate',
          posterior: compoundPosterior.frequency,
          color: '#10b981'
        },
        {
          id: 'value',
          label: 'Value | Converted',
          posterior: compoundPosterior.severity,
          color: '#3b82f6'
        },
        {
          id: 'revenue',
          label: 'Revenue per User',
          posterior: compoundPosterior,
          color: '#8b5cf6'
        }
      ]}
      display={{
        mode: 'ridge',
        showMean: true,
        ridgeOverlap: 0.3
      }}
      title="Revenue Model Components"
      subtitle="Conversion × Value = Revenue"
      formatValue={v => {
        if (v < 1) return `${(v * 100).toFixed(1)}%`; // Conversion rate
        return `$${v.toFixed(2)}`; // Revenue values
      }}
    />
  );
};

/**
 * Example 6: Before/After Comparison
 * Shows percentage change
 */
export const BeforeAfterExample: React.FC<{
  beforePosterior: any;
  afterPosterior: any;
  metric: string;
}> = ({ beforePosterior, afterPosterior, metric }) => {
  return (
    <UnifiedDistributionViz
      distributions={[
        {
          id: 'before',
          label: 'Before',
          posterior: beforePosterior,
          color: '#6b7280',
          metadata: { isBaseline: true }
        },
        {
          id: 'after',
          label: 'After',
          posterior: afterPosterior,
          color: '#3b82f6'
        }
      ]}
      comparison={{
        mode: 'percentage-change',
        baseline: 'before',
        showProbabilityOfImprovement: true
      }}
      display={{
        mode: 'density',
        showMean: true,
        showCI: true
      }}
      title={`${metric}: Before vs After`}
      subtitle="Percentage change analysis"
      formatPercent={v => `${(v * 100).toFixed(1)}%`}
    />
  );
};

/**
 * Example 7: Model Comparison
 * Compare different models on same data
 */
export const ModelComparisonExample: React.FC<{
  models: Array<{ name: string; posterior: any }>;
  observedData?: number[];
}> = ({ models, observedData }) => {
  const distributions = models.map((m, i) => ({
    id: `model-${i}`,
    label: m.name,
    posterior: m.posterior,
    metadata: { variantIndex: i }
  }));
  
  if (observedData) {
    distributions.unshift({
      id: 'observed',
      label: 'Observed',
      samples: observedData,
      color: '#1f2937',
      metadata: { isObserved: true, variantIndex: 0 } as any
    });
  }
  
  return (
    <UnifiedDistributionViz
      distributions={distributions}
      display={{
        mode: 'ecdf', // ECDF good for model comparison
        showMedian: true
      }}
      title="Model Comparison"
      subtitle="Empirical CDF comparison"
      yLabel="Cumulative Probability"
    />
  );
};

/**
 * Example 8: Time Series of Distributions
 * Show how a distribution changes over time
 */
export const TimeSeriesDistributionExample: React.FC<{
  timePoints: Array<{
    timestamp: number;
    label: string;
    posterior: any;
  }>;
}> = ({ timePoints }) => {
  // Color gradient from light to dark
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, timePoints.length - 1]);
  
  return (
    <UnifiedDistributionViz
      distributions={timePoints.map((tp, i) => ({
        id: `time-${tp.timestamp}`,
        label: tp.label,
        posterior: tp.posterior,
        color: colorScale(i),
        opacity: 0.6 + (i / timePoints.length) * 0.4,
        metadata: { timestamp: tp.timestamp }
      }))}
      display={{
        mode: 'density',
        showMean: true,
        showCI: false // Too cluttered with many time points
      }}
      title="Distribution Evolution"
      subtitle="Changes over time"
    />
  );
};

/**
 * Example 9: Segment Analysis
 * Compare distributions across segments
 */
export const SegmentAnalysisExample: React.FC<{
  segments: Array<{
    id: string;
    name: string;
    posterior: any;
    size: number;
  }>;
}> = ({ segments }) => {
  // Sort by segment size for better visualization
  const sortedSegments = [...segments].sort((a, b) => b.size - a.size);
  
  return (
    <UnifiedDistributionViz
      distributions={sortedSegments.map((seg, i) => ({
        id: seg.id,
        label: `${seg.name} (n=${seg.size.toLocaleString()})`,
        posterior: seg.posterior,
        metadata: { 
          segmentId: seg.id,
          variantIndex: i
        }
      }))}
      display={{
        mode: 'ridge',
        showMean: true,
        ridgeOverlap: 0.4
      }}
      title="Segment Analysis"
      subtitle="Distribution by user segment"
      height={100 + sortedSegments.length * 60}
    />
  );
};

/**
 * Example 10: Custom histogram with observed overlay
 */
export const HistogramWithObservedExample: React.FC<{
  posterior: any;
  observed: number[];
}> = ({ posterior, observed }) => {
  return (
    <UnifiedDistributionViz
      distributions={[
        {
          id: 'posterior',
          label: 'Model Estimate',
          posterior,
          color: '#3b82f6'
        },
        {
          id: 'observed',
          label: 'Observed',
          samples: observed,
          color: '#ef4444',
          metadata: { isObserved: true }
        }
      ]}
      display={{
        mode: 'histogram',
        binCount: 25,
        showMean: true,
        opacity: 0.6
      }}
      title="Model vs Reality"
      subtitle="Histogram comparison"
    />
  );
};

/**
 * Example 11: Continuous Probability Reasoning
 * Shows how effect varies across different thresholds
 */
export const ContinuousProbabilityExample: React.FC<{
  controlPosterior: any;
  treatmentPosterior: any;
  metric: string;
  thresholds?: number[];
}> = ({ controlPosterior, treatmentPosterior, metric, thresholds = [0, 0.01, 0.05, 0.1] }) => {
  // This would ideally be a custom visualization showing P(effect > threshold) 
  // as a continuous function, but for now we can show key thresholds
  return (
    <div>
      <UnifiedDistributionViz
        distributions={[
          {
            id: 'control',
            label: 'Control',
            posterior: controlPosterior,
            metadata: { isBaseline: true }
          },
          {
            id: 'treatment',
            label: 'Treatment', 
            posterior: treatmentPosterior
          }
        ]}
        comparison={{
          mode: 'difference',
          baseline: 'control',
          showProbabilityOfImprovement: true,
          showExpectedImprovement: true,
          probabilityGradient: true
        }}
        display={{
          mode: 'density',
          showMean: true,
          showCI: true,
          ciLevels: [0.8, 0.5, 0.2] // Show multiple levels of uncertainty
        }}
        title={`${metric}: Effect Distribution`}
        subtitle="Full posterior of treatment effect"
      />
      
      {/* In a real implementation, this would be part of the viz */}
      <div className="mt-4 text-sm text-gray-600">
        <p>Probability of exceeding thresholds:</p>
        {thresholds.map(t => (
          <p key={t}>P(effect {'>'} {(t * 100).toFixed(0)}%) = [calculated from samples]</p>
        ))}
      </div>
    </div>
  );
}; 