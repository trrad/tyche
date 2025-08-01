// examples/inference-explorer.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// Core imports
import { 
  DataInput, 
  CompoundDataInput,
  InferenceResult,
  FitOptions 
} from '../src/inference/base/types';



// Worker hook
import { useInferenceWorker } from '../src/hooks/useInferenceWorker';

// New data generation system
import { DataGenerator, GeneratedDataset, NoiseLevel } from '../src/tests/utilities/synthetic/DataGenerator';

// Visualization components - Updated to use unified system
import { DiagnosticsPanel, AsyncPosteriorSummary, AsyncPPCDiagnostics } from '../src/ui/visualizations';
import { UnifiedDistributionViz, BRAND_COLORS } from '../src/ui/visualizations/unified';

// New components
import { ModelSelector } from '../src/ui/components/ModelSelector';
import { SimpleCustomCodeEditor } from '../src/ui/components/SimpleCustomCodeEditor';
import { ModelQualityIndicator } from '../src/ui/components/ModelQualityIndicator';
import { ModelComparisonView } from '../src/ui/components/ModelComparisonView';

import { MODEL_DESCRIPTIONS } from '../src/inference/InferenceEngine';

// Styles
import './index.css';

// Types
import type { ModelType } from '../src/inference/InferenceEngine';

interface FitProgress {
  stage: string;
  progress: number;
  iteration?: number;
  totalIterations?: number;
}

interface DataSource {
  name: string;
  description: string;
  category: 'conversion' | 'revenue' | 'mixture' | 'compound';
  generator: ((n?: number, seed?: number, noiseLevel?: NoiseLevel) => any) | null;
  getCode: (params: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => string;
}

/**
 * Inference Explorer App
 * Interactive tool for testing and visualizing Tyche's inference capabilities
 */
function InferenceExplorer() {
  // State
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [generatedDataset, setGeneratedDataset] = useState<GeneratedDataset | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelType>('auto');
  const [numComponents, setNumComponents] = useState(2);
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null);
  const [waicInfo, setWaicInfo] = useState<any>(null);
  const [routeInfo, setRouteInfo] = useState<any>(null);
  const [modelType, setModelType] = useState<ModelType | undefined>();
  const [error, setError] = useState<string | null>(null);
  
  // PPC configuration
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  
  // Data source type selection
  const [activeDataSource, setActiveDataSource] = useState<'synthetic' | 'custom'>('synthetic');
  
  // Sample size control
  const [sampleSize, setSampleSize] = useState(1000);
  const [useCustomSampleSize, setUseCustomSampleSize] = useState(false);
  

  const [useSeed, setUseSeed] = useState(false);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [selectedNoiseLevel, setSelectedNoiseLevel] = useState<NoiseLevel>('realistic');
  
