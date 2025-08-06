// examples/ab-test-demo.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { useState, useMemo } from 'react';
import { BetaDistribution } from '../src/core/distributions/BetaDistribution';
import './index.css';

interface Variant {
  name: string;
  visitors: number;
  conversions: number;
}

function ABTestDemo() {
  const [variants, setVariants] = useState<Variant[]>([
    { name: 'Control', visitors: 1000, conversions: 45 },
    { name: 'Treatment', visitors: 1000, conversions: 58 },
  ]);

  const [credibleLevel, setCredibleLevel] = useState(0.95);
  const numSamples = 5000;

  // Generate posterior samples
  const posteriorSamples = useMemo(() => {
    const samples = new Map<string, number[]>();

    variants.forEach((variant) => {
      const posterior = new BetaDistribution(
        1 + variant.conversions,
        1 + variant.visitors - variant.conversions
      );
      samples.set(variant.name, posterior.sample(numSamples) as number[]);
    });

    return samples;
  }, [variants]);

  // Calculate statistics
  const getStats = (samples: number[]) => {
    const sorted = [...samples].sort((a, b) => a - b);
    const alpha = (1 - credibleLevel) / 2;
    const lowerIdx = Math.floor(alpha * samples.length);
    const upperIdx = Math.floor((1 - alpha) * samples.length);

    return {
      mean: samples.reduce((a, b) => a + b) / samples.length,
      lower: sorted[lowerIdx],
      upper: sorted[upperIdx],
    };
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Bayesian A/B Test Analysis</h1>

      {/* Variant Inputs */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Experiment Data</h2>
        <div className="space-y-2">
          {variants.map((variant, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-4">
              <input
                value={variant.name}
                onChange={(e) => {
                  const newVariants = [...variants];
                  newVariants[idx].name = e.target.value;
                  setVariants(newVariants);
                }}
                className="px-3 py-2 border rounded"
                placeholder="Variant name"
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
      </div>

      {/* Results */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Results</h2>
        <div className="space-y-4">
          {variants.map((variant) => {
            const samples = posteriorSamples.get(variant.name)!;
            const stats = getStats(samples);
            const observed = variant.conversions / variant.visitors;

            return (
              <div key={variant.name} className="border-b pb-4 last:border-0">
                <h3 className="font-semibold">{variant.name}</h3>
                <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                  <div>
                    <span className="text-gray-600">Observed:</span>
                    <span className="ml-2">{formatPercent(observed)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Posterior Mean:</span>
                    <span className="ml-2">{formatPercent(stats.mean)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">{formatPercent(credibleLevel)} CI:</span>
                    <span className="ml-2">
                      [{formatPercent(stats.lower)}, {formatPercent(stats.upper)}]
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Uplift Analysis */}
      {variants.length === 2 && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="font-semibold mb-2">Relative Uplift</h3>
          {(() => {
            const control = posteriorSamples.get(variants[0].name)!;
            const treatment = posteriorSamples.get(variants[1].name)!;

            const upliftSamples = treatment.map((t, i) =>
              control[i] > 0 ? (t - control[i]) / control[i] : 0
            );

            const upliftStats = getStats(upliftSamples);
            const probPositive = upliftSamples.filter((x) => x > 0).length / upliftSamples.length;

            return (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Mean Uplift:</span>
                  <span className="ml-2 font-semibold">{formatPercent(upliftStats.mean)}</span>
                </div>
                <div>
                  <span className="text-gray-600">P(Improvement):</span>
                  <span className="ml-2 font-semibold text-green-600">
                    {formatPercent(probPositive)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600">{formatPercent(credibleLevel)} CI:</span>
                  <span className="ml-2 font-semibold">
                    [{formatPercent(upliftStats.lower)}, {formatPercent(upliftStats.upper)}]
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<ABTestDemo />);

export default ABTestDemo;
