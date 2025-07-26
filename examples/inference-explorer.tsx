// examples/inference-explorer.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// Core imports
import { InferenceEngine } from '../src/inference/InferenceEngine';
import { 
  DataInput, 
  CompoundDataInput,
  InferenceResult,
  FitOptions 
} from '../src/inference/base/types';

// Test utilities
import { TestScenarios } from '../src/tests/scenarios/TestScenarios';
import { BusinessScenarios } from '../src/tests/utilities/synthetic/BusinessScenarios';

// Visualization components
import { PPCVisualizer, DiagnosticsPanel, PosteriorSummary, UnifiedPPCDisplay } from '../src/ui/visualizations';

// Styles
import './index.css';

// Types
type ModelType = 
  | 'auto'                    // Auto-detect from data
  | 'beta-binomial'           // Binary outcomes
  | 'gamma'                   // Positive continuous
  | 'lognormal'               // Heavy-tailed positive
  | 'normal-mixture'          // Multimodal continuous
  | 'lognormal-mixture'       // Multimodal heavy-tailed
  | 'compound-beta-gamma'     // Conversion × Gamma revenue
  | 'compound-beta-lognormal'; // Conversion × LogNormal revenue

interface FitProgress {
  stage: string;
  progress: number;
  iteration?: number;
  totalIterations?: number;
}

interface DataSource {
  type: 'test-scenario' | 'business-scenario' | 'generated' | 'custom';
  name: string;
  description: string;
  generator: () => any;
}

/**
 * Inference Explorer App
 * Interactive tool for testing and visualizing Tyche's inference capabilities
 */
