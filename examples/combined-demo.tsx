import React, { useState, useMemo, useCallback } from 'react';
import { beta, BetaRV } from '../src/core/distributions/Beta';
import { ConversionValueModel, VariantData, UserData } from '../src/models/ConversionValueModel';
import { RandomVariable } from '../src/core/RandomVariable';

/**
 * Combined demo showing:
 * 1. Proper Bayesian credible intervals from posterior samples
 * 2. Conversion + Value analysis with outlier detection
 * 3. Data vs Model histogram comparison
 */
function BayesianAnalysisDemo() {
  const [activeTab, setActiveTab] = useState<'simple' | 'revenue'>('simple');
  
  // Simple A/B Test State
  const [variants, setVariants] = useState([
    { name: 'Control', visitors: 1000, conversions: 45 },
    { name: 'Treatment', visitors: 1000, conversions: 58 }
  ]);
  const [credibleLevel, setCredibleLevel] = useState(0.95);
  const [showHistogram, setShowHistogram] = useState(false);
  
  // Revenue Analysis State
  const [revenueModel, setRevenueModel] = useState<ConversionValueModel | null>(null);
  const [revenueResults, setRevenueResults] = useState<any>(null);
  const [dataInput, setDataInput] = useState('');
  
  // Compute posteriors with actual samples for simple A/B test
  const posteriorResults = useMemo(() => {
    const samples = new Map<string, number[]>();
    const numSamples = 5000;
    
    // Generate posterior samples
    variants.forEach(variant => {
      const posterior = beta(
        1 + variant.conversions, // Uniform prior: Beta(1,1)
        1 + variant.visitors - variant.conversions
      );
      samples.set(variant.name, posterior.sampleMultiple(numSamples));
    });
    
    return samples;
  }, [variants]);
  
  // Compute credible interval from samples
  const getCredibleInterval = (samples: number[], level: number) => {
    const sorted = [...samples].sort((a, b) => a - b);
    const alpha = (1 - level) / 2;
    const lowerIdx = Math.floor(alpha * samples.length);
    const upperIdx = Math.floor((1 - alpha) * samples.length);
    
    return {
      lower: sorted[lowerIdx],
      upper: sorted[upperIdx],
      median: sorted[Math.floor(samples.length / 2)],
      mean: samples.reduce((a, b) => a + b) / samples.length
    };
  };
  
  // Create histogram bins for visualization
  const createHistogram = (samples: number[], bins: number = 30) => {
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const binWidth = (max - min) / bins;
    
    const histogram = Array(bins).fill(0).map((_, i) => ({
      x: min + i * binWidth,
      count: 0,
      density: 0
    }));
    
    samples.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      histogram[binIndex].count++;
    });
    
    // Convert to density
    const totalArea = samples.length * binWidth;
    histogram.forEach(bin => {
      bin.density = bin.count / totalArea;
    });
    
    return histogram;
  };
  
  // Revenue analysis functions
  const generateRevenueData = () => {
    const sampleCSV = `variant,converted,value
Control,1,95.50
Control,0,0
Control,1,120.00
Control,0,0
Control,1,85.25
Control,1,110.00
Control,0,0
Control,1,105.00
Control,0,0
Control,1,92.00
Treatment,1,125.00
Treatment,0,0
Treatment,1,95.00
Treatment,1,2500.00
Treatment,1,110.00
Treatment,0,0
Treatment,1,105.00
Treatment,1,115.00
Treatment,0,0
Treatment,1,88.00`;
    
    setDataInput(sampleCSV);
  };
  
  const analyzeRevenue = async () => {
    if (!dataInput) return;
    
    try {
      const model = new ConversionValueModel(beta(1, 1), 'auto', 'revenue');
      
      // Parse CSV
      const lines = dataInput.trim().split('\n');
      const variantData = new Map<string, UserData[]>();
      
      for (let i = 1; i < lines.length; i++) {
        const [variant, converted, value] = lines[i].split(',');
        if (!variantData.has(variant)) {
          variantData.set(variant, []);
        }
        variantData.get(variant)!.push({
          converted: converted === '1',
          value: parseFloat(value) || 0
        });
      }
      
      // Add to model
      for (const [name, users] of variantData) {
        model.addVariant({ name, users });
      }
      
      // Analyze
      const results = await model.analyze({ iterations: 3000 });
      
      setRevenueModel(model);
      setRevenueResults(results);
    } catch (error) {
      console.error('Analysis failed:', error);
    }
  };
  
  const formatPercent = (value: number, decimals = 1) => 
    `${(value * 100).toFixed(decimals)}%`;
  
  const formatCurrency = (value: number) => 
    `$${value.toFixed(2)}`;
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Bayesian Analysis Demo</h1>
      
      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('simple')}
          className={`px-4 py-2 rounded ${
            activeTab === 'simple' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200'
          }`}
        >
          Simple A/B Test
        </button>
        <button
          onClick={() => setActiveTab('revenue')}
          className={`px-4 py-2 rounded ${
            activeTab === 'revenue' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200'
          }`}
        >
          Conversion + Revenue
        </button>
      </div>
      
      {activeTab === 'simple' ? (
        <div className="space-y-6">
          {/* Variant Inputs */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Variant Data</h2>
            {variants.map((variant, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-4 mb-2">
                <input
                  value={variant.name}
                  onChange={(e) => {
                    const newVariants = [...variants];
                    newVariants[idx].name = e.target.value;
                    setVariants(newVariants);
                  }}
                  className="px-3 py-2 border rounded"
                />
                <input
                  type="number"
                  value={variant.visitors}
                  onChange={(e) => {
                    const newVariants = [...variants];
                    newVariants[idx].visitors = parseInt(e.target.value) || 0;
                    setVariants(newVariants);
                  }}
                  className="px-3 py-2 border rounded"
                  placeholder="Visitors"
                />
                <input
                  type="number"
                  value={variant.conversions}
                  onChange={(e) => {
                    const newVariants = [...variants];
                    newVariants[idx].conversions = parseInt(e.target.value) || 0;
                    setVariants(newVariants);
                  }}
                  className="px-3 py-2 border rounded"
                  placeholder="Conversions"
                />
              </div>
            ))}
          </div>
          
          {/* Credible Interval Control */}
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-semibold mb-2">
              Credible Level: {formatPercent(credibleLevel, 0)}
            </h3>
            <input
              type="range"
              min="0.5"
              max="0.99"
              step="0.01"
              value={credibleLevel}
              onChange={(e) => setCredibleLevel(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Results with True Credible Intervals */}
          <div className="bg-blue-50 p-4 rounded">
            <h2 className="text-xl font-semibold mb-4">
              Posterior Results (from {posteriorResults.get('Control')?.length || 0} samples)
            </h2>
            
            {variants.map(variant => {
              const samples = posteriorResults.get(variant.name)!;
              const interval = getCredibleInterval(samples, credibleLevel);
              const observed = variant.conversions / variant.visitors;
              
              return (
                <div key={variant.name} className="mb-4 p-3 bg-white rounded">
                  <h3 className="font-semibold">{variant.name}</h3>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <p className="text-sm text-gray-600">Observed Rate</p>
                      <p className="font-semibold">{formatPercent(observed)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Posterior Mean</p>
                      <p className="font-semibold">{formatPercent(interval.mean)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">
                        {formatPercent(credibleLevel, 0)} Credible Interval
                      </p>
                      <p className="font-semibold">
                        [{formatPercent(interval.lower)}, {formatPercent(interval.upper)}]
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Width</p>
                      <p className="font-semibold">
                        {formatPercent(interval.upper - interval.lower)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            
            {/* Comparison */}
            {variants.length === 2 && (
              <div className="mt-4 p-3 bg-green-50 rounded">
                <h3 className="font-semibold mb-2">Relative Effect</h3>
                {(() => {
                  const controlSamples = posteriorResults.get(variants[0].name)!;
                  const treatmentSamples = posteriorResults.get(variants[1].name)!;
                  
                  // Calculate relative uplift for each sample
                  const upliftSamples = treatmentSamples.map((t, i) => 
                    (t - controlSamples[i]) / controlSamples[i]
                  );
                  
                  const upliftInterval = getCredibleInterval(upliftSamples, credibleLevel);
                  const probPositive = upliftSamples.filter(x => x > 0).length / upliftSamples.length;
                  
                  return (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Mean Uplift</p>
                        <p className="font-semibold">{formatPercent(upliftInterval.mean)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">P(Improvement)</p>
                        <p className="font-semibold text-green-600">
                          {formatPercent(probPositive)}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600">
                          {formatPercent(credibleLevel, 0)} CI for Uplift
                        </p>
                        <p className="font-semibold">
                          [{formatPercent(upliftInterval.lower)}, {formatPercent(upliftInterval.upper)}]
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          
          {/* Histogram Visualization */}
          <div className="bg-white p-4 rounded shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Posterior Distribution</h3>
              <button
                onClick={() => setShowHistogram(!showHistogram)}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
              >
                {showHistogram ? 'Hide' : 'Show'} Histogram
              </button>
            </div>
            
            {showHistogram && (
              <div className="space-y-4">
                {variants.map(variant => {
                  const samples = posteriorResults.get(variant.name)!;
                  const histogram = createHistogram(samples, 25);
                  const maxDensity = Math.max(...histogram.map(b => b.density));
                  
                  return (
                    <div key={variant.name}>
                      <h4 className="font-medium mb-2">{variant.name}</h4>
                      <div className="h-32 flex items-end gap-1">
                        {histogram.map((bin, i) => (
                          <div
                            key={i}
                            className="flex-1 bg-blue-500 opacity-75"
                            style={{
                              height: `${(bin.density / maxDensity) * 100}%`
                            }}
                            title={`${formatPercent(bin.x)} - ${formatPercent(bin.x + (histogram[1]?.x - histogram[0]?.x || 0))}: ${bin.count} samples`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>{formatPercent(histogram[0].x)}</span>
                        <span>{formatPercent(histogram[histogram.length - 1].x)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Revenue Analysis */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Conversion + Revenue Data</h2>
            <textarea
              value={dataInput}
              onChange={(e) => setDataInput(e.target.value)}
              className="w-full h-48 p-2 border rounded font-mono text-sm"
              placeholder="variant,converted,value&#10;Control,1,95.50&#10;..."
            />
            <div className="flex gap-4 mt-4">
              <button
                onClick={generateRevenueData}
                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
              >
                Load Sample Data
              </button>
              <button
                onClick={analyzeRevenue}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
              >
                Analyze
              </button>
            </div>
          </div>
          
          {/* Revenue Results */}
          {revenueResults && (
            <>
              {/* Summary */}
              <div className="bg-gray-50 p-4 rounded">
                <h3 className="font-semibold mb-2">Data Summary</h3>
                <pre className="text-sm">{revenueModel?.getSummary()}</pre>
              </div>
              
              {/* Outlier Warning */}
              {Array.from(revenueResults.outlierInfluence.entries() as Iterable<[string, any]>).map(([variant, outliers]) => 
                outliers.topValueContribution > 0.2 && (
                  <div key={variant} className="bg-red-50 p-4 rounded border-2 border-red-200">
                    <h3 className="font-semibold text-red-700 mb-2">
                      ⚠️ Outlier Warning for {variant}
                    </h3>
                    <p>
                      Top user: {formatPercent(outliers.topValueContribution)} of revenue<br/>
                      Top 5 users: {formatPercent(outliers.top5ValueContribution)} of revenue
                    </p>
                  </div>
                )
              )}
              
              {/* Overall Results */}
              <div className="bg-blue-50 p-4 rounded">
                <h3 className="font-semibold mb-4">Results</h3>
                {Array.from(revenueResults.relativeEffects.entries() as Iterable<[string, any]>).map(([variant, effects]) => {
                  const meanEffect = effects.overall.reduce((a: number, b: number) => a + b) / effects.overall.length;
                  const probPositive = effects.overall.filter((x: number) => x > 0).length / effects.overall.length;
                  
                  return (
                    <div key={variant} className="mb-4">
                      <h4 className="font-medium">{variant} vs Control</h4>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatPercent(meanEffect)} lift
                      </p>
                      <p className="text-green-600">
                        {formatPercent(probPositive)} probability of improvement
                      </p>
                    </div>
                  );
                })}
              </div>
              
              {/* What's Driving the Effect */}
              <div className="bg-yellow-50 p-4 rounded">
                <h3 className="font-semibold mb-4">Effect Decomposition</h3>
                {Array.from(revenueResults.effectDrivers.entries() as Iterable<[string, any]>).map(([variant, drivers]) => (
                  <div key={variant}>
                    <h4 className="font-medium mb-2">{variant}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">From Conversion Rate</p>
                        <p className="font-semibold">{formatPercent(drivers.conversionComponent)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">From Average Value</p>
                        <p className="font-semibold">{formatPercent(drivers.valueComponent)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default BayesianAnalysisDemo;