  // Model quality display state
  const [showModelQuality, setShowModelQuality] = useState(true);
  const [comparisonModels, setComparisonModels] = useState<any[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  
  // Use the worker hook
  const { 
    runInference: runInferenceWorker, 
    cancelInference,
    isRunning: isAnalyzing,
    progress: fitProgress,
    error: inferenceError
  } = useInferenceWorker();
  
  // Update error display
  useEffect(() => {
    if (inferenceError) {
      setError(inferenceError);
    }
  }, [inferenceError]);
  
  // Helper to create RNG from seed
  const createRng = (seed: number) => {
    const gen = new DataGenerator(seed);
    return {
      range: (min: number, max: number) => min + Math.random() * (max - min)
    };
  };

  // Helper to execute code and create data source
  const createDataSource = (config: {
    name: string;
    description: string;
    category: 'conversion' | 'revenue' | 'mixture' | 'compound';
    getCode: (params: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => string;
  }): DataSource => ({
    name: config.name,
    description: config.description,
    category: config.category,
    generator: (n, seed, noiseLevel = 'realistic') => {
      const code = config.getCode({
        sampleSize: n || (config.category === 'compound' ? 2000 : 1000),
        seed: seed || Date.now(),
        noiseLevel
      });
      const func = new Function('DataGenerator', 'seed', code);
      return func(DataGenerator, seed || Date.now());
    },
    getCode: config.getCode
  });

  // Create all data sources with unified implementation
  const createAllDataSources = (): DataSource[] => {
    return [
      // === CONVERSION SCENARIOS ===
      {
        name: 'Conversion Rate',
        description: 'Random rate 1-15%',
        category: 'conversion' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => {
          const rng = createRng(seed);
          const p = rng.range(0.01, 0.15);
          return noiseLevel === 'clean'
            ? `return new DataGenerator(seed).betaBinomial(${p.toFixed(3)}, ${sampleSize});`
            : `const gen = new DataGenerator(seed);
const clean = gen.betaBinomial(${p.toFixed(3)}, ${sampleSize});
return { ...clean, data: gen.applyNoiseLevel(clean.data, '${noiseLevel}') };`;
        }
      },

      // === REVENUE SCENARIOS ===
      {
        name: 'Revenue (LogNormal)',
        description: 'Random LogNormal',
        category: 'revenue' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => {
          const rng = createRng(seed);
          const median = rng.range(10, 200);
          const logMean = Math.log(median);
          const logStd = rng.range(0.3, 0.8);
          return noiseLevel === 'clean'
            ? `return new DataGenerator(seed).continuous('lognormal', { logMean: ${logMean.toFixed(3)}, logStd: ${logStd.toFixed(3)} }, ${sampleSize});`
            : `const gen = new DataGenerator(seed);
const clean = gen.continuous('lognormal', { logMean: ${logMean.toFixed(3)}, logStd: ${logStd.toFixed(3)} }, ${sampleSize});
return { ...clean, data: gen.applyNoiseLevel(clean.data, '${noiseLevel}') };`;
        }
      },

      {
        name: 'Revenue (Normal)',
        description: 'Random Normal',
        category: 'revenue' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => {
          const rng = createRng(seed);
          const mean = rng.range(30, 200);
          const std = mean * rng.range(0.15, 0.4);
          return noiseLevel === 'clean'
            ? `return new DataGenerator(seed).continuous('normal', { mean: ${mean.toFixed(1)}, std: ${std.toFixed(1)} }, ${sampleSize});`
            : `const gen = new DataGenerator(seed);
const clean = gen.continuous('normal', { mean: ${mean.toFixed(1)}, std: ${std.toFixed(1)} }, ${sampleSize});
return { ...clean, data: gen.applyNoiseLevel(clean.data, '${noiseLevel}') };`;
        }
      },

      {
        name: 'Revenue (Gamma)',
        description: 'Random Gamma',
        category: 'revenue' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => {
          const rng = createRng(seed);
          const shape = rng.range(1.5, 4);
          const scale = rng.range(30, 150) / shape;
          return noiseLevel === 'clean'
            ? `return new DataGenerator(seed).continuous('gamma', { shape: ${shape.toFixed(2)}, scale: ${scale.toFixed(2)} }, ${sampleSize});`
            : `const gen = new DataGenerator(seed);
const clean = gen.continuous('gamma', { shape: ${shape.toFixed(2)}, scale: ${scale.toFixed(2)} }, ${sampleSize});
return { ...clean, data: gen.applyNoiseLevel(clean.data, '${noiseLevel}') };`;
        }
      },

      // === MIXTURE SCENARIOS ===
      {
        name: 'Customer Segments',
        description: '2-3 random segments',
        category: 'mixture' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => 
          `return DataGenerator.scenarios.segments.${noiseLevel}(${sampleSize}, seed);`
      },

      {
        name: 'Four Segments',
        description: '4-segment mixture',
        category: 'mixture' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => 
          noiseLevel === 'clean'
            ? `return DataGenerator.presets.fourSegments(${sampleSize}, seed);`
            : `const base = DataGenerator.presets.fourSegments(${sampleSize}, seed);
return { ...base, data: new DataGenerator(seed).applyNoiseLevel(base.data, '${noiseLevel}') };`
      },

      // === COMPOUND SCENARIOS ===
      {
        name: 'E-commerce',
        description: 'Random conversion & AOV',
        category: 'compound' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => 
          `return DataGenerator.scenarios.ecommerce.${noiseLevel}(${sampleSize}, seed);`
      },

      {
        name: 'SaaS',
        description: 'Tier subscriptions',
        category: 'compound' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => 
          `return DataGenerator.scenarios.saas.${noiseLevel}(${sampleSize}, seed);`
      },

      {
        name: 'Marketplace',
        description: 'Multi-seller',
        category: 'compound' as const,
        getCode: ({ sampleSize, seed, noiseLevel }: { sampleSize: number; seed: number; noiseLevel: NoiseLevel }) => 
          `return DataGenerator.scenarios.marketplace.${noiseLevel}(${sampleSize}, seed);`
      }
    ].map(createDataSource);
  };

  // Single data source array
  const dataSources: DataSource[] = useMemo(() => createAllDataSources(), []);
  
  // Generate data
  const generateData = useCallback(() => {
    if (!selectedDataSource) return;
    
    try {
      const n = useCustomSampleSize ? sampleSize : undefined;
      const s = useSeed ? seed : undefined; // Only use seed if fixed seed is enabled
      // Pass the selected noise level to the generator
      const result = selectedDataSource.generator!(n, s, selectedNoiseLevel);
      
      // Check if this is a GeneratedDataset (has groundTruth)
      if (result && typeof result === 'object' && 'groundTruth' in result && 'data' in result) {
        setGeneratedDataset(result);
        setGeneratedData(result.data);
      } else {
        setGeneratedData(result);
        setGeneratedDataset(null);
      }
      
      setError(null);
    } catch (err) {
      setError(`Failed to generate data: ${err}`);
      setGeneratedData(null);
      setGeneratedDataset(null);
    }
  }, [selectedDataSource, useCustomSampleSize, sampleSize, seed, useSeed, selectedNoiseLevel]); // Add selectedNoiseLevel
  

  
  // Memoize data and posteriors to prevent unnecessary re-renders
  const visualizationData = useMemo(() => {
    return generatedData;
  }, [generatedData]);
  
  // Format value based on model type
  const formatValue = useCallback((value: number) => {
    if (!modelType) return value.toFixed(3);
    
    if (modelType.includes('beta') || modelType.includes('binomial')) {
      return `${(value * 100).toFixed(1)}%`;
    } else if (modelType.includes('revenue') || modelType.includes('compound')) {
      return `$${value.toFixed(2)}`;
    } else {
      return value.toFixed(3);
    }
  }, [modelType]);
  
  // Helper function to get parameter label
  const getParameterLabel = (modelType: string): string => {
    if (modelType.includes('beta') || modelType.includes('binomial')) {
      return 'Conversion Rate';
    } else if (modelType.includes('revenue') || modelType.includes('compound')) {
      return 'Revenue per User';
    } else if (modelType.includes('gamma')) {
      return 'Rate Parameter';
    } else if (modelType.includes('lognormal')) {
      return 'Value';
    } else if (modelType.includes('normal')) {
      return 'Mean';
    }
    return 'Parameter';
  };
  
  // Use the posterior directly instead of wrapping in a new object
  const posteriorData = useMemo(() => {
    if (!inferenceResult?.posterior) return null;
    
    // For simple posteriors, create a stable object structure
    const posterior = inferenceResult.posterior;
    
    // Check if it's a compound posterior
    if ('frequency' in posterior && 'severity' in posterior) {
      return null; // Will be handled by compound posterior memos
    }
    
    // For simple posteriors, return a stable reference
    return { result: posterior };
  }, [inferenceResult]); // Use the whole result to detect actual changes
  
  const isCompound = useMemo(() => {
    return inferenceResult?.posterior && 
           'frequency' in inferenceResult.posterior && 
           'severity' in inferenceResult.posterior;
  }, [inferenceResult?.posterior]);
  
  const frequencyPosteriorData = useMemo(() => {
    if (!isCompound || !inferenceResult?.posterior) return null;
    const compoundPosterior = inferenceResult.posterior as any;
    return { result: compoundPosterior.frequency };
  }, [isCompound, inferenceResult]); // Use stable dependencies
  
  const severityPosteriorData = useMemo(() => {
    if (!isCompound || !inferenceResult?.posterior) return null;
    const compoundPosterior = inferenceResult.posterior as any;
    return { result: compoundPosterior.severity };
  }, [isCompound, inferenceResult]); // Use stable dependencies
  
  // Run inference
  const runInference = useCallback(async () => {
    const dataToAnalyze = generatedData;
    if (!dataToAnalyze) {
      setError('No data to analyze');
      return;
    }
    
    setError(null);
    setInferenceResult(null);
    
    // Prepare data input
    let dataInput: DataInput | CompoundDataInput;
    
    if (Array.isArray(dataToAnalyze)) {
      if (dataToAnalyze.length > 0 && typeof dataToAnalyze[0] === 'object' && 'converted' in dataToAnalyze[0]) {
        dataInput = { data: dataToAnalyze } as CompoundDataInput;
      } else {
        dataInput = { data: dataToAnalyze };
      }
    } else if (dataToAnalyze.successes !== undefined && dataToAnalyze.trials !== undefined) {
      dataInput = { data: dataToAnalyze };
    } else {
      setError('Unknown data format');
      return;
    }
    
    // Add numComponents to config if using a mixture model
    if (selectedModel.includes('mixture') && numComponents > 1) {
      dataInput.config = {
        ...dataInput.config,
        numComponents: numComponents
      };
    }
    
    // Run inference with worker
    const result = await runInferenceWorker(selectedModel, dataInput, {
      useWAIC: true,
      returnRouteInfo: true
    });
    
    if (result) {
      console.log('Inference result:', result);
      
      // Get WAIC information - check if it's already in the result first
      if ((result as any).waicInfo || (result as any).routeInfo) {
        console.log('WAIC info already in result:', (result as any).waicInfo);
        console.log('Route info already in result:', (result as any).routeInfo);
        setWaicInfo((result as any).waicInfo);
        setRouteInfo((result as any).routeInfo);
      } else if (result.posterior && 'getWaicInfo' in (result.posterior as any)) {
        try {
          const waicData = await (result.posterior as any).getWaicInfo();
          console.log('WAIC info from proxy:', waicData);
          setWaicInfo(waicData.waicInfo);
          setRouteInfo(waicData.routeInfo);
          
          // Debug: Log the actual data we're setting
          console.log('Setting WAIC info:', waicData.waicInfo);
          console.log('Setting route info:', waicData.routeInfo);
        } catch (error) {
          console.warn('Failed to get WAIC info from proxy:', error);
          setWaicInfo(null);
          setRouteInfo(null);
        }
      } else {
        setWaicInfo(null);
        setRouteInfo(null);
      }
      
      setInferenceResult(result);
      setModelType(result.diagnostics.modelType as ModelType || selectedModel);
      
      // Reset comparison state when new inference is run
      setShowComparison(false);
      setComparisonModels([]);
    }
  }, [generatedData, selectedModel, runInferenceWorker, numComponents]);
  
  // UI Components
  const DataSourceSelector = () => (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">1. Select Data Source</h3>
      
      {/* Simple toggle between synthetic and custom */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveDataSource('synthetic')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeDataSource === 'synthetic'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          🎲 Synthetic Data
        </button>
        <button
          onClick={() => setActiveDataSource('custom')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeDataSource === 'custom'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
        >
          📝 Custom Code
        </button>
      </div>
      
      {/* Synthetic data section */}
      {activeDataSource === 'synthetic' && (
        <div className="space-y-4">
          <div className="relative">
            <select
              value={selectedDataSource ? dataSources.findIndex(ds => ds.name === selectedDataSource.name) : ''}
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                if (!isNaN(idx) && idx >= 0 && idx < dataSources.length) {
                  const selected = dataSources[idx];
                  setSelectedDataSource(selected);
                }
              }}
              className="w-full p-3 pr-10 border border-gray-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="" disabled>Select a dataset...</option>
              
              {/* Group by data format compatibility */}
              <optgroup label="📊 Simple Data (Conversion & Revenue)">
                {dataSources
                  .filter(ds => ds.category === 'conversion' || ds.category === 'revenue')
                  .map((ds) => (
                    <option key={ds.name} value={dataSources.indexOf(ds)}>
                      {ds.name} - {ds.description}
                    </option>
                  ))}
              </optgroup>
              
              <optgroup label="🎯 Mixture Models">
                {dataSources
                  .filter(ds => ds.category === 'mixture')
                  .map((ds) => (
                    <option key={ds.name} value={dataSources.indexOf(ds)}>
                      {ds.name} - {ds.description}
                    </option>
                  ))}
              </optgroup>
              
              <optgroup label="👥 User-Level Data">
                {dataSources
                  .filter(ds => ds.category === 'compound')
                  .map((ds) => (
                    <option key={ds.name} value={dataSources.indexOf(ds)}>
                      {ds.name} - {ds.description}
                    </option>
                  ))}
              </optgroup>
            </select>
            
            {/* Custom dropdown arrow */}
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          

          
          <button
            onClick={generateData}
            disabled={!selectedDataSource}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              selectedDataSource 
                ? generatedData
                  ? 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
                  : 'bg-red-500 text-white hover:bg-red-600 shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {generatedData ? (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {Array.isArray(generatedData) 
                  ? `Regenerate Data (${generatedData.length} samples)`
                  : generatedData.trials 
                    ? `Regenerate Data (${generatedData.successes}/${generatedData.trials})`
                    : 'Regenerate Data'}
              </>
            ) : (
              'Generate Data'
            )}
          </button>
          
          {/* Noise Level Selection - Smaller and below button */}
          <div className="text-center">
            <div className="inline-flex gap-3 text-xs">
              {(['clean', 'realistic', 'noisy'] as const).map(level => (
                <label key={level} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="noise-level"
                    value={level}
                    checked={selectedNoiseLevel === level}
                    onChange={(e) => setSelectedNoiseLevel(e.target.value as any)}
                    className="w-3 h-3 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-gray-600 capitalize">{level}</span>
                </label>
              ))}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {selectedNoiseLevel === 'clean' && 'No noise'}
              {selectedNoiseLevel === 'realistic' && '5% error, 2% outliers'}
              {selectedNoiseLevel === 'noisy' && '15% error, 5% outliers'}
            </div>
          </div>
          
          {/* Sample size controls */}
          {selectedDataSource && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="custom-sample-size"
                  checked={useCustomSampleSize}
                  onChange={(e) => setUseCustomSampleSize(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <label htmlFor="custom-sample-size" className="text-sm font-medium text-gray-700">
                  Custom sample size
                </label>
              </div>
              
              {useCustomSampleSize && (
                <div className="pl-6 space-y-3">
                  <div>
                    <label className="text-sm text-gray-600">
                      Sample size: <span className="font-medium text-gray-900">{sampleSize.toLocaleString()}</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="10000"
                      step="100"
                      value={sampleSize}
                      onChange={(e) => setSampleSize(parseInt(e.target.value))}
                      className="w-full mt-1"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>100</span>
                      <span>10,000</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="use-fixed-seed"
                        checked={useSeed}
                        onChange={(e) => setUseSeed(e.target.checked)}
                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                      />
                      <label htmlFor="use-fixed-seed" className="text-sm font-medium text-gray-700">
                        Use fixed seed
                      </label>
                    </div>
                    
                    {useSeed && (
                      <div className="mt-2">
                        <input
                          type="number"
                          value={seed}
                          onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-1 text-sm border rounded"
                          placeholder="Seed value"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Custom code section */}
      {activeDataSource === 'custom' && (
        <SimpleCustomCodeEditor
          onDataGenerated={(data) => {
            setGeneratedData(data);
            setGeneratedDataset(null); // Custom data doesn't have ground truth
            setError(null);
          }}
          onError={setError}
          // Pass the current synthetic scenario's code if available
          syntheticCode={selectedDataSource?.getCode ? 
            selectedDataSource.getCode({
              noiseLevel: selectedNoiseLevel,
              sampleSize: useCustomSampleSize ? sampleSize : 
                (selectedDataSource.category === 'compound' ? 2000 : 1000),
              seed: useSeed ? seed : Date.now()
            }) : undefined}
          syntheticName={selectedDataSource?.name}
        />
      )}
    </div>
  );
  
  // Update the button to show loading and cancel
  const InferenceButton = () => (
    <div className="space-y-2">
      <button
        onClick={isAnalyzing ? cancelInference : runInference}
        disabled={!generatedData && !isAnalyzing}
        className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center ${
          isAnalyzing
            ? 'bg-red-500 text-white hover:bg-red-600 shadow-sm' // Cancel button
            : !generatedData
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
        }`}
      >
        {isAnalyzing ? (
          <>
            <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Running Inference...
          </>
        ) : (
          'Run Inference'
        )}
      </button>
      
      {isAnalyzing && fitProgress && (
        <div className="space-y-1">
          <div className="text-sm text-gray-600">{fitProgress.stage}</div>
          <div className="bg-gray-200 rounded-full h-2">
            <div 
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${fitProgress.progress}%` }}
            />
          </div>
          {fitProgress.iteration && fitProgress.totalIterations && (
            <div className="text-xs text-gray-500 text-center">
              Iteration {fitProgress.iteration} / {fitProgress.totalIterations}
            </div>
          )}
        </div>
      )}
    </div>
  );

    const ModelSelectorComponent = () => {
    // Calculate data size for component recommendations
    const getDataSize = () => {
              const data = generatedData;
      if (!data) return undefined;
      
      if (Array.isArray(data)) {
        return data.length;
      }
      
      // For compound data, count the number of users
      if (data && Array.isArray(data.data)) {
        return data.data.length;
      }
      
      // For binomial data, use trials
      if (data && typeof data === 'object' && 'trials' in data) {
        return data.trials;
      }
      
      return undefined;
    };
    
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">2. Select Model</h3>
        
        <div className="space-y-3">
          <ModelSelector
            value={selectedModel}
            onChange={(model, components) => {
              setSelectedModel(model);
              if (components !== undefined) {
                setNumComponents(components);
              }
            }}
            disabled={isAnalyzing}
            dataSize={getDataSize()}
            numComponents={numComponents}
          />
          
          <InferenceButton />
        </div>
      </div>
    );
  };
  
  // Add error boundary to visualizations
  const VisualizationErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [hasError, setHasError] = useState(false);
    
    useEffect(() => {
      setHasError(false);
    }, [inferenceResult]); // Reset when results change
    
    if (hasError) {
      return (
        <div className="p-4 bg-red-50 rounded">
          <p className="text-red-600">Unable to render visualization</p>
          <button
            onClick={() => setHasError(false)}
            className="text-sm text-red-700 underline mt-2"
          >
            Retry
          </button>
        </div>
      );
    }
    
    try {
      return <>{children}</>;
    } catch (error) {
      setHasError(true);
      return null;
    }
  };

  const ResultsDisplay = () => {
    if (!inferenceResult) return null;
    
    // Determine headline for PPC
    let ppcHeadline = '';
    if (isCompound) {
      ppcHeadline = 'Beliefs about revenue per user';
    } else {
      ppcHeadline = `Beliefs about ${getParameterLabel(modelType || selectedModel).toLowerCase()}`;
    }

    return (
      <div className="space-y-6">
        {/* PPC Visualization - HEADLINE */}
        {visualizationData && Array.isArray(visualizationData) && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">{ppcHeadline}</h3>
            <VisualizationErrorBoundary>
              <UnifiedDistributionViz
                distributions={[
                  {
                    id: 'observed',
                    label: 'Observed Data',
                    samples: (() => {
                      // For compound models, extract revenue values from converted users
                      if (isCompound && typeof visualizationData[0] === 'object') {
                        return (visualizationData as any[])
                          .filter(u => u.converted && u.value > 0)
                          .map(u => u.value);
                      }
                      // For simple models, use data as-is
                      return visualizationData as number[];
                    })(),
                    color: BRAND_COLORS.observed,
                    metadata: { isObserved: true }
                  },
                  {
                    id: 'predictive',
                    label: 'Posterior Predictive',
                    posterior: (() => {
                      // For compound models, use severity posterior for value predictions
                      if (isCompound && inferenceResult?.posterior) {
                        const compoundPosterior = inferenceResult.posterior as any;
                        return compoundPosterior.severity;
                      }
                      // For simple models, use the posterior directly
                      return inferenceResult.posterior;
                    })(),
                    color: BRAND_COLORS.predicted
                  }
                ]}
                display={{
                  mode: 'mixed',  // Use mixed mode for PPC
                  showCI: true,
                  ciLevels: [0.8, 0.95],
                  showGrid: true,
                  binCount: (() => {
                    // Adjust bin count based on data type
                    const obsData = isCompound && typeof visualizationData[0] === 'object'
                      ? (visualizationData as any[]).filter(u => u.converted && u.value > 0)
                      : visualizationData as number[];
                    return Math.min(50, Math.max(15, Math.ceil(obsData.length / 3)));
                  })()
                }}
                width={700}
                height={400}
                margin={{ top: 40, right: 150, bottom: 60, left: 60 }}
                formatValue={isCompound ? (v => `$${v.toFixed(0)}`) : formatValue}
                xLabel={isCompound ? 'Value (Converted Users)' : getParameterLabel(modelType || selectedModel)}
                title=""  // Clean look, no title
              />
            </VisualizationErrorBoundary>
            {/* PPC Diagnostics */}
            <div className="mt-4 border-t pt-4">
              <VisualizationErrorBoundary>
                <AsyncPPCDiagnostics
                  observedData={(() => {
                    // Same logic for observed data extraction
                    if (isCompound && typeof visualizationData[0] === 'object') {
                      return (visualizationData as any[])
                        .filter(u => u.converted && u.value > 0)
                        .map(u => u.value);
                    }
                    return visualizationData as number[];
                  })()}
                  posterior={(() => {
                    // Same logic for posterior selection
                    if (isCompound && inferenceResult?.posterior) {
                      const compoundPosterior = inferenceResult.posterior as any;
                      return compoundPosterior.severity;
                    }
                    return inferenceResult.posterior;
                  })()}
                />
              </VisualizationErrorBoundary>
            </div>
          </div>
        )}

        {/* Posterior Summary */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Posterior Summary</h3>
          <VisualizationErrorBoundary>
            <AsyncPosteriorSummary 
              posterior={inferenceResult.posterior} 
              modelType={inferenceResult.diagnostics.modelType || selectedModel}
            />
          </VisualizationErrorBoundary>
        </div>
        
        {/* Distribution Plot for Simple Models - Replaces AsyncViolinPlot */}
        {!isCompound && posteriorData && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Parameter Distribution</h3>
            <VisualizationErrorBoundary>
              <UnifiedDistributionViz
                distributions={[{
                  id: 'posterior',
                  label: getParameterLabel(modelType || selectedModel),
                  posterior: posteriorData.result
                }]}
                display={{
                  mode: 'density',
                  showMean: true,
                  showCI: true,
                  ciLevels: [0.8, 0.5]
                }}
                width={700}
                height={400}
                formatValue={formatValue}
                title={`${getParameterLabel(modelType || selectedModel)} Distribution`}
              />
            </VisualizationErrorBoundary>
          </div>
        )}
        
        {/* Distribution Plots for Compound Models - Replaces AsyncViolinPlot */}
        {isCompound && frequencyPosteriorData && severityPosteriorData && (
          <>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Conversion Rate Distribution</h3>
              <VisualizationErrorBoundary>
                <UnifiedDistributionViz
                  distributions={[{
                    id: 'conversion',
                    label: 'Conversion Rate',
                    posterior: frequencyPosteriorData.result,
                    color: '#10b981'
                  }]}
                  display={{
                    mode: 'density',
                    showMean: true,
                    showCI: true,
                    ciLevels: [0.8, 0.5]
                  }}
                  width={700}
                  height={350}
                  formatValue={v => `${(v * 100).toFixed(1)}%`}
                  title="Conversion Rate Distribution"
                />
              </VisualizationErrorBoundary>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Value Distribution (Converted Users)</h3>
              <VisualizationErrorBoundary>
                <UnifiedDistributionViz
                  distributions={[{
                    id: 'value',
                    label: 'Value | Converted',
                    posterior: severityPosteriorData.result,
                    color: '#3b82f6'
                  }]}
                  display={{
                    mode: 'density',
                    showMean: true,
                    showCI: true,
                    ciLevels: [0.8, 0.5]
                  }}
                  width={700}
                  height={350}
                  formatValue={v => `$${v.toFixed(2)}`}
                  title="Value per Converted User"
                />
              </VisualizationErrorBoundary>
            </div>
            
            {/* Revenue per User - Shows the compound result */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">Revenue per User Distribution</h3>
              <VisualizationErrorBoundary>
                <UnifiedDistributionViz
                  distributions={[{
                    id: 'revenue',
                    label: 'Revenue per User',
                    posterior: inferenceResult.posterior,
                    color: '#8b5cf6'
                  }]}
                  display={{
                    mode: 'density',
                    showMean: true,
                    showCI: true,
                    ciLevels: [0.8, 0.5]
                  }}
                  width={700}
                  height={350}
                  formatValue={v => `$${v.toFixed(2)}`}
                  title="Expected Revenue per User"
                  subtitle="Conversion × Value = Revenue"
                />
              </VisualizationErrorBoundary>
            </div>
          </>
        )}
        
        {/* Model Quality Section */}
        {(() => {
          console.log('🔍 [UI Debug] waicInfo:', waicInfo);
          console.log('🔍 [UI Debug] routeInfo:', routeInfo);
          console.log('🔍 [UI Debug] showModelQuality:', showModelQuality);
          return (waicInfo || routeInfo) && showModelQuality;
        })() && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Model Quality</h3>
              <button
                onClick={() => setShowModelQuality(!showModelQuality)}
                className="text-gray-500 hover:text-gray-700"
              >
                {showModelQuality ? '−' : '+'}
              </button>
            </div>
            
            <ModelQualityIndicator
              waicInfo={waicInfo}
              routeInfo={routeInfo}
            />
            
            {/* Add comparison button for auto mode */}
            {selectedModel === 'auto' && routeInfo?.modelParams?.waicComparison && (
              <button
                onClick={() => setShowComparison(!showComparison)}
                className="mt-3 text-sm text-gray-500 hover:text-gray-700 underline"
              >
                {showComparison ? 'Hide' : 'Show'} alternative models
              </button>
            )}
          </div>
        )}
        
        {/* Model Comparison Section */}
        {showComparison && routeInfo?.modelParams?.waicComparison && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Model Comparison</h3>
              <button
                onClick={() => setShowComparison(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            
            <ModelComparisonView
              waicComparison={routeInfo.modelParams.waicComparison}
            />
          </div>
        )}
        
        {/* Diagnostics */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Diagnostics</h3>
          <VisualizationErrorBoundary>
            <DiagnosticsPanel diagnostics={inferenceResult.diagnostics} />
          </VisualizationErrorBoundary>
        </div>
        
        {/* Ground Truth Comparison */}
        {generatedDataset?.groundTruth && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Parameter Recovery</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-700">Ground Truth</h4>
                <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto">
                  {JSON.stringify(generatedDataset.groundTruth, null, 2)}
                </pre>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-700">Recovered Parameters</h4>
                <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto">
                  {JSON.stringify(inferenceResult.diagnostics.modelType, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-purple-900">TycheJS</h1>
          <p className="text-gray-600 mt-2">
            An opinionated browser-based Bayesian inference engine for solving real-world problems.
            </p>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-orange-100 text-orange-700 rounded-lg">
            <strong>Error:</strong> {error}
          </div>
        )}
        
        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Configuration */}
          <div className="space-y-6">
            <DataSourceSelector />
            <ModelSelectorComponent />
          </div>
          
          {/* Right Column: Results */}
          <div className="lg:col-span-2">
            {inferenceResult ? (
              <ResultsDisplay />
            ) : (
              <div className="bg-white p-12 rounded-lg shadow text-center text-gray-500">
                <p className="text-lg">Select data and run inference to see results</p>
                <p className="mt-2">PPC visualizations will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<InferenceExplorer />);