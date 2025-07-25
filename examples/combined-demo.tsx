import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { beta } from '../src/core/distributions/Beta';
import { 
  ConversionValueModelVI, 
  VIAnalysisOptions,
  VariantData, 
  UserData, 
  ConversionValuePosterior 
} from '../src/models/ConversionValueModelVI';

// Visualization components
import { ComparisonPlot } from '../src/ui/visualizations/ComparisonPlot';
import { SafeDistributionPlot } from '../src/ui/visualizations/SafeDistributionPlot';
import { SafeUpliftGraph } from '../src/ui/visualizations/SafeUpliftGraph';
// Alternative if safe wrappers don't exist:
// import { DistributionPlot as SafeDistributionPlot } from '../src/visualizations/DistributionPlot';
// import { UpliftGraph as SafeUpliftGraph } from '../src/visualizations/UpliftGraph';

import './index.css';

// Type for properly typed revenue results
type RevenueResults = ConversionValuePosterior;

/**
 * Combined demo showing:
 * 1. Proper Bayesian credible intervals from posterior samples
 * 2. Conversion + Value analysis with outlier detection  
 * 3. Using new visualization components
 * 4. Fast Variational Inference for real-time analysis
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
  const [credibleLevel, setCredibleLevel] = useState(0.80);
  
  // Revenue Analysis State
  const [revenueModel, setRevenueModel] = useState<ConversionValueModelVI | null>(null);
  const [revenueResults, setRevenueResults] = useState<RevenueResults | null>(null);
  const [dataInput, setDataInput] = useState('');
  const [parsedData, setParsedData] = useState<Map<string, UserData[]> | null>(null);
  const [showRawData, setShowRawData] = useState(false);
  const [showRawDistributions, setShowRawDistributions] = useState(false);
  
  // VI configuration
  const [viModelType, setVIModelType] = useState<'auto' | 'beta-binomial' | 'zero-inflated-lognormal' | 'normal-mixture'>('auto');
  const [viConfig, setViConfig] = useState({
    maxIterations: 1000,
    tolerance: 1e-6
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
        const converted = parts[convertedIdx] === '1' || parts[convertedIdx].toLowerCase() === 'true';
        const value = parseFloat(parts[valueIdx]) || 0;
        
        if (!dataByVariant.has(variant)) {
          dataByVariant.set(variant, []);
        }
        dataByVariant.get(variant)!.push({ converted, value });
      }
      
      setParsedData(dataByVariant);
      
      // Create model
      const model = new ConversionValueModelVI();
      
      // Add data to model
      for (const [variantName, users] of dataByVariant) {
        model.addVariant({
          name: variantName,
          users
        });
      }
      
      setRevenueModel(model);
      
      // Progress updates
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => Math.min(prev + 10, 90));
      }, 100);
      
      // Run VI analysis
      const analysisOptions: VIAnalysisOptions = {
        maxIterations: viConfig.maxIterations,
        tolerance: viConfig.tolerance,
        modelType: viModelType
      };
      
      const results = await model.analyze(analysisOptions);
      
      clearInterval(progressInterval);
      setAnalysisProgress(100);
      setRevenueResults(results);
      
      // Log timing
      console.log('VI Analysis completed');
      
    } catch (error) {
      console.error('Analysis failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Analysis failed: ${errorMessage}`);
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setAnalysisProgress(0), 500);
    }
  };
  
  const generateData = () => {
    const data: string[] = ['variant,converted,value'];
    
    // Generate control data
    for (let i = 0; i < genConfig.controlSize; i++) {
      const converted = Math.random() < genConfig.controlConvRate;
      const value = converted 
        ? Math.max(0, genConfig.controlRevMean + (Math.random() - 0.5) * 2 * genConfig.controlRevStd)
        : 0;
      data.push(`control,${converted ? 1 : 0},${value.toFixed(2)}`);
    }
    
    // Generate treatment data
    for (let i = 0; i < genConfig.treatmentSize; i++) {
      const converted = Math.random() < genConfig.treatmentConvRate;
      let value = 0;
      
      if (converted) {
        if (genConfig.includeOutlier && i === 0) {
          value = genConfig.outlierValue;
        } else {
          value = Math.max(0, genConfig.treatmentRevMean + (Math.random() - 0.5) * 2 * genConfig.treatmentRevStd);
        }
      }
      
      data.push(`treatment,${converted ? 1 : 0},${value.toFixed(2)}`);
    }
    
    setDataInput(data.join('\n'));
  };
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Bayesian Analysis Demo</h1>
      
      {/* Tab Selection */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('simple')}
          className={`px-4 py-2 rounded ${
            activeTab === 'simple' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          Simple A/B Test
        </button>
        <button
          onClick={() => setActiveTab('revenue')}
          className={`px-4 py-2 rounded ${
            activeTab === 'revenue' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          Conversion + Revenue Analysis
        </button>
      </div>
      
      {/* Simple A/B Test Tab */}
      {activeTab === 'simple' && (
        <div className="space-y-6">
          {/* Variant Input */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Variant Data</h2>
            <div className="space-y-4">
              {variants.map((variant, idx) => (
                <div key={idx} className="flex gap-4 items-center">
                  <input
                    type="text"
                    value={variant.name}
                    onChange={(e) => {
                      const updated = [...variants];
                      updated[idx].name = e.target.value;
                      setVariants(updated);
                    }}
                    className="px-3 py-2 border rounded"
                    placeholder="Variant name"
                  />
                  <input
                    type="number"
                    value={variant.visitors}
                    onChange={(e) => {
                      const updated = [...variants];
                      updated[idx].visitors = parseInt(e.target.value) || 0;
                      setVariants(updated);
                    }}
                    className="px-3 py-2 border rounded w-32"
                    placeholder="Visitors"
                  />
                  <input
                    type="number"
                    value={variant.conversions}
                    onChange={(e) => {
                      const updated = [...variants];
                      updated[idx].conversions = parseInt(e.target.value) || 0;
                      setVariants(updated);
                    }}
                    className="px-3 py-2 border rounded w-32"
                    placeholder="Conversions"
                  />
                  <span className="text-gray-600">
                    {variant.visitors > 0 
                      ? `${(variant.conversions / variant.visitors * 100).toFixed(1)}%`
                      : '0%'
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Results */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Posterior Analysis</h2>
            
            {/* Credible Level Selector */}
            <div className="mb-4">
              <label className="text-sm text-gray-600">Credible Level: </label>
              <select 
                value={credibleLevel}
                onChange={(e) => setCredibleLevel(parseFloat(e.target.value))}
                className="ml-2 px-2 py-1 border rounded"
              >
                <option value={0.5}>50%</option>
                <option value={0.8}>80% (Recommended)</option>
                <option value={0.9}>90%</option>
                <option value={0.95}>95%</option>
                <option value={0.99}>99%</option>
              </select>
            </div>
            
            {/* Posterior Distributions */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {Array.from(posteriorResults.entries()).map(([name, samples]) => {
                const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
                const sorted = [...samples].sort((a, b) => a - b);
                const lowerIdx = Math.floor((1 - credibleLevel) / 2 * samples.length);
                const upperIdx = Math.floor((1 + credibleLevel) / 2 * samples.length);
                const lower = sorted[lowerIdx];
                const upper = sorted[upperIdx];
                
                return (
                  <div key={name} className="bg-gray-50 p-4 rounded">
                    <h3 className="font-semibold">{name}</h3>
                    <p className="text-sm text-gray-600">
                      Mean: {(mean * 100).toFixed(2)}%
                    </p>
                    <p className="text-sm text-gray-600">
                      {(credibleLevel * 100)}% CI: [{(lower * 100).toFixed(2)}%, {(upper * 100).toFixed(2)}%]
                    </p>
                  </div>
                );
              })}
            </div>
            
            {/* Uplift Distribution */}
            {posteriorResults.size >= 2 && (
              <div>
                <h3 className="font-semibold mb-2">Relative Uplift Distribution</h3>
                <div className="h-64">
                  <SafeUpliftGraph
                    controlSamples={posteriorResults.get('Control')!}
                    treatmentSamples={posteriorResults.get('Treatment')!}
                    credibleLevel={credibleLevel}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Revenue Analysis Tab */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          {/* VI Configuration */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">VI Configuration</h2>
            
            <div className="bg-gray-50 p-3 rounded space-y-3">
              <div>
                <label className="block text-sm text-gray-600">Model Type</label>
                <select
                  value={viModelType}
                  onChange={(e) => setVIModelType(e.target.value as any)}
                  className="w-full px-3 py-1 border rounded"
                >
                  <option value="auto">Auto-detect</option>
                  <option value="beta-binomial">Beta-Binomial (Simple)</option>
                  <option value="normal-mixture">Normal Mixture (Multimodal)</option>
                  <option value="zero-inflated-lognormal">Zero-Inflated LogNormal</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Max Iterations</label>
                  <input
                    type="number"
                    value={viConfig.maxIterations}
                    onChange={(e) => setViConfig({...viConfig, maxIterations: parseInt(e.target.value) || 1000})}
                    className="w-full px-3 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Tolerance</label>
                  <input
                    type="number"
                    value={viConfig.tolerance}
                    onChange={(e) => setViConfig({...viConfig, tolerance: parseFloat(e.target.value) || 1e-6})}
                    className="w-full px-3 py-1 border rounded"
                    step="0.000001"
                  />
                </div>
              </div>
            </div>
          </div>
          
          {/* Data Generation */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">Generate Test Data</h2>
            
            {/* Sample Size Controls */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-600">Control Size</label>
                <input
                  type="number"
                  value={genConfig.controlSize}
                  onChange={(e) => setGenConfig({...genConfig, controlSize: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-1 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Treatment Size</label>
                <input
                  type="number"
                  value={genConfig.treatmentSize}
                  onChange={(e) => setGenConfig({...genConfig, treatmentSize: parseInt(e.target.value) || 0})}
                  className="w-full px-3 py-1 border rounded"
                />
              </div>
            </div>
            
            {/* Parameter Controls */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <h4 className="font-medium mb-2">Control Parameters</h4>
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-600">Conversion Rate</label>
                    <input
                      type="number"
                      value={genConfig.controlConvRate}
                      onChange={(e) => setGenConfig({...genConfig, controlConvRate: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-1 border rounded"
                      step="0.01"
                    />
                    <label className="block text-sm text-gray-600">Revenue Mean ($)</label>
                    <input
                      type="number"
                      value={genConfig.controlRevMean}
                      onChange={(e) => setGenConfig({...genConfig, controlRevMean: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-1 border rounded"
                    />
                    <label className="block text-sm text-gray-600">Revenue Std Dev ($)</label>
                    <input
                      type="number"
                      value={genConfig.controlRevStd}
                      onChange={(e) => setGenConfig({...genConfig, controlRevStd: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-1 border rounded"
                    />
                  </div>
                </div>
                
                <div className="bg-gray-50 p-3 rounded">
                  <h4 className="font-medium mb-2">Treatment Parameters</h4>
                  <div className="space-y-2">
                    <label className="block text-sm text-gray-600">Conversion Rate</label>
                    <input
                      type="number"
                      value={genConfig.treatmentConvRate}
                      onChange={(e) => setGenConfig({...genConfig, treatmentConvRate: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-1 border rounded"
                      step="0.01"
                    />
                    <label className="block text-sm text-gray-600">Revenue Mean ($)</label>
                    <input
                      type="number"
                      value={genConfig.treatmentRevMean}
                      onChange={(e) => setGenConfig({...genConfig, treatmentRevMean: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-1 border rounded"
                    />
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
            {(genConfig.controlSize > 10000 || genConfig.treatmentSize > 10000) && (
              <div className="mt-2 p-2 bg-yellow-100 rounded text-sm">
                ⚠️ Very large sample sizes (&gt;10000) may cause performance issues. Consider using smaller samples for testing.
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
                {showRawData ? 'Hide' : 'Show'} Raw Data
              </button>
            </div>
            
            {showRawData && (
              <textarea
                value={dataInput}
                onChange={(e) => setDataInput(e.target.value)}
                placeholder="variant,converted,value&#10;control,1,95.50&#10;control,0,0&#10;treatment,1,105.25&#10;..."
                className="w-full h-48 p-3 border rounded font-mono text-sm"
              />
            )}
            
            <div className="flex gap-2 items-center">
              <button
                onClick={analyzeRevenue}
                disabled={isAnalyzing}
                className={`px-4 py-2 rounded ${
                  isAnalyzing 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-500 hover:bg-blue-600'
                } text-white`}
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
              <div className="bg-gray-50 p-6 rounded">
                <h3 className="font-semibold mb-3 text-lg">Model Summary</h3>
                <pre className="text-sm whitespace-pre-wrap font-mono bg-white p-4 rounded border">{revenueModel?.getSummary()}</pre>
              </div>
              
              {/* VI Diagnostics */}
              {revenueResults.diagnostics && (
                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold mb-2">VI Diagnostics</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Converged:</span>
                      <span className="ml-2 font-mono">
                        {revenueResults.diagnostics.converged ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Iterations:</span>
                      <span className="ml-2 font-mono">{revenueResults.diagnostics.iterations}</span>
                    </div>
                    {revenueResults.diagnostics.finalELBO && (
                      <div>
                        <span className="text-gray-600">Final ELBO:</span>
                        <span className="ml-2 font-mono">{revenueResults.diagnostics.finalELBO.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  {!revenueResults.diagnostics.converged && (
                    <div className="mt-2 p-2 bg-yellow-100 rounded text-sm">
                      ⚠️ VI did not converge. Consider increasing max iterations.
                    </div>
                  )}
                </div>
              )}
              
              {/* Posterior Summaries */}
              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-semibold mb-4">Posterior Estimates</h3>
                <div className="space-y-4">
                  {Array.from(revenueResults.conversionRates.keys()).map(variant => {
                    const convSamples = revenueResults.conversionRates.get(variant)!;
                    const valueSamples = revenueResults.meanValues.get(variant);
                    const relEffect = revenueResults.relativeEffects.get(variant);
                    
                    const convMean = convSamples.reduce((a, b) => a + b, 0) / convSamples.length;
                    const convSorted = [...convSamples].sort((a, b) => a - b);
                    const convLower = convSorted[Math.floor(0.1 * convSamples.length)];  // 80% CI
                    const convUpper = convSorted[Math.floor(0.9 * convSamples.length)];  // 80% CI
                    
                    return (
                      <div key={variant} className="border-l-4 border-blue-500 pl-4">
                        <h4 className="font-medium text-lg">{variant}</h4>
                        
                        {/* Conversion Rate */}
                        <div className="mt-2">
                          <span className="text-gray-600">Conversion Rate:</span>
                          <span className="ml-2 font-mono">
                            {(convMean * 100).toFixed(2)}% 
                            [{(convLower * 100).toFixed(2)}%, {(convUpper * 100).toFixed(2)}%]
                          </span>
                        </div>
                        
                        {/* Value among converters */}
                        {valueSamples && (
                          <div className="mt-1">
                            <span className="text-gray-600">Revenue per Converter:</span>
                            <span className="ml-2 font-mono">
                              ${(valueSamples.reduce((a, b) => a + b, 0) / valueSamples.length).toFixed(2)}
                            </span>
                          </div>
                        )}
                        
                        {/* Relative effect */}
                        {relEffect && (
                          <div className="mt-1">
                            <span className="text-gray-600">Relative Effect:</span>
                            <span className="ml-2 font-mono">
                              {(relEffect.overall.reduce((a, b) => a + b, 0) / relEffect.overall.length * 100).toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Comparison Plots with Shared Axes */}
              <div className="bg-white p-6 rounded shadow">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-semibold text-lg">Posterior Comparisons</h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showRawDistributions}
                      onChange={(e) => setShowRawDistributions(e.target.checked)}
                      className="rounded"
                    />
                    <span>Show raw data overlay</span>
                  </label>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Conversion Rate Comparison */}
                  <div>
                    <h4 className="text-base font-medium text-gray-700 mb-4">Conversion Rates</h4>
                    {(() => {
                      const variants = Array.from(revenueResults.conversionRates.keys());
                      if (variants.length >= 2) {
                        const controlSamples = revenueResults.conversionRates.get(variants[0])!;
                        const treatmentSamples = revenueResults.conversionRates.get(variants[1])!;
                        
                        // Get raw data if available
                        const rawData = parsedData ? {
                          control: parsedData.get(variants[0])?.map(u => u.converted ? 1 : 0) || [],
                          treatment: parsedData.get(variants[1])?.map(u => u.converted ? 1 : 0) || []
                        } : undefined;
                        
                        return (
                          <ComparisonPlot
                            controlSamples={controlSamples}
                            treatmentSamples={treatmentSamples}
                            controlLabel={variants[0]}
                            treatmentLabel={variants[1]}
                            metric="conversion"
                            showRawData={showRawDistributions}
                            rawData={rawData}
                          />
                        );
                      }
                      return <p className="text-gray-500">Need at least 2 variants for comparison</p>;
                    })()}
                  </div>
                  
                  {/* Revenue per User Comparison */}
                  <div>
                    <h4 className="text-base font-medium text-gray-700 mb-4">Revenue per User</h4>
                    {(() => {
                      const variants = Array.from(revenueResults.conversionRates.keys());
                      if (variants.length >= 2) {
                        const controlConv = revenueResults.conversionRates.get(variants[0])!;
                        const treatmentConv = revenueResults.conversionRates.get(variants[1])!;
                        const controlValue = revenueResults.meanValues.get(variants[0]) || [];
                        const treatmentValue = revenueResults.meanValues.get(variants[1]) || [];
                        
                        // Calculate RPU samples
                        const controlRPU = [];
                        const treatmentRPU = [];
                        const minLength = Math.min(controlConv.length, treatmentConv.length);
                        
                        for (let i = 0; i < minLength; i++) {
                          const cRPU = controlConv[i] * (controlValue[i % controlValue.length] || 0);
                          const tRPU = treatmentConv[i] * (treatmentValue[i % treatmentValue.length] || 0);
                          
                          if (!isNaN(cRPU) && isFinite(cRPU)) controlRPU.push(cRPU);
                          if (!isNaN(tRPU) && isFinite(tRPU)) treatmentRPU.push(tRPU);
                        }
                        
                        if (controlRPU.length > 0 && treatmentRPU.length > 0) {
                          // Get raw revenue data if available
                          const rawData = parsedData ? {
                            control: parsedData.get(variants[0])?.map(u => u.value) || [],
                            treatment: parsedData.get(variants[1])?.map(u => u.value) || []
                          } : undefined;
                          
                          return (
                            <ComparisonPlot
                              controlSamples={controlRPU}
                              treatmentSamples={treatmentRPU}
                              controlLabel={variants[0]}
                              treatmentLabel={variants[1]}
                              metric="revenue"
                              showRawData={showRawDistributions}
                              rawData={rawData}
                            />
                          );
                        }
                      }
                      return <p className="text-gray-500">Need value data for comparison</p>;
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Uplift Distribution */}
              {revenueResults.relativeEffects.size > 0 && (
                <div className="bg-white p-6 rounded shadow">
                  <h3 className="font-semibold mb-6 text-lg">Relative Uplift Distribution</h3>
                  {Array.from(revenueResults.relativeEffects.entries()).map(([variant, effects]) => {
                    // Get control RPU samples
                    const controlName = Array.from(revenueResults.conversionRates.keys())[0];
                    const controlConv = revenueResults.conversionRates.get(controlName)!;
                    const controlValue = revenueResults.meanValues.get(controlName) || Array(1000).fill(1);
                    
                    // Calculate RPU samples with validation
                    const controlRPU = [];
                    const treatmentConv = revenueResults.conversionRates.get(variant)!;
                    const treatmentValue = revenueResults.meanValues.get(variant) || Array(1000).fill(1);
                    const treatmentRPU = [];
                    
                    for (let i = 0; i < Math.min(controlConv.length, treatmentConv.length); i++) {
                      const cRPU = controlConv[i] * controlValue[i % controlValue.length];
                      const tRPU = treatmentConv[i] * treatmentValue[i % treatmentValue.length];
                      
                      if (!isNaN(cRPU) && isFinite(cRPU) && cRPU >= 0 &&
                          !isNaN(tRPU) && isFinite(tRPU) && tRPU >= 0) {
                        controlRPU.push(cRPU);
                        treatmentRPU.push(tRPU);
                      }
                    }
                    
                    if (controlRPU.length === 0 || treatmentRPU.length === 0) return null;
                    
                    return (
                      <div key={variant} className="mb-6">
                        <h4 className="text-base font-medium text-gray-700 mb-4">
                          {variant} vs {controlName}
                        </h4>
                        <div className="h-80 w-full">
                          <SafeUpliftGraph
                            controlSamples={controlRPU}
                            treatmentSamples={treatmentRPU}
                            credibleLevel={0.80}
                            isRevenue={true}
                          />
                        </div>
                        <div className="mt-4 text-sm text-gray-600">
                          <p>
                            Probability of positive uplift: {' '}
                            <span className="font-semibold">
                              {(effects.overall.filter(e => e > 0).length / effects.overall.length * 100).toFixed(1)}%
                            </span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Outlier Influence */}
              {revenueResults.outlierInfluence.size > 0 && (
                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold mb-2">Outlier Influence</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Array.from(revenueResults.outlierInfluence.entries()).map(([variant, influence]) => (
                      <div key={variant} className="bg-gray-50 p-3 rounded">
                        <h4 className="font-medium">{variant}</h4>
                        <p className="text-sm text-gray-600">
                          Top user: {influence.topValueContribution.toFixed(1)}% of total value
                        </p>
                        <p className="text-sm text-gray-600">
                          Top 5 users: {influence.top5ValueContribution.toFixed(1)}% of total value
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Effect Drivers */}
              {revenueResults.effectDrivers.size > 0 && (
                <div className="bg-white p-4 rounded shadow">
                  <h3 className="font-semibold mb-2">What Drives the Effect?</h3>
                  {Array.from(revenueResults.effectDrivers.entries()).map(([variant, drivers]) => (
                    <div key={variant} className="mb-3">
                      <h4 className="font-medium">{variant}</h4>
                      <div className="flex gap-2 mt-1">
                        <div className="flex-1 bg-blue-100 rounded px-2 py-1 text-sm">
                          Conversion: {drivers.conversionComponent.toFixed(0)}%
                        </div>
                        <div className="flex-1 bg-green-100 rounded px-2 py-1 text-sm">
                          Value: {drivers.valueComponent.toFixed(0)}%
                        </div>
                        <div className="flex-1 bg-purple-100 rounded px-2 py-1 text-sm">
                          Interaction: {drivers.interaction.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Export the component
export default BayesianAnalysisDemo;

// Auto-mount if this is the entry point
if (typeof document !== 'undefined' && document.getElementById('root')) {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(<BayesianAnalysisDemo />);
}