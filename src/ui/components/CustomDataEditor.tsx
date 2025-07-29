import React, { useState, useCallback } from 'react';
import { DataGenerator, GeneratedDataset } from '../../tests/utilities/synthetic/DataGenerator';

interface CustomDataEditorProps {
  onDataGenerated: (data: any, dataset?: GeneratedDataset) => void;
  onError: (error: string) => void;
  // Minimal props - only what's absolutely needed
  scenarioName?: string;
  getScenarioCode?: (noiseLevel: any) => string;
  sampleSize?: number;
  noiseLevel?: string;
}

export const CustomDataEditor: React.FC<CustomDataEditorProps> = ({ 
  onDataGenerated, 
  onError, 
  scenarioName,
  getScenarioCode,
  sampleSize,
  noiseLevel = 'realistic'
}) => {
  const [code, setCode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedData, setGeneratedData] = useState<any>(null);

  const copyFromScenario = useCallback(() => {
    if (!getScenarioCode) {
      onError('No scenario selected in Synthetic Data tab');
      return;
    }
    
    let scenarioCode = getScenarioCode(noiseLevel);
    
    if (sampleSize) {
      scenarioCode = scenarioCode.replace(/\b1000\b/g, sampleSize.toString());
      scenarioCode = scenarioCode.replace(/\b2000\b/g, sampleSize.toString());
    }
    
    setCode(scenarioCode);
    onError('');
  }, [getScenarioCode, noiseLevel, sampleSize, onError]);

  const runCode = useCallback(() => {
    if (!code.trim()) {
      onError('Please enter some code to run');
      return;
    }
    
    setIsGenerating(true);
    onError('');
    
    try {
      const func = new Function('DataGenerator', 'seed', code);
      const result = func(DataGenerator, Date.now());
      
      if (!result || typeof result !== 'object') {
        throw new Error('Code must return a data object or GeneratedDataset');
      }
      
      if ('data' in result && 'groundTruth' in result && 'metadata' in result) {
        setGeneratedData(result.data);
        onDataGenerated(result.data, result);
      } else {
        setGeneratedData(result);
        onDataGenerated(result, undefined);
      }
    } catch (err: any) {
      onError(err.message || 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  }, [code, onDataGenerated, onError]);

  const exportToCSV = useCallback(() => {
    if (!generatedData) {
      onError('No data to export');
      return;
    }
    
    let csvContent = '';
    const data = generatedData;
    
    if (Array.isArray(data) && typeof data[0] === 'number') {
      csvContent = 'value\n' + data.join('\n');
    } else if (data.successes !== undefined && data.trials !== undefined) {
      csvContent = `successes,trials\n${data.successes},${data.trials}`;
    } else if (Array.isArray(data) && data[0]?.converted !== undefined) {
      csvContent = 'converted,value\n';
      csvContent += data.map((u: any) => `${u.converted ? 1 : 0},${u.value}`).join('\n');
    } else {
      onError('Unknown data format for CSV export');
      return;
    }
    
    navigator.clipboard.writeText(csvContent);
  }, [generatedData, onError]);

  return (
    <div className="space-y-4">
      {/* Copy button */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={copyFromScenario}
          disabled={!getScenarioCode}
          className={`px-3 py-1 text-sm rounded-full transition-colors flex items-center gap-1 ${
            getScenarioCode
              ? 'bg-purple-100 hover:bg-purple-200 text-purple-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title={getScenarioCode ? 
            `Copy code from: ${scenarioName || 'selected scenario'}` : 
            'Select a scenario in Synthetic Data tab first'
          }
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          Copy from Synthetic
        </button>
      </div>

      {/* Show what will be copied */}
      {scenarioName && (
        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
          Will copy: <span className="font-medium">{scenarioName}</span>
          {sampleSize && ` (${sampleSize} samples)`}
          {` with ${noiseLevel} noise`}
        </div>
      )}

      {/* Code Editor */}
      <div className="relative">
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <button
            onClick={exportToCSV}
            disabled={!generatedData}
            className={`p-1 rounded transition-colors ${
              !generatedData
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Copy data as CSV"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <div className="text-xs text-gray-500 font-mono">
            seed: random
          </div>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full p-4 font-mono text-sm bg-gray-900 text-gray-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          style={{ minHeight: '200px' }}
          spellCheck={false}
          placeholder="// Enter your data generation code here..."
        />
      </div>

      {/* Run Button */}
      <div className="flex justify-between items-center">
        <a
          href="../../tests/utilities/synthetic/Readme.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-purple-600 hover:text-purple-700 underline"
        >
          📖 DataGenerator Documentation
        </a>
        
        <button
          onClick={runCode}
          disabled={isGenerating || !code.trim()}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
            isGenerating || !code.trim()
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
          }`}
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Generate Data
            </>
          )}
        </button>
      </div>

      {/* API Quick Reference */}
      <details className="text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
        <summary className="cursor-pointer font-medium text-gray-700">Quick Reference</summary>
        <pre className="mt-2 font-mono whitespace-pre-wrap">
{`// Scenarios with noise levels
DataGenerator.scenarios.betaBinomial.[clean|realistic|noisy](p, n, seed)
DataGenerator.scenarios.revenue.[clean|realistic|noisy](logMean, logStd, n, seed)
DataGenerator.scenarios.segments.[clean|realistic|noisy](n, seed)
DataGenerator.scenarios.ecommerce.[clean|realistic|noisy](n, seed)

// Custom generation
new DataGenerator(seed).mixture(components, n)
new DataGenerator(seed).generateFromDistribution(type, params, n)
new DataGenerator(seed).applyNoiseLevel(data, 'clean'|'realistic'|'noisy')`}
        </pre>
      </details>
    </div>
  );
}; 