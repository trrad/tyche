import React, { useState, useCallback } from 'react';
import { DataGenerator } from '../../tests/utilities/synthetic/DataGenerator';

interface SimpleCustomCodeEditorProps {
  onDataGenerated: (data: any) => void;
  onError: (error: string) => void;
  // Optional: for the "copy from synthetic" feature
  syntheticCode?: string;
  syntheticName?: string;
}

export const SimpleCustomCodeEditor: React.FC<SimpleCustomCodeEditorProps> = ({ 
  onDataGenerated, 
  onError,
  syntheticCode,
  syntheticName
}) => {
  // Single source of truth: the code in the editor
  // Use localStorage to persist code across component re-mounts
  const [code, setCode] = useState(() => {
    const saved = localStorage.getItem('tyche-custom-code');
    return saved || '';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Save code to localStorage whenever it changes
  React.useEffect(() => {
    if (code.trim()) {
      localStorage.setItem('tyche-custom-code', code);
    }
  }, [code]);
  
  // Copy synthetic code when button is clicked
  const copySyntheticCode = useCallback(() => {
    if (!syntheticCode) {
      onError('No synthetic scenario selected');
      return;
    }
    setCode(syntheticCode);
    onError(''); // Clear any errors
    // Also save to localStorage immediately
    localStorage.setItem('tyche-custom-code', syntheticCode);
  }, [syntheticCode, onError]);

  // Run the code and generate data
  const generateData = useCallback(() => {
    if (!code.trim()) {
      onError('Please enter some code');
      return;
    }
    
    setIsGenerating(true);
    onError('');
    
    try {
      // Create function with DataGenerator in scope
      const func = new Function('DataGenerator', 'seed', code);
      const result = func(DataGenerator, Date.now());
      
      if (!result) {
        throw new Error('Code must return data');
      }
      
      // Extract data from result (handle both raw data and GeneratedDataset format)
      const data = result.data || result;
      onDataGenerated(data);
      
    } catch (err: any) {
      onError(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  }, [code, onDataGenerated, onError]);

  return (
    <div className="space-y-4">
      {/* Header with copy button */}
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-700">Custom Data Generator</h4>
        {syntheticCode && (
          <button
            onClick={copySyntheticCode}
            className="px-3 py-1 text-sm rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors"
            title={`Copy code from ${syntheticName || 'synthetic scenario'}`}
          >
            Copy from {syntheticName || 'Synthetic'}
          </button>
        )}
      </div>

      {/* Code editor */}
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="w-full p-4 font-mono text-sm bg-gray-900 text-gray-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
        rows={8}
        placeholder={`// Example:
return DataGenerator.presets.betaBinomial(0.05, 1000, seed);

// Or custom:
const gen = new DataGenerator(seed);
return gen.continuous('normal', { mean: 100, std: 30 }, 1000);`}
        spellCheck={false}
      />

      {/* Generate button */}
      <button
        onClick={generateData}
        disabled={isGenerating || !code.trim()}
        className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
          isGenerating || !code.trim()
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-purple-600 hover:bg-purple-700 text-white'
        }`}
      >
        {isGenerating ? 'Generating...' : 'Generate Data'}
      </button>
    </div>
  );
}; 