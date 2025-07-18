import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { beta, BetaRV } from '../src/core/distributions/Beta';
import { ConversionValueModel, VariantData, UserData } from '../src/models/ConversionValueModel';
import { RandomVariable } from '../src/core/RandomVariable';
import * as Plot from '@observablehq/plot';
import * as d3 from 'd3';

/**
 * Enhanced demo with Observable Plot showing:
 * 1. Conversion rate distributions
 * 2. Value distributions with outlier detection
 * 3. Combined effect decomposition
 * 4. Interactive uplift curves
 */
function EnhancedBayesianDemo() {
  const [activeTab, setActiveTab] = useState<'simple' | 'revenue'>('revenue');
  
  // Simple A/B Test State
  const [variants, setVariants] = useState([
    { name: 'Control', visitors: 1000, conversions: 45 },
    { name: 'Treatment', visitors: 1000, conversions: 58 }
  ]);
  const [credibleLevel, setCredibleLevel] = useState(0.95);
  const [selectedMetric, setSelectedMetric] = useState<'conversion' | 'value' | 'combined'>('combined');
  
  // Revenue Analysis State
  const [revenueModel, setRevenueModel] = useState<ConversionValueModel | null>(null);
  const [revenueResults, setRevenueResults] = useState<any>(null);
  const [dataInput, setDataInput] = useState('');
  
  // Refs for Observable Plot containers
  const conversionPlotRef = useRef<HTMLDivElement>(null);
  const valuePlotRef = useRef<HTMLDivElement>(null);
  const upliftPlotRef = useRef<HTMLDivElement>(null);
  const decompositionPlotRef = useRef<HTMLDivElement>(null);
  
  // Generate sample revenue data
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
Control,0,0
Control,1,88.00
Control,0,0
Control,1,115.00
Treatment,1,125.00
Treatment,0,0
Treatment,1,95.00
Treatment,1,2500.00
Treatment,1,110.00
Treatment,0,0
Treatment,1,105.00
Treatment,1,115.00
Treatment,0,0
Treatment,1,88.00
Treatment,0,0
Treatment,1,130.00
Treatment,1,98.00
Treatment,0,0`;
    
    setDataInput(sampleCSV);
  };
  
  // Parse and analyze revenue data
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
  
  // Render conversion rate distributions using Observable Plot
  useEffect(() => {
    if (!conversionPlotRef.current || !revenueModel) return;
    
    // Get posterior samples for conversion rates
    const samples: Array<{variant: string, value: number, metric: string}> = [];
    const numSamples = 1000;
    
    // Parse the input data to get conversion rates
    const lines = dataInput.trim().split('\n');
    const variantStats = new Map<string, {conversions: number, total: number}>();
    
    for (let i = 1; i < lines.length; i++) {
      const [variant, converted] = lines[i].split(',');
      if (!variantStats.has(variant)) {
        variantStats.set(variant, {conversions: 0, total: 0});
      }
      const stats = variantStats.get(variant)!;
      stats.total++;
      if (converted === '1') stats.conversions++;
    }
    
    variantStats.forEach((stats, variant) => {
      const posterior = beta(
        1 + stats.conversions,
        1 + stats.total - stats.conversions
      );
      
      for (let i = 0; i < numSamples; i++) {
        samples.push({
          variant,
          value: posterior.sample(),
          metric: 'conversion'
        });
      }
    });
    
    // Create density plot
    const plot = Plot.plot({
      width: 600,
      height: 300,
      marginLeft: 60,
      title: "Conversion Rate Posteriors",
      color: { scheme: "Observable10" },
      marks: [
        Plot.rectY(samples, Plot.binX(
          { y: "count" },
          {
            x: "value",
            fill: "variant",
            thresholds: 50
          }
        )),
        Plot.ruleY([0])
      ],
      x: { label: "Conversion Rate", tickFormat: ".1%" },
      y: { label: "Density" }
    });
    
    conversionPlotRef.current.replaceChildren(plot);
  }, [revenueModel, revenueResults, dataInput]);
  
  // Render value distributions with outlier highlighting
  useEffect(() => {
    if (!valuePlotRef.current || !revenueModel) return;
    
    interface ValueDataPoint {
      variant: string;
      value: number;
      isOutlier: boolean;
    }
    
    const valueData: ValueDataPoint[] = [];
    
    // Parse the input data to get values
    const lines = dataInput.trim().split('\n');
    
    for (let i = 1; i < lines.length; i++) {
      const [variant, converted, value] = lines[i].split(',');
      if (converted === '1' && parseFloat(value) > 0) {
        valueData.push({
          variant,
          value: parseFloat(value),
          isOutlier: false
        });
      }
    }
    
    // Mark outliers (top 5% of values)
    const threshold = d3.quantile(valueData.map(d => d.value), 0.95) || 0;
    valueData.forEach(d => {
      d.isOutlier = d.value > threshold;
    });
    
    const plot = Plot.plot({
      width: 600,
      height: 300,
      marginLeft: 60,
      title: "Revenue Distribution (Converters Only)",
      color: { 
        legend: true,
        domain: ["Normal", "Outlier"],
        range: ["steelblue", "red"]
      },
      marks: [
        Plot.dot(valueData, {
          x: "variant",
          y: "value",
          fill: (d: ValueDataPoint) => d.isOutlier ? "Outlier" : "Normal",
          r: (d: ValueDataPoint) => d.isOutlier ? 6 : 3,
          opacity: 0.7
        }),
        Plot.boxY(valueData, {
          x: "variant",
          y: "value",
          stroke: "variant"
        })
      ],
      y: { 
        label: "Revenue ($)",
        type: "log",
        tickFormat: "$,.0f"
      }
    });
    
    valuePlotRef.current.replaceChildren(plot);
  }, [revenueModel, revenueResults, dataInput]);
  
  // Render uplift distribution
  useEffect(() => {
    if (!upliftPlotRef.current || !revenueResults) return;
    
    interface UpliftDataPoint {
      uplift: number;
      component: string;
      index: number;
    }
    
    // Get relative effects from results
    const upliftData: UpliftDataPoint[] = [];
    const treatmentEffects = revenueResults.relativeEffects.get('Treatment');
    
    if (treatmentEffects) {
      treatmentEffects.overall.forEach((value: number, idx: number) => {
        upliftData.push({
          uplift: value,
          component: 'Overall',
          index: idx
        });
      });
      
      // Also add conversion and value components
      if (treatmentEffects.conversionOnly) {
        treatmentEffects.conversionOnly.forEach((value: number, idx: number) => {
          upliftData.push({
            uplift: value,
            component: 'Conversion Only',
            index: idx
          });
        });
      }
      
      if (treatmentEffects.valueOnly) {
        treatmentEffects.valueOnly.forEach((value: number, idx: number) => {
          upliftData.push({
            uplift: value,
            component: 'Value Only',
            index: idx
          });
        });
      }
    }
    
    const plot = Plot.plot({
      width: 600,
      height: 400,
      marginLeft: 60,
      title: "Relative Uplift Distribution",
      color: { 
        legend: true,
        scheme: "Observable10"
      },
      facet: {
        data: upliftData,
        y: "component",
        marginRight: 80
      },
      marks: [
        Plot.rectY(upliftData, Plot.binX(
          { y: "count" },
          {
            x: "uplift",
            fill: "component",
            thresholds: 50
          }
        )),
        Plot.ruleX([0], { stroke: "red", strokeWidth: 2 }),
        Plot.ruleX([1], { stroke: "gray", strokeDasharray: "4,4" })
      ],
      x: { 
        label: "Relative Uplift",
        tickFormat: "+.0%",
        domain: [-0.5, 3]
      },
      y: { label: "Density" }
    });
    
    upliftPlotRef.current.replaceChildren(plot);
  }, [revenueResults, selectedMetric]);
  
  // Render effect decomposition
  useEffect(() => {
    if (!decompositionPlotRef.current || !revenueResults) return;
    
    interface DecompositionDataPoint {
      variant: string;
      component: string;
      contribution: number;
    }
    
    const decompositionData: DecompositionDataPoint[] = [];
    
    Array.from(revenueResults.effectDrivers.entries()).forEach(([variant, drivers]: [string, any]) => {
      if (variant !== 'Control') {
        decompositionData.push({
          variant,
          component: 'Conversion Rate',
          contribution: drivers.conversionComponent
        });
        decompositionData.push({
          variant,
          component: 'Average Value',
          contribution: drivers.valueComponent
        });
        decompositionData.push({
          variant,
          component: 'Interaction',
          contribution: 1 - drivers.conversionComponent - drivers.valueComponent
        });
      }
    });
    
    const plot = Plot.plot({
      width: 600,
      height: 300,
      marginLeft: 100,
      title: "Effect Decomposition",
      color: { 
        legend: true,
        scheme: "Observable10"
      },
      marks: [
        Plot.barX(decompositionData, {
          y: "variant",
          x: "contribution",
          fill: "component",
          sort: { y: "x", reverse: true }
        }),
        Plot.ruleX([0])
      ],
      x: { 
        label: "Contribution to Total Effect",
        tickFormat: ".0%"
      },
      y: { label: null }
    });
    
    decompositionPlotRef.current.replaceChildren(plot);
  }, [revenueResults]);
  
  const formatPercent = (value: number, decimals = 1) => 
    `${(value * 100).toFixed(decimals)}%`;
  
  const formatCurrency = (value: number) => 
    `$${value.toFixed(2)}`;
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Enhanced Bayesian Analysis Demo</h1>
      
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
          Conversion + Revenue Analysis
        </button>
      </div>
      
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          {/* Data Input */}
          <div className="bg-white p-4 rounded shadow">
            <h2 className="text-xl font-semibold mb-4">User-Level Data</h2>
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
          
          {/* Visualizations */}
          {revenueResults && (
            <div className="space-y-6">
              {/* Model Summary */}
              <div className="bg-gray-50 p-4 rounded">
                <h3 className="font-semibold mb-2">Data Summary</h3>
                <pre className="text-sm">{revenueModel?.getSummary()}</pre>
              </div>
              
              {/* Metric Selector */}
              <div className="bg-white p-4 rounded shadow">
                <h3 className="font-semibold mb-4">Select Metric View</h3>
                <div className="flex gap-4">
                  <button
                    onClick={() => setSelectedMetric('conversion')}
                    className={`px-3 py-1 rounded ${
                      selectedMetric === 'conversion' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200'
                    }`}
                  >
                    Conversion Rate
                  </button>
                  <button
                    onClick={() => setSelectedMetric('value')}
                    className={`px-3 py-1 rounded ${
                      selectedMetric === 'value' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200'
                    }`}
                  >
                    Revenue Value
                  </button>
                  <button
                    onClick={() => setSelectedMetric('combined')}
                    className={`px-3 py-1 rounded ${
                      selectedMetric === 'combined' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-200'
                    }`}
                  >
                    Combined Effect
                  </button>
                </div>
              </div>
              
              {/* Visualizations Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Conversion Posteriors */}
                <div className="bg-white p-4 rounded shadow">
                  <div ref={conversionPlotRef}></div>
                </div>
                
                {/* Value Distribution */}
                <div className="bg-white p-4 rounded shadow">
                  <div ref={valuePlotRef}></div>
                </div>
                
                {/* Uplift Distribution */}
                <div className="bg-white p-4 rounded shadow col-span-full">
                  <div ref={upliftPlotRef}></div>
                </div>
                
                {/* Effect Decomposition */}
                <div className="bg-white p-4 rounded shadow col-span-full">
                  <div ref={decompositionPlotRef}></div>
                </div>
              </div>
              
              {/* Outlier Warnings */}
              {Array.from(revenueResults.outlierInfluence.entries()).map(([variant, outliers]: [string, any]) => 
                outliers.topValueContribution > 0.2 && (
                  <div key={variant} className="bg-red-50 p-4 rounded border-2 border-red-200">
                    <h3 className="font-semibold text-red-700 mb-2">
                      ⚠️ Outlier Warning for {variant}
                    </h3>
                    <p>
                      Top user: {formatPercent(outliers.topValueContribution)} of revenue<br/>
                      Top 5 users: {formatPercent(outliers.top5ValueContribution)} of revenue
                    </p>
                    <p className="mt-2 text-sm text-red-600">
                      Consider running analysis with and without outliers to assess impact.
                    </p>
                  </div>
                )
              )}
              
              {/* Decision Recommendation */}
              <div className="bg-blue-50 p-6 rounded border-2 border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-4">Decision Analysis</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-blue-700">Expected Revenue Uplift</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {formatPercent(
                        revenueResults.relativeEffects.get('Treatment')?.overall.reduce((a, b) => a + b, 0) / 
                        revenueResults.relativeEffects.get('Treatment')?.overall.length || 0
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-blue-700">Probability of Improvement</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {formatPercent(
                        revenueResults.relativeEffects.get('Treatment')?.overall.filter(x => x > 0).length / 
                        revenueResults.relativeEffects.get('Treatment')?.overall.length || 0
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EnhancedBayesianDemo;