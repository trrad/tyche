import React, { useState, useEffect, useRef } from 'react';
import { DataGenerator, GeneratedDataset } from '../../tests/utilities/synthetic/DataGenerator';

interface CustomDataEditorProps {
  onDataGenerated: (data: any, dataset?: GeneratedDataset) => void;
  onError: (error: string) => void;
  seed?: number;
  initialCode?: string; // For auto-filling from selected scenario
}

export const CustomDataEditor: React.FC<CustomDataEditorProps> = ({ 
  onDataGenerated, 
  onError, 
  seed,
  initialCode 
}) => {
  const [code, setCode] = useState(initialCode || `// Generate clean conversion rate data
return DataGenerator.scenarios.betaBinomial.clean(0.05, 1000, seed);`);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Update code when initialCode changes (from UI selection)
  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
    }
  }, [initialCode]);

  // Example templates
  const examples = [
    {
      name: 'Simple Conversion',
      code: `// Clean conversion rate data
return DataGenerator.scenarios.betaBinomial.clean(0.05, 1000, seed);`
    },
    {
      name: 'Noisy Revenue',
      code: `// Revenue with outliers
return DataGenerator.scenarios.revenue.noisy(3.5, 0.5, 1000, seed);`
    },
    {
      name: 'Custom Mixture',
      code: `// Create a 3-component mixture
const gen = new DataGenerator(seed);
return gen.mixture([
  { distribution: 'lognormal', params: [2.5, 0.3], weight: 0.5 },
  { distribution: 'lognormal', params: [3.8, 0.2], weight: 0.35 },
  { distribution: 'lognormal', params: [5.0, 0.4], weight: 0.15 }
], 1000);`
    },
    {
      name: 'Custom Noise',
      code: `// Generate base data and apply custom noise
const gen = new DataGenerator(seed);
const baseData = gen.generateFromDistribution('gamma', [2, 50], 1000);

// Apply value-dependent noise
const noisyData = baseData.map(value => {
  const noiseFactor = Math.min(value / 100, 0.3);
  const noise = gen.generator.generateFromDistribution(
    'normal', [0, value * noiseFactor], 1
  )[0];
  return Math.max(0, value + noise);
});

return {
  data: noisyData,
  groundTruth: {
    type: 'gamma',
    parameters: { shape: 2, scale: 50 },
    customNoise: 'value-dependent'
  },
  metadata: {
    sampleSize: 1000,
    seed: seed,
    generatedAt: new Date()
  }
};`
    }
  ];

  const runCode = () => {
    setIsGenerating(true);
    onError('');
    
    try {
      // Create a function with DataGenerator and seed in scope
      const func = new Function('DataGenerator', 'seed', code);
      const result = func(DataGenerator, seed || Date.now());
      
      if (!result || typeof result !== 'object') {
        throw new Error('Code must return a data object or GeneratedDataset');
      }
      
      // Check if it's a GeneratedDataset
      if ('data' in result && 'groundTruth' in result && 'metadata' in result) {
        onDataGenerated(result.data, result);
      } else {
        // Just data
        onDataGenerated(result, undefined);
      }
    } catch (err: any) {
      onError(err.message || 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto';
      editorRef.current.style.height = editorRef.current.scrollHeight + 'px';
    }
  }, [code]);

  return (
    <div className="space-y-4">
      {/* Quick Examples */}
      <div className="flex gap-2 flex-wrap">
        {examples.map((ex, idx) => (
          <button
            key={idx}
            onClick={() => setCode(ex.code)}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            {ex.name}
          </button>
        ))}
      </div>

      {/* Code Editor */}
      <div className="relative">
        <div className="absolute top-2 right-2 text-xs text-gray-500 font-mono">
          seed: {seed || 'random'}
        </div>
        <textarea
          ref={editorRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full p-4 font-mono text-sm bg-gray-900 text-gray-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
          style={{ minHeight: '200px' }}
          spellCheck={false}
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
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            isGenerating || !code.trim()
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          }`}
        >
          {isGenerating ? 'Generating...' : 'Generate Data'}
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