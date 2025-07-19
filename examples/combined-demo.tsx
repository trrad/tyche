import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { beta } from '../src/core/distributions/Beta';
import { ConversionValueModel, VariantData, UserData, ConversionValuePosterior } from '../src/models/ConversionValueModel';
import { MetropolisSampler } from '../src/samplers/Metropolis';
import { ComputationGraph } from '../src/core/ComputationGraph';
import { DistributionPlot } from '../src/visualizations/DistributionPlot';
import { UpliftGraph } from '../src/visualizations/UpliftGraph';
import './index.css';

// Type for properly typed revenue results
type RevenueResults = ConversionValuePosterior;

/**
 * Combined demo showing:
 * 1. Proper Bayesian credible intervals from posterior samples
 * 2. Conversion + Value analysis with outlier detection  
 * 3. Using new visualization components
 * 4. Integration with compositional PPL model
 */
function BayesianAnalysisDemo() {
  const [activeTab, setActiveTab] = useState<'simple' | 'revenue'>('simple');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Simple A/B Test State
  const [variants, setVariants] = useState([
    { name: 'Control', visitors: 1000, conversions: 45 },
    { name: 'Treatment', visitors: 1000, conversions: 58 }
  ]);
  const [credibleLevel, setCredibleLevel] = useState(0.95);
  
  // Revenue Analysis State
  const [revenueModel, setRevenueModel] = useState<ConversionValueModel | null>(null);
  const [revenueResults, setRevenueResults] = useState<RevenueResults | null>(null);
  const [dataInput, setDataInput] = useState('');
  const [parsedData, setParsedData] = useState<Map<string, UserData[]> | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  
  // MCMC configuration
  const [mcmcConfig, setMcmcConfig] = useState({
    iterations: 2000,
    warmup: 1000,
    stepSize: 0.02,
    adaptStepSize: true
  });
  
  // Data generation controls
  const [genConfig, setGenConfig] = useState({
    controlSize: 500,
    treatmentSize: 500,
    controlConvRate: 0.05,
    treatmentConvRate: 0.055,
    controlRevMean: 100,
    treatmentRevMean: 105,
    controlRevStd: 30,
    treatmentRevStd: 35,
    includeOutlier: false,
    outlierValue: 2500
  });
  
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
  
  const analyzeRevenue = async () => {
    if (!dataInput.trim()) {
      alert('Please enter CSV data');
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    try {
      // Create new computation graph for this analysis
      const graph = new ComputationGraph();
      ComputationGraph.setCurrent(graph);
      
      // Parse CSV
      const lines = dataInput.trim().split('\n');
      const headers = lines[0].split(',');
      
      if (!headers.includes('variant') || !headers.includes('converted') || !headers.includes('value')) {
        throw new Error('CSV must have variant, converted, and value columns');
      }
      
      const variantIdx = headers.indexOf('variant');
      const convertedIdx = headers.indexOf('converted');
      const valueIdx = headers.indexOf('value');
      
      // Group data by variant
      const dataByVariant = new Map<string, UserData[]>();
      
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        const variant = parts[variantIdx];
        const converted = parseInt(parts[convertedIdx]) === 1;
        const value = parseFloat(parts[valueIdx]) || 0;
        
        if (!dataByVariant.has(variant)) {
          dataByVariant.set(variant, []);
        }
        
        dataByVariant.get(variant)!.push({ converted, value });
      }
      
      // Create variant data
      const variantData: VariantData[] = Array.from(dataByVariant.entries()).map(([name, users]) => ({
        name,
        users
      }));
      
      // Create and configure model
      const model = new ConversionValueModel(graph);
      variantData.forEach(variant => model.addVariant(variant));
      
      setAnalysisProgress(10);
      
      // Create MCMC sampler with configuration
      const sampler = new MetropolisSampler({
        stepSize: mcmcConfig.stepSize,
        adaptStepSize: mcmcConfig.adaptStepSize,
        targetAcceptanceRate: 0.44
      });
      
      // Run analysis with progress updates
      const results = await model.analyze({ 
        sampler,
        iterations: mcmcConfig.iterations,
        warmup: mcmcConfig.warmup,
        referenceVariant: variantData[0].name
      });
      
      setAnalysisProgress(100);
      
      // Store results
      setRevenueModel(model);
      setRevenueResults(results);
      setParsedData(dataByVariant);
      
      console.log('Analysis complete:', results);
      
    } catch (error) {
      console.error('Analysis error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
    }
  };
  
  // Generate synthetic data based on config
  const generateData = () => {
    // Box-Muller transform for normal distribution
    const randn = () => {
      const u = 1 - Math.random();
      const v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
    
    // Generate revenue value (log-normal distribution)
    const generateRevenue = (mean: number, std: number): number => {
      // Convert to log-normal parameters
      const variance = std * std;
      const meanLog = Math.log(mean * mean / Math.sqrt(variance + mean * mean));
      const stdLog = Math.sqrt(Math.log(1 + variance / (mean * mean)));
      return Math.exp(meanLog + randn() * stdLog);
    };
    
    let csv = 'variant,converted,value\n';
    let outlierAdded = false;
    
    // Generate Control data
    for (let i = 0; i < genConfig.controlSize; i++) {
      const converted = Math.random() < genConfig.controlConvRate;
      const value = converted ? generateRevenue(genConfig.controlRevMean, genConfig.controlRevStd) : 0;
      csv += `Control,${converted ? 1 : 0},${value.toFixed(2)}\n`;
    }
    
    // Generate Treatment data
    for (let i = 0; i < genConfig.treatmentSize; i++) {
      const converted = Math.random() < genConfig.treatmentConvRate;
      let value = 0;
      
      if (converted) {
        // Add one outlier to treatment if enabled
        if (genConfig.includeOutlier && !outlierAdded && Math.random() < 0.1) {
          value = genConfig.outlierValue;
          outlierAdded = true;
        } else {
          value = generateRevenue(genConfig.treatmentRevMean, genConfig.treatmentRevStd);
        }
      }
      
      csv += `Treatment,${converted ? 1 : 0},${value.toFixed(2)}\n`;
    }
    
    setDataInput(csv.trim());
  };
  
  const formatPercent = (value: number, decimals: number = 1) => 
    `${(value * 100).toFixed(decimals)}%`;
  
  const formatCurrency = (value: number) => 
    `$${value.toFixed(2)}`;
  
  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Bayesian Analysis Suite</h1>
      
      {/* Tab Buttons */}
      <div className="mb-6 flex gap-2">
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
          
          {/* Distribution Plots */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Posterior Distributions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {variants.map((variant, idx) => {
                const samples = posteriorResults.get(variant.name)!;
                const observed = variant.conversions / variant.visitors;
                
                return (
                  <div key={variant.name}>
                    <DistributionPlot
                      samples={samples}
                      color={idx === 0 ? '#6B7280' : '#3B82F6'}
                      label={`${variant.name} (Observed: ${formatPercent(observed)})`}
                      credibleLevel={credibleLevel}
                      showMean={true}
                      showCredibleInterval={true}
                      width={400}
                      height={250}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Uplift Analysis */}
          {variants.length === 2 && (
            <div className="bg-white p-4 rounded shadow">
              <h2 className="text-xl font-semibold mb-4">Relative Effect Analysis</h2>
              <UpliftGraph
                controlSamples={posteriorResults.get(variants[0].name)!}
                treatmentSamples={posteriorResults.get(variants[1].name)!}
                credibleLevel={credibleLevel}
                title={`${variants[1].name} vs ${variants[0].name}`}
                width={600}
                height={300}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* MCMC Configuration */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">MCMC Configuration</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-600">Iterations</label>
                <input
                  type="number"
                  value={mcmcConfig.iterations}
                  onChange={(e) => setMcmcConfig({...mcmcConfig, iterations: parseInt(e.target.value) || 1000})}
                  className="w-full px-3 py-1 border rounded"
                  min="1000"
                  step="1000"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Warmup</label>
                <input
                  type="number"
                  value={mcmcConfig.warmup}
                  onChange={(e) => setMcmcConfig({...mcmcConfig, warmup: parseInt(e.target.value) || 500})}
                  className="w-full px-3 py-1 border rounded"
                  min="100"
                  step="100"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Step Size</label>
                <input
                  type="number"
                  value={mcmcConfig.stepSize}
                  onChange={(e) => setMcmcConfig({...mcmcConfig, stepSize: parseFloat(e.target.value) || 0.01})}
                  className="w-full px-3 py-1 border rounded"
                  min="0.001"
                  max="1"
                  step="0.001"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={mcmcConfig.adaptStepSize}
                    onChange={(e) => setMcmcConfig({...mcmcConfig, adaptStepSize: e.target.checked})}
                  />
                  <span className="text-sm">Adaptive</span>
                </label>
              </div>
            </div>
          </div>
          
          {/* Revenue Data Generator */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Generate Test Data</h2>
            
            {/* Quick Presets */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  setGenConfig({
                    controlSize: 1000,
                    treatmentSize: 1000,
                    controlConvRate: 0.05,
                    treatmentConvRate: 0.052,
                    controlRevMean: 100,
                    treatmentRevMean: 102,
                    controlRevStd: 30,
                    treatmentRevStd: 30,
                    includeOutlier: false,
                    outlierValue: 2500
                  });
                }}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
              >
                Small Effect
              </button>
              <button
                onClick={() => {
                  setGenConfig({
                    controlSize: 300,
                    treatmentSize: 300,
                    controlConvRate: 0.04,
                    treatmentConvRate: 0.045,
                    controlRevMean: 80,
                    treatmentRevMean: 85,
                    controlRevStd: 25,
                    treatmentRevStd: 30,
                    includeOutlier: true,
                    outlierValue: 3000
                  });
                }}
                className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
              >
                With Outlier
              </button>
              <button
                onClick={() => {
                  setGenConfig({
                    controlSize: 500,
                    treatmentSize: 500,
                    controlConvRate: 0.03,
                    treatmentConvRate: 0.035,
                    controlRevMean: 200,
                    treatmentRevMean: 220,
                    controlRevStd: 150,
                    treatmentRevStd: 180,
                    includeOutlier: false,
                    outlierValue: 2500
                  });
                }}
                className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200"
              >
                High Variance
              </button>
            </div>
            
            {/* Configuration Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700">Control</h3>
                <div>
                  <label className="block text-sm text-gray-600">Sample Size</label>
                  <input
                    type="number"
                    value={genConfig.controlSize}
                    onChange={(e) => setGenConfig({...genConfig, controlSize: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Conversion Rate</label>
                  <input
                    type="number"
                    step="0.001"
                    value={genConfig.controlConvRate}
                    onChange={(e) => setGenConfig({...genConfig, controlConvRate: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Revenue Mean ($)</label>
                  <input
                    type="number"
                    value={genConfig.controlRevMean}
                    onChange={(e) => setGenConfig({...genConfig, controlRevMean: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Revenue Std Dev ($)</label>
                  <input
                    type="number"
                    value={genConfig.controlRevStd}
                    onChange={(e) => setGenConfig({...genConfig, controlRevStd: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700">Treatment</h3>
                <div>
                  <label className="block text-sm text-gray-600">Sample Size</label>
                  <input
                    type="number"
                    value={genConfig.treatmentSize}
                    onChange={(e) => setGenConfig({...genConfig, treatmentSize: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Conversion Rate</label>
                  <input
                    type="number"
                    step="0.001"
                    value={genConfig.treatmentConvRate}
                    onChange={(e) => setGenConfig({...genConfig, treatmentConvRate: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Revenue Mean ($)</label>
                  <input
                    type="number"
                    value={genConfig.treatmentRevMean}
                    onChange={(e) => setGenConfig({...genConfig, treatmentRevMean: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Revenue Std Dev ($)</label>
                  <input
                    type="number"
                    value={genConfig.treatmentRevStd}
                    onChange={(e) => setGenConfig({...genConfig, treatmentRevStd: parseFloat(e.target.value) || 0})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
              </div>
            </div>
            
            {/* Outlier Controls */}
            <div className="mt-4 p-3 bg-gray-50 rounded">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={genConfig.includeOutlier}
                  onChange={(e) => setGenConfig({...genConfig, includeOutlier: e.target.checked})}
                />
                <span className="text-sm">Include outlier in treatment</span>
              </label>
              {genConfig.includeOutlier && (
                <div className="mt-2">
                  <label className="block text-sm text-gray-600">Outlier Value ($)</label>
                  <input
                    type="number"
                    value={genConfig.outlierValue}
                    onChange={(e) => setGenConfig({...genConfig, outlierValue: parseFloat(e.target.value) || 0})}
                    className="w-24 px-3 py-1 border rounded"
                  />
                </div>
              )}
            </div>
            
            {/* Expected Effect Size */}
            <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
              <div className="font-semibold mb-1">Expected Effect Sizes:</div>
              <div>Conversion Rate: {((genConfig.treatmentConvRate / genConfig.controlConvRate - 1) * 100).toFixed(1)}%</div>
              <div>Revenue per Converted: {((genConfig.treatmentRevMean / genConfig.controlRevMean - 1) * 100).toFixed(1)}%</div>
              <div>Overall Revenue per User: {(((genConfig.treatmentConvRate * genConfig.treatmentRevMean) / (genConfig.controlConvRate * genConfig.controlRevMean) - 1) * 100).toFixed(1)}%</div>
            </div>
            
            {/* Sample Size Warning */}
            {(genConfig.controlSize > 2000 || genConfig.treatmentSize > 2000) && (
              <div className="mt-2 p-2 bg-yellow-100 rounded text-sm">
                ⚠️ Large sample sizes (&gt;2000) may cause performance issues. Consider using smaller samples or batched analysis.
              </div>
            )}
            
            <button
              onClick={generateData}
              className="mt-4 w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Generate Data
            </button>
          </div>
          
          {/* Revenue Data Input */}
          <div className="bg-white p-4 rounded shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Revenue Data</h2>
              <button
                onClick={() => setShowRawData(!showRawData)}
                className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300"
              >
                {showRawData ? 'Hide' : 'Show'} Raw CSV
              </button>
            </div>
            
            {showRawData && (
              <textarea
                value={dataInput}
                onChange={(e) => setDataInput(e.target.value)}
                className="w-full h-64 p-3 border rounded font-mono text-sm mb-4"
                placeholder="variant,converted,value
Control,1,95.50
Control,0,0
Treatment,1,120.00
..."
              />
            )}
            
            <div className="flex gap-4 items-center">
              <button
                onClick={analyzeRevenue}
                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
                disabled={!dataInput.trim() || isAnalyzing}
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Data'}
              </button>
              {dataInput && (
                <span className="text-sm text-gray-600">
                  {dataInput.split('\n').length - 1} rows loaded
                </span>
              )}
              {isAnalyzing && (
                <div className="flex-1">
                  <div className="bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Revenue Results */}
          {revenueResults && (
            <>
              {/* Model Summary */}
              <div className="bg-gray-50 p-4 rounded">
                <h3 className="font-semibold mb-2">Model Summary</h3>
                <pre className="text-sm whitespace-pre-wrap">{revenueModel?.getSummary()}</pre>
              </div>
              
              {/* MCMC Diagnostics */}
              {revenueResults.diagnostics && (
                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold mb-2">MCMC Diagnostics</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Acceptance Rate:</span>
                      <span className="ml-2 font-mono">{(revenueResults.diagnostics.acceptanceRate * 100).toFixed(1)}%</span>
                    </div>
                    {revenueResults.diagnostics.effectiveSampleSize && (
                      <div>
                        <span className="text-gray-600">Effective Sample Size:</span>
                        <span className="ml-2 font-mono">{Math.floor(revenueResults.diagnostics.effectiveSampleSize)}</span>
                      </div>
                    )}
                    {revenueResults.diagnostics.rHat && (
                      <div>
                        <span className="text-gray-600">R̂:</span>
                        <span className="ml-2 font-mono">{revenueResults.diagnostics.rHat.toFixed(3)}</span>
                      </div>
                    )}
                  </div>
                  {revenueResults.diagnostics.acceptanceRate < 0.2 && (
                    <div className="mt-2 p-2 bg-yellow-100 rounded text-sm">
                      ⚠️ Low acceptance rate. Consider increasing step size.
                    </div>
                  )}
                  {revenueResults.diagnostics.acceptanceRate > 0.8 && (
                    <div className="mt-2 p-2 bg-yellow-100 rounded text-sm">
                      ⚠️ High acceptance rate. Consider decreasing step size.
                    </div>
                  )}
                </div>
              )}
              
              {/* Outlier Warning */}
              {revenueResults.outlierInfluence && 
                Array.from(revenueResults.outlierInfluence.entries()).map(([variant, outliers]: [string, any]) => 
                  outliers?.topValueContribution > 0.2 && (
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
              
              {/* Conversion Rate Distributions */}
              {revenueResults && revenueResults.conversionRates && (
                <div className="bg-white p-4 rounded shadow">
                  <h2 className="text-xl font-semibold mb-4">Conversion Rate Posteriors</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Array.from(revenueResults.conversionRates.entries()).map(([variant, samples]: [string, number[]]) => {
                      const observed = (() => {
                        if (!parsedData) return 0;
                        const users = parsedData.get(variant);
                        if (!users) return 0;
                        const conversions = users.filter(u => u.converted).length;
                        return conversions / users.length;
                      })();
                      return (
                        <div key={variant}>
                          <DistributionPlot
                            samples={samples}
                            color={variant === 'Control' ? '#6B7280' : '#3B82F6'}
                            label={`${variant} (Observed: ${formatPercent(observed)})`}
                            credibleLevel={0.95}
                            showMean={true}
                            showCredibleInterval={true}
                            width={400}
                            height={250}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Mean Value Distributions */}
              {revenueResults.meanValues && (
                <div className="bg-white p-4 rounded shadow">
                  <h2 className="text-xl font-semibold mb-4">Revenue per Converted User Posteriors</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    These distributions show the posterior for average revenue among users who convert
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Array.from(revenueResults.meanValues.entries()).map(([variant, samples]: [string, number[]]) => {
                      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
                      const sorted = [...samples].sort((a: number, b: number) => a - b);
                      const median = sorted[Math.floor(samples.length / 2)];
                      
                      return (
                        <div key={variant}>
                          <DistributionPlot
                            samples={samples}
                            color={variant === 'Control' ? '#6B7280' : '#3B82F6'}
                            label={`${variant} Revenue per Converted User`}
                            credibleLevel={0.95}
                            showMean={true}
                            showCredibleInterval={true}
                            width={400}
                            height={250}
                          />
                          <div className="mt-2 text-sm">
                            <p>Posterior Mean: {formatCurrency(mean)}</p>
                            <p>Posterior Median: {formatCurrency(median)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Relative Effect */}
              {revenueResults && revenueResults.relativeEffects && Array.from(revenueResults.relativeEffects.entries()).length > 0 && (
                <div className="bg-white p-4 rounded shadow">
                  <h2 className="text-xl font-semibold mb-4">Treatment Effect Analysis</h2>
                  {Array.from(revenueResults.relativeEffects.entries()).map(([variant, effects]: [string, { overall: number[] }]) => {
                    if (!effects?.overall || !Array.isArray(effects.overall)) {
                      return null;
                    }
                    
                    return (
                      <div key={variant}>
                        <UpliftGraph
                          controlSamples={Array(effects.overall.length).fill(0)}
                          treatmentSamples={effects.overall.map((x: number) => x * 100)} // Convert to percentage
                          credibleLevel={0.95}
                          title={`${variant} vs Control - Revenue per User`}
                          width={600}
                          height={300}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Overall Results */}
              {revenueResults && revenueResults.relativeEffects && (
                <div className="bg-blue-50 p-4 rounded">
                  <h3 className="font-semibold mb-4">Analysis Results</h3>
                  {Array.from(revenueResults.relativeEffects.entries()).map(([variant, effects]: [string, { overall: number[] }]) => {
                    if (!effects?.overall || !Array.isArray(effects.overall)) {
                      return null;
                    }
                    const meanEffect = effects.overall.reduce((sum: number, x: number) => sum + x, 0) / effects.overall.length;
                    const sorted = [...effects.overall].sort((a: number, b: number) => a - b);
                    const ci95Lower = sorted[Math.floor(0.025 * sorted.length)];
                    const ci95Upper = sorted[Math.floor(0.975 * sorted.length)];
                    const probPositive = effects.overall.filter((x: number) => x > 0).length / effects.overall.length;
                    
                    return (
                      <div key={variant} className="mb-4">
                        <h4 className="font-medium text-lg">{variant} vs Control</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                          <div>
                            <span className="text-gray-600 text-sm">Mean Effect</span>
                            <p className="font-semibold">{formatPercent(meanEffect)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600 text-sm">95% Credible Interval</span>
                            <p className="font-semibold">[{formatPercent(ci95Lower)}, {formatPercent(ci95Upper)}]</p>
                          </div>
                          <div>
                            <span className="text-gray-600 text-sm">P(Improvement)</span>
                            <p className="font-semibold text-green-600">{formatPercent(probPositive)}</p>
                          </div>
                          <div>
                            <span className="text-gray-600 text-sm">Decision</span>
                            <p className="font-semibold">
                              {probPositive > 0.95 ? '✅ Significant' : 
                               probPositive < 0.05 ? '❌ Worse' : 
                               '❓ Inconclusive'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Effect Drivers */}
              {revenueResults.effectDrivers && Array.from(revenueResults.effectDrivers.entries()).length > 0 && (
                <div className="bg-purple-50 p-4 rounded">
                  <h3 className="font-semibold mb-4">Effect Decomposition</h3>
                  {Array.from(revenueResults.effectDrivers.entries()).map(([variant, drivers]: [string, any]) => {
                    const conversionComponent = drivers.conversionComponent || 0;
                    const valueComponent = drivers.valueComponent || 0;
                    
                    return (
                      <div key={variant} className="mb-4">
                        <h4 className="font-medium mb-2">{variant} Effect Breakdown:</h4>
                        <div className="space-y-2">
                          {/* Visual bar chart */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="w-32 text-sm text-gray-600">Conversion Rate</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                                <div 
                                  className="bg-blue-500 h-6 rounded-full flex items-center justify-end pr-2"
                                  style={{width: `${conversionComponent * 100}%`}}
                                >
                                  <span className="text-xs text-white font-semibold">
                                    {formatPercent(conversionComponent, 0)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-32 text-sm text-gray-600">Revenue/Convert</div>
                              <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                                <div 
                                  className="bg-green-500 h-6 rounded-full flex items-center justify-end pr-2"
                                  style={{width: `${valueComponent * 100}%`}}
                                >
                                  <span className="text-xs text-white font-semibold">
                                    {formatPercent(valueComponent, 0)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="mt-4 p-3 bg-purple-100 rounded text-sm">
                    <div className="font-semibold mb-1">How to interpret:</div>
                    <ul className="space-y-1 text-gray-700">
                      <li>• <strong>Conversion Rate</strong>: Effect from changes in conversion probability</li>
                      <li>• <strong>Revenue/Convert</strong>: Effect from changes in average purchase amounts</li>
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <BayesianAnalysisDemo />
  </React.StrictMode>
);

export default BayesianAnalysisDemo;