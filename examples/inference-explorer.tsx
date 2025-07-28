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

// Test utilities
import { TestScenarios } from '../src/tests/scenarios/TestScenarios';
import { BusinessScenarios } from '../src/tests/utilities/synthetic/BusinessScenarios';

// New data generation system
import { DataGenerator, GeneratedDataset } from '../src/core/data-generation';

// Visualization components - Updated to use unified system
import { DiagnosticsPanel, AsyncPosteriorSummary, AsyncPPCDiagnostics } from '../src/ui/visualizations';
import { UnifiedDistributionViz, BRAND_COLORS } from '../src/ui/visualizations/unified';

// New components
import { ModelSelector } from '../src/ui/components/ModelSelector';
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
  type: 'test-scenario' | 'business-scenario' | 'generated' | 'custom' | 'preset';
  name: string;
  description: string;
  generator: (n?: number) => any;
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
  const [modelType, setModelType] = useState<ModelType | undefined>();
  const [error, setError] = useState<string | null>(null);
  
  // PPC configuration
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  
  // Custom data input
  const [customData, setCustomData] = useState('');
  const [customDataFormat, setCustomDataFormat] = useState<'array' | 'binomial' | 'compound'>('array');
  
  // State for data source type selection
  const [dataSourceType, setDataSourceType] = useState<'test-scenario' | 'business-scenario' | 'custom' | 'preset'>('test-scenario');
  
  // Sample size control
  const [sampleSize, setSampleSize] = useState(1000);
  const [useCustomSampleSize, setUseCustomSampleSize] = useState(false);
  
  // CRASH FIX: Clear results when data/model changes
  useEffect(() => {
    setInferenceResult(null);
    setError(null);
  }, [selectedDataSource, selectedModel, dataSourceType]);
  
  // Clear results when data changes (but not when sample size changes)
  useEffect(() => {
    if (generatedData) {
      setInferenceResult(null);
      setError(null);
    }
  }, [generatedData]);
  
  // Debug: Log when inferenceResult changes
  useEffect(() => {
    console.log('📍 InferenceResult changed');
  }, [inferenceResult]);
  
  // Initialize scenarios
  const businessScenarios = useMemo(() => new BusinessScenarios(Date.now()), []);
  
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
  
  // Available data sources
  const dataSources: DataSource[] = useMemo(() => [
    // Test Scenarios
    {
      type: 'test-scenario',
      name: 'Beta-Binomial: Typical',
      description: '3% conversion rate, n=10000',
      generator: (n?: number) => TestScenarios.betaBinomial.typical.generateData(n)
    },
    {
      type: 'business-scenario',
      name: 'E-commerce: Stable Revenue (Gamma)',
      description: 'Low variance revenue distribution',
      generator: (n?: number) => {
        const sampleSize = n || 1000;
        const data = businessScenarios.ecommerce({
          baseConversionRate: 0.08,
          conversionLift: 0,
          revenueDistribution: 'gamma',
          revenueParams: { mean: 50, variance: 500 }, // CV = 0.45, suggests Gamma
          revenueLift: 0,
          sampleSize
        });
        return data.control;
      }
    },
    {
      type: 'test-scenario',
      name: 'Beta-Binomial: High Conversion',
      description: '25% conversion rate, n=1000',
      generator: (n?: number) => TestScenarios.betaBinomial.highConversion.generateData(n)
    },
    {
      type: 'test-scenario',
      name: 'Revenue: E-commerce',
      description: 'LogNormal revenue distribution',
      generator: (n?: number) => TestScenarios.revenue.ecommerce.generateData(n || 500)
    },
    {
      type: 'test-scenario',
      name: 'Revenue: SaaS MRR',
      description: 'Three-tier pricing distribution',
      generator: (n?: number) => TestScenarios.revenue.saas.generateData(n || 500)
    },
    {
      type: 'test-scenario',
      name: 'Mixture: Bimodal',
      description: 'Two clear components',
      generator: (n?: number) => TestScenarios.mixtures.bimodal.generateData(n || 500)
    },
    {
      type: 'test-scenario',
      name: 'Mixture: Revenue Segments',
      description: 'LogNormal mixture for customer tiers',
      generator: (n?: number) => TestScenarios.mixtures.revenueMixture.generateData(n || 500)
    },
    {
      type: 'test-scenario',
      name: 'Compound: Control (Gamma)',
      description: '5% conv, $55 AOV, low variance',
      generator: (n?: number) => TestScenarios.compound.controlVariant.generateUsers(n || 1000)
    },
    {
      type: 'test-scenario',
      name: 'Compound: Treatment (LogNormal)',
      description: '6.5% conv, $60 AOV, high variance',
      generator: (n?: number) => TestScenarios.compound.treatmentVariant.generateUsers(n || 1000)
    },
    {
      type: 'test-scenario',
      name: 'Compound: Multimodal Revenue',
      description: 'Budget vs premium customer segments',
      generator: (n?: number) => TestScenarios.compound.multimodalRevenue.generateUsers(n || 1000)
    },
    
    // Business Scenarios
    {
      type: 'business-scenario',
      name: 'E-commerce: Control (LogNormal)',
      description: 'Baseline with heavy-tailed revenue',
      generator: (n?: number) => {
        const sampleSize = n || 2000;
        const data = businessScenarios.ecommerce({
          baseConversionRate: 0.05,
          conversionLift: 0,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 75, variance: 1500 },
          revenueLift: 0,
          sampleSize
        });
        return data.control;
      }
    },
    {
      type: 'business-scenario',
      name: 'E-commerce: Treatment (LogNormal)',
      description: '30% conv lift, 10% AOV lift',
      generator: (n?: number) => {
        const sampleSize = n || 2000;
        const data = businessScenarios.ecommerce({
          baseConversionRate: 0.05,
          conversionLift: 0.3,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 75, variance: 1500 },
          revenueLift: 0.1,
          sampleSize
        });
        return data.treatment;
      }
    }
  ], [businessScenarios]);
  
  // New preset data sources using DataGenerator
  const presetDataSources: DataSource[] = useMemo(() => [
    {
      type: 'preset',
      name: 'Clear Customer Segments',
      description: 'Budget (70%) vs Premium (30%) customers',
      generator: (n?: number) => DataGenerator.presets.clearSegments(n || 1000, Date.now())
    },
    {
      type: 'preset',
      name: 'SaaS Pricing Tiers',
      description: 'Three-tier pricing model',
      generator: (n?: number) => DataGenerator.presets.saasTiers(n || 1000, Date.now())
    },
    {
      type: 'preset',
      name: 'Four Segments (Stress Test)',
      description: 'Tests 4-component mixture fitting',
      generator: (n?: number) => DataGenerator.presets.fourSegments(n || 1000, Date.now())
    },
    {
      type: 'preset',
      name: 'E-commerce with Segments',
      description: 'Compound model with customer tiers',
      generator: (n?: number) => DataGenerator.presets.ecommerceSegments(n || 1000, Date.now())
    },
    {
      type: 'preset',
      name: 'Beta-Binomial (Known Truth)',
      description: '5% conversion rate with ground truth',
      generator: (n?: number) => DataGenerator.presets.betaBinomial(0.05, n || 1000, Date.now())
    },
    {
      type: 'preset',
      name: 'LogNormal (Known Truth)',
      description: 'Revenue distribution with ground truth',
      generator: (n?: number) => DataGenerator.presets.lognormal(3.5, 0.5, n || 1000, Date.now())
    }
  ], []);
  
  // Filter data sources by type
  const filteredDataSources = useMemo(() => {
    if (dataSourceType === 'preset') {
      return presetDataSources;
    }
    return dataSources.filter(ds => ds.type === dataSourceType);
  }, [dataSources, presetDataSources, dataSourceType]);
  
  // Auto-select first source when type changes
  useEffect(() => {
    if (dataSourceType !== 'custom' && filteredDataSources.length > 0) {
      // Only change selection if current selection is not in the filtered list
      const currentInFiltered = filteredDataSources.find(ds => 
        ds.name === selectedDataSource?.name && ds.type === selectedDataSource?.type
      );
      if (!currentInFiltered) {
        setSelectedDataSource(filteredDataSources[0]);
        setGeneratedData(null);
      }
    } else if (dataSourceType === 'custom') {
      setSelectedDataSource(null);
      setGeneratedData(null);
    }
  }, [dataSourceType, filteredDataSources, selectedDataSource]);
  
  // Generate data when source selected
  const generateData = useCallback(() => {
    if (!selectedDataSource) return;
    
    try {
      // Pass sample size if using custom sample size
      const result = useCustomSampleSize && typeof selectedDataSource.generator === 'function'
        ? selectedDataSource.generator(sampleSize)
        : selectedDataSource.generator();
      
      // Handle GeneratedDataset vs regular data
      if (result && typeof result === 'object' && 'data' in result && 'groundTruth' in result) {
        // This is a GeneratedDataset
        setGeneratedData(result.data);
        // Store ground truth for later use
        setGeneratedDataset(result);
      } else {
        // This is regular data
        setGeneratedData(result);
        setGeneratedDataset(null);
      }
      
      setError(null);
    } catch (err) {
      setError(`Failed to generate data: ${(err as Error).message}`);
    }
  }, [selectedDataSource, sampleSize, useCustomSampleSize]);
  
  // Parse custom data
  const parseCustomData = useCallback(() => {
    if (!customData.trim()) return null;
    
    try {
      switch (customDataFormat) {
        case 'array':
          return customData.split(/[\n,\s]+/)
            .map(x => parseFloat(x))
            .filter(x => !isNaN(x));
            
        case 'binomial':
          const [successes, trials] = customData.split(',').map(x => parseInt(x.trim()));
          return { successes, trials };
          
        case 'compound':
          return customData.split('\n').map(line => {
            const [converted, value] = line.split(',').map(x => x.trim());
            return {
              converted: converted === '1' || converted.toLowerCase() === 'true',
              value: parseFloat(value) || 0
            };
          });
          
        default:
          throw new Error('Unknown data format');
      }
    } catch (err) {
      setError(`Failed to parse custom data: ${(err as Error).message}`);
      return null;
    }
  }, [customData, customDataFormat]);
  
  // Memoize data and posteriors to prevent unnecessary re-renders
  const visualizationData = useMemo(() => {
    return generatedData || parseCustomData();
  }, [generatedData, customData]);
  
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
    const dataToAnalyze = selectedDataSource ? generatedData : parseCustomData();
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
    const result = await runInferenceWorker(selectedModel, dataInput);
    
    if (result) {
      setInferenceResult(result);
      setModelType(result.diagnostics.modelType as ModelType || selectedModel);
    }
  }, [selectedDataSource, generatedData, parseCustomData, selectedModel, runInferenceWorker, numComponents]);
  
  // UI Components
  const DataSourceSelector = () => (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">1. Select Data Source</h3>
      
      <div className="grid grid-cols-4 gap-2 mb-4">
        {(['test-scenario', 'business-scenario', 'preset', 'custom'] as const).map(type => (
          <button
            key={type}
            onClick={() => setDataSourceType(type)}
            className={`px-4 py-2 rounded ${
              dataSourceType === type
                ? 'bg-purple-600 text-white' // Zenith Data lilac
                : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            {type === 'test-scenario' ? 'Test Scenarios' :
             type === 'business-scenario' ? 'Business' :
             type === 'preset' ? 'Generated' :
             'Custom'}
          </button>
        ))}
      </div>
      
      {dataSourceType !== 'custom' && (
        <div className="space-y-3">
          <select
            value={selectedDataSource ? filteredDataSources.indexOf(selectedDataSource) : ''}
            onChange={(e) => {
              const idx = parseInt(e.target.value);
              if (!isNaN(idx) && idx >= 0 && idx < filteredDataSources.length) {
                setSelectedDataSource(filteredDataSources[idx]);
                setGeneratedData(null);
              }
            }}
            className="w-full p-2 border rounded"
          >
            {filteredDataSources.map((ds, idx) => (
              <option key={`${ds.type}-${ds.name}`} value={idx}>
                {ds.name} - {ds.description}
              </option>
            ))}
          </select>
          
          <button
            onClick={generateData}
            disabled={!selectedDataSource}
            className={`px-4 py-2 rounded ${
              selectedDataSource 
                ? 'bg-red-500 text-white hover:bg-red-600' // Zenith Data coral
                : 'bg-gray-400 text-gray-600 cursor-not-allowed'
            }`}
          >
            Generate Data
          </button>
          
          {/* Sample size controls */}
          {selectedDataSource && (dataSourceType === 'test-scenario' || dataSourceType === 'business-scenario' || dataSourceType === 'preset') && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="custom-sample-size"
                  checked={useCustomSampleSize}
                  onChange={(e) => setUseCustomSampleSize(e.target.checked)}
                />
                <label htmlFor="custom-sample-size" className="text-sm">
                  Custom sample size
                </label>
              </div>
              
              {useCustomSampleSize && (
                <div>
                  <label className="text-sm text-gray-600">
                    Sample size: {sampleSize.toLocaleString()}
                  </label>
                  <input
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={sampleSize}
                    onChange={(e) => setSampleSize(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {dataSourceType === 'custom' && (
        <div className="space-y-3">
          <select
            value={customDataFormat}
            onChange={(e) => setCustomDataFormat(e.target.value as any)}
            className="w-full p-2 border rounded"
          >
            <option value="array">Array of numbers</option>
            <option value="binomial">Binomial (successes, trials)</option>
            <option value="compound">Compound (converted, value)</option>
          </select>
          
          <textarea
            value={customData}
            onChange={(e) => setCustomData(e.target.value)}
            placeholder={
              customDataFormat === 'array' ? '10.5, 20.3, 15.8, ...' :
              customDataFormat === 'binomial' ? '45, 1000' :
              '1, 95.50\n0, 0\n1, 105.25\n...'
            }
            className="w-full h-32 p-2 border rounded font-mono text-sm"
          />
        </div>
      )}
      
      {generatedData && (
        <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
          <strong>Data Generated:</strong> 
          {Array.isArray(generatedData) 
            ? ` ${generatedData.length} samples`
            : generatedData.trials 
              ? ` ${generatedData.successes}/${generatedData.trials} successes`
              : ' Unknown format'}
        </div>
      )}
    </div>
  );
  
  // Update the button to show loading and cancel
  const InferenceButton = () => (
    <div className="space-y-2">
      <button
        onClick={isAnalyzing ? cancelInference : runInference}
        disabled={(!generatedData && !customData.trim()) && !isAnalyzing}
        className={`w-full px-4 py-2 rounded flex items-center justify-center ${
          isAnalyzing
            ? 'bg-red-500 text-white hover:bg-red-600' // Cancel button
            : (!generatedData && !customData.trim())
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 text-white'
        }`}
      >
        {isAnalyzing ? (
          <>
            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            Cancel Inference
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
      const data = selectedDataSource ? generatedData : parseCustomData();
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
    
    return (
      <div className="space-y-6">
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
        
        {/* Diagnostics */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Diagnostics</h3>
          <VisualizationErrorBoundary>
            <DiagnosticsPanel diagnostics={inferenceResult.diagnostics} />
          </VisualizationErrorBoundary>
        </div>
        
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
        
        {/* PPC Visualization - Replaces UnifiedPPCDisplay */}
        {visualizationData && Array.isArray(visualizationData) && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Posterior Predictive Check</h3>
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
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Tyche Inference Explorer</h1>
          <p className="text-gray-600 mt-2">
            Test and visualize Bayesian inference across different models and data scenarios
          </p>
        </div>
        
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-orange-100 text-orange-700 rounded-lg"> // Zenith Data coral theme
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