function InferenceExplorer() {
  // State
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);
  const [generatedData, setGeneratedData] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<ModelType>('auto');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fitProgress, setFitProgress] = useState<FitProgress | null>(null);
  const [inferenceResult, setInferenceResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // PPC configuration
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  
  // Custom data input
  const [customData, setCustomData] = useState('');
  const [customDataFormat, setCustomDataFormat] = useState<'array' | 'binomial' | 'compound'>('array');
  
  // State for data source type selection
  const [dataSourceType, setDataSourceType] = useState<'test-scenario' | 'business-scenario' | 'custom'>('test-scenario');
  
  // Initialize scenarios
  const businessScenarios = useMemo(() => new BusinessScenarios(Date.now()), []);
  const inferenceEngine = useMemo(() => new InferenceEngine(), []);
  
  // Available data sources
  const dataSources: DataSource[] = useMemo(() => [
    // Test Scenarios
    {
      type: 'test-scenario',
      name: 'Beta-Binomial: Typical',
      description: '3% conversion rate, n=10000',
      generator: () => TestScenarios.betaBinomial.typical.generateData()
    },
    {
      type: 'business-scenario',
      name: 'E-commerce: Stable Revenue (Gamma)',
      description: 'Low variance revenue distribution',
      generator: () => {
        const data = businessScenarios.ecommerce({
          baseConversionRate: 0.08,
          conversionLift: 0,
          revenueDistribution: 'gamma',
          revenueParams: { mean: 50, variance: 500 }, // CV = 0.45, suggests Gamma
          revenueLift: 0,
          sampleSize: 1000
        });
        return data.control;
      }
    },
    {
      type: 'test-scenario',
      name: 'Beta-Binomial: High Conversion',
      description: '25% conversion rate, n=1000',
      generator: () => TestScenarios.betaBinomial.highConversion.generateData()
    },
    {
      type: 'test-scenario',
      name: 'Revenue: E-commerce',
      description: 'LogNormal revenue distribution',
      generator: () => TestScenarios.revenue.ecommerce.generateData(500)
    },
    {
      type: 'test-scenario',
      name: 'Revenue: SaaS MRR',
      description: 'Three-tier pricing distribution',
      generator: () => TestScenarios.revenue.saas.generateData(500)
    },
    {
      type: 'test-scenario',
      name: 'Mixture: Bimodal',
      description: 'Two clear components',
      generator: () => TestScenarios.mixtures.bimodal.generateData(500)
    },
    {
      type: 'test-scenario',
      name: 'Mixture: Revenue Segments',
      description: 'LogNormal mixture for customer tiers',
      generator: () => TestScenarios.mixtures.revenueMixture.generateData(500)
    },
    {
      type: 'test-scenario',
      name: 'Compound: Control (Gamma)',
      description: '5% conv, $55 AOV, low variance',
      generator: () => TestScenarios.compound.controlVariant.generateUsers(1000)
    },
    {
      type: 'test-scenario',
      name: 'Compound: Treatment (LogNormal)',
      description: '6.5% conv, $60 AOV, high variance',
      generator: () => TestScenarios.compound.treatmentVariant.generateUsers(1000)
    },
    {
      type: 'test-scenario',
      name: 'Compound: Multimodal Revenue',
      description: 'Budget vs premium customer segments',
      generator: () => TestScenarios.compound.multimodalRevenue.generateUsers(1000)
    },
    
    // Business Scenarios
    {
      type: 'business-scenario',
      name: 'E-commerce: Control (LogNormal)',
      description: 'Baseline with heavy-tailed revenue',
      generator: () => {
        const data = businessScenarios.ecommerce({
          baseConversionRate: 0.05,
          conversionLift: 0,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 75, variance: 1500 },
          revenueLift: 0,
          sampleSize: 2000
        });
        return data.control;
      }
    },
    {
      type: 'business-scenario',
      name: 'E-commerce: Treatment (LogNormal)',
      description: '30% conv lift, 10% AOV lift',
      generator: () => {
        const data = businessScenarios.ecommerce({
          baseConversionRate: 0.05,
          conversionLift: 0.3,
          revenueDistribution: 'lognormal',
          revenueParams: { mean: 75, variance: 1500 },
          revenueLift: 0.1,
          sampleSize: 2000
        });
        return data.treatment;
      }
    }
  ], [businessScenarios]);
  
  // Filter data sources by type
  const filteredDataSources = useMemo(() => 
    dataSources.filter(ds => ds.type === dataSourceType),
    [dataSources, dataSourceType]
  );
  
  // Auto-select first source when type changes
  useEffect(() => {
    if (dataSourceType !== 'custom' && filteredDataSources.length > 0) {
      setSelectedDataSource(filteredDataSources[0]);
      setGeneratedData(null);
    } else if (dataSourceType === 'custom') {
      setSelectedDataSource(null);
      setGeneratedData(null);
    }
  }, [dataSourceType, filteredDataSources]);
  
  // Generate data when source selected
  const generateData = useCallback(() => {
    if (!selectedDataSource) return;
    
    try {
      const data = selectedDataSource.generator();
      setGeneratedData(data);
      setError(null);
    } catch (err) {
      setError(`Failed to generate data: ${(err as Error).message}`);
    }
  }, [selectedDataSource]);
  
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
  
  // Run inference
  const runInference = useCallback(async () => {
    const dataToAnalyze = selectedDataSource ? generatedData : parseCustomData();
    if (!dataToAnalyze) {
      setError('No data to analyze');
      return;
    }
    
    setIsAnalyzing(true);
    setError(null);
    setInferenceResult(null);
    
    try {
      // Prepare data input
      let dataInput: DataInput | CompoundDataInput;
      
      // Detect data type
      if (Array.isArray(dataToAnalyze)) {
        if (dataToAnalyze.length > 0 && typeof dataToAnalyze[0] === 'object' && 'converted' in dataToAnalyze[0]) {
          // Compound data
          dataInput = { data: dataToAnalyze } as CompoundDataInput;
        } else {
          // Array data
          dataInput = { data: dataToAnalyze };
        }
      } else if (dataToAnalyze.successes !== undefined && dataToAnalyze.trials !== undefined) {
        // Binomial data
        dataInput = { data: dataToAnalyze };
      } else {
        throw new Error('Unknown data format');
      }
      
      // Run inference with progress tracking
      const result = await inferenceEngine.fit(
        selectedModel,
        dataInput,
        {
          onProgress: (progress: FitProgress) => setFitProgress(progress)
        }
      );
      
      setInferenceResult(result);
      setFitProgress(null);
      
    } catch (err) {
      setError(`Inference failed: ${(err as Error).message}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedDataSource, generatedData, parseCustomData, selectedModel, inferenceEngine]);
  
  // UI Components
  const DataSourceSelector = () => (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">1. Select Data Source</h3>
      
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(['test-scenario', 'business-scenario', 'custom'] as const).map(type => (
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
             'Custom'}
          </button>
        ))}
      </div>
      
      {dataSourceType !== 'custom' && (
        <div className="space-y-3">
          <select
            value={selectedDataSource ? dataSources.indexOf(selectedDataSource) : ''}
            onChange={(e) => {
              const idx = parseInt(e.target.value);
              if (!isNaN(idx)) {
                setSelectedDataSource(dataSources[idx]);
                setGeneratedData(null);
              }
            }}
            className="w-full p-2 border rounded"
          >
            {filteredDataSources.map((ds) => (
              <option key={dataSources.indexOf(ds)} value={dataSources.indexOf(ds)}>
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
  
  const ModelSelector = () => (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">2. Select Model</h3>
      
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value as ModelType)}
        className="w-full p-2 border rounded mb-4"
      >
        <option value="auto">Auto-detect</option>
        <option value="beta-binomial">Beta-Binomial</option>
        <option value="gamma">Gamma</option>
        <option value="lognormal">LogNormal</option>
        <option value="normal-mixture">Normal Mixture</option>
        <option value="lognormal-mixture">LogNormal Mixture</option>
        <option value="compound-beta-gamma">Compound (Beta × Gamma)</option>
        <option value="compound-beta-lognormal">Compound (Beta × LogNormal)</option>
        <option value="compound-beta-lognormalmixture">Compound (Beta × LogNormal Mixture)</option>
      </select>
      
      <button
        onClick={runInference}
        disabled={!generatedData && !customData.trim()}
        className={`w-full px-4 py-2 rounded ${
          !generatedData && !customData.trim()
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-purple-600 hover:bg-purple-700' // Zenith Data lilac
        } text-white font-semibold`}
      >
        Run Inference
      </button>
      
      {isAnalyzing && fitProgress && (
        <div className="mt-4">
          <div className="text-sm text-gray-600 mb-1">{fitProgress.stage}</div>
          <div className="bg-gray-200 rounded-full h-2">
            <div 
              className="bg-purple-600 h-2 rounded-full transition-all duration-300" // Zenith Data lilac
              style={{ width: `${fitProgress.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
  
  const ResultsDisplay = () => {
    if (!inferenceResult) return null;
    
    return (
      <div className="space-y-6">
        {/* Diagnostics */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Diagnostics</h3>
          <DiagnosticsPanel diagnostics={inferenceResult.diagnostics} />
        </div>
        
        {/* Posterior Summary */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Posterior Summary</h3>
          <PosteriorSummary 
            posterior={inferenceResult.posterior} 
            modelType={inferenceResult.diagnostics.modelType || selectedModel}
          />
        </div>
        
        {/* PPC Visualization */}
        <UnifiedPPCDisplay
          data={generatedData || parseCustomData()}
          posterior={inferenceResult.posterior}
          modelType={inferenceResult.diagnostics.modelType || selectedModel}
          showDiagnostics={showDiagnostics}
        />
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
            <ModelSelector />
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