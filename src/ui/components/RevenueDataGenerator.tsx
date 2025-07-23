// components/RevenueDataGenerator.tsx
import React, { useState } from 'react';

interface GeneratorProps {
  onGenerate: (csv: string) => void;
}

interface VariantConfig {
  name: string;
  sampleSize: number;
  trueConversionRate: number;
  revenueDistribution: 'normal' | 'lognormal' | 'uniform' | 'mixed';
  revenueMean: number;
  revenueStd: number;
  outlierProbability: number;
  outlierMultiplier: number;
}

export const RevenueDataGenerator: React.FC<GeneratorProps> = ({ onGenerate }) => {
  const [variantConfigs, setVariantConfigs] = useState<VariantConfig[]>([
    {
      name: 'Control',
      sampleSize: 1000,
      trueConversionRate: 0.05,
      revenueDistribution: 'lognormal',
      revenueMean: 100,
      revenueStd: 30,
      outlierProbability: 0,
      outlierMultiplier: 10
    },
    {
      name: 'Treatment',
      sampleSize: 1000,
      trueConversionRate: 0.055,
      revenueDistribution: 'lognormal',
      revenueMean: 105,
      revenueStd: 35,
      outlierProbability: 0.01,
      outlierMultiplier: 20
    }
  ]);

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Random number generators
  const randn = () => {
    // Box-Muller transform for normal distribution
    const u = 1 - Math.random();
    const v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };

  const generateRevenue = (config: VariantConfig): number => {
    // Check if this is an outlier
    if (Math.random() < config.outlierProbability) {
      return config.revenueMean * config.outlierMultiplier;
    }

    switch (config.revenueDistribution) {
      case 'normal':
        return Math.max(0, config.revenueMean + randn() * config.revenueStd);
      
      case 'lognormal': {
        // Convert mean/std to lognormal parameters
        const variance = config.revenueStd * config.revenueStd;
        const meanLog = Math.log(config.revenueMean * config.revenueMean / 
          Math.sqrt(variance + config.revenueMean * config.revenueMean));
        const stdLog = Math.sqrt(Math.log(1 + variance / (config.revenueMean * config.revenueMean)));
        return Math.exp(meanLog + randn() * stdLog);
      }
      
      case 'uniform':
        const min = Math.max(0, config.revenueMean - config.revenueStd * Math.sqrt(3));
        const max = config.revenueMean + config.revenueStd * Math.sqrt(3);
        return min + Math.random() * (max - min);
      
      case 'mixed':
        // 80% small purchases, 20% large purchases
        if (Math.random() < 0.8) {
          return 20 + Math.random() * 40; // $20-60
        } else {
          return 100 + Math.random() * 200; // $100-300
        }
      
      default:
        return config.revenueMean;
    }
  };

  const generateData = () => {
    let csv = 'variant,converted,value\n';
    
    variantConfigs.forEach(config => {
      for (let i = 0; i < config.sampleSize; i++) {
        const converted = Math.random() < config.trueConversionRate;
        const value = converted ? generateRevenue(config) : 0;
        csv += `${config.name},${converted ? 1 : 0},${value.toFixed(2)}\n`;
      }
    });
    
    onGenerate(csv.trim());
  };

  const updateConfig = (index: number, field: keyof VariantConfig, value: any) => {
    const newConfigs = [...variantConfigs];
    newConfigs[index] = { ...newConfigs[index], [field]: value };
    setVariantConfigs(newConfigs);
  };

  const addVariant = () => {
    setVariantConfigs([...variantConfigs, {
      name: `Variant ${variantConfigs.length}`,
      sampleSize: 1000,
      trueConversionRate: 0.05,
      revenueDistribution: 'lognormal',
      revenueMean: 100,
      revenueStd: 30,
      outlierProbability: 0,
      outlierMultiplier: 10
    }]);
  };

  const removeVariant = (index: number) => {
    if (variantConfigs.length > 2) {
      setVariantConfigs(variantConfigs.filter((_, i) => i !== index));
    }
  };

  // Preset scenarios
  const applyPreset = (preset: string) => {
    switch (preset) {
      case 'small-effect':
        setVariantConfigs([
          {
            name: 'Control',
            sampleSize: 2000,
            trueConversionRate: 0.05,
            revenueDistribution: 'lognormal',
            revenueMean: 100,
            revenueStd: 30,
            outlierProbability: 0,
            outlierMultiplier: 10
          },
          {
            name: 'Treatment',
            sampleSize: 2000,
            trueConversionRate: 0.052,
            revenueDistribution: 'lognormal',
            revenueMean: 102,
            revenueStd: 30,
            outlierProbability: 0,
            outlierMultiplier: 10
          }
        ]);
        break;
      
      case 'outlier-heavy':
        setVariantConfigs([
          {
            name: 'Control',
            sampleSize: 500,
            trueConversionRate: 0.04,
            revenueDistribution: 'lognormal',
            revenueMean: 50,
            revenueStd: 20,
            outlierProbability: 0.02,
            outlierMultiplier: 50
          },
          {
            name: 'Treatment',
            sampleSize: 500,
            trueConversionRate: 0.045,
            revenueDistribution: 'lognormal',
            revenueMean: 55,
            revenueStd: 25,
            outlierProbability: 0.05,
            outlierMultiplier: 40
          }
        ]);
        break;
      
      case 'high-variance':
        setVariantConfigs([
          {
            name: 'Control',
            sampleSize: 1000,
            trueConversionRate: 0.03,
            revenueDistribution: 'lognormal',
            revenueMean: 200,
            revenueStd: 150,
            outlierProbability: 0,
            outlierMultiplier: 10
          },
          {
            name: 'Treatment',
            sampleSize: 1000,
            trueConversionRate: 0.035,
            revenueDistribution: 'lognormal',
            revenueMean: 220,
            revenueStd: 180,
            outlierProbability: 0,
            outlierMultiplier: 10
          }
        ]);
        break;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => applyPreset('small-effect')}
          className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
        >
          Small Effect Size
        </button>
        <button
          onClick={() => applyPreset('outlier-heavy')}
          className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
        >
          Outlier Heavy
        </button>
        <button
          onClick={() => applyPreset('high-variance')}
          className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200"
        >
          High Variance
        </button>
      </div>

      {variantConfigs.map((config, idx) => (
        <div key={idx} className="border rounded p-4 bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <input
              value={config.name}
              onChange={(e) => updateConfig(idx, 'name', e.target.value)}
              className="text-lg font-semibold bg-transparent border-b"
            />
            {variantConfigs.length > 2 && (
              <button
                onClick={() => removeVariant(idx)}
                className="text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sample Size
              </label>
              <input
                type="number"
                value={config.sampleSize}
                onChange={(e) => updateConfig(idx, 'sampleSize', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                True Conversion Rate
              </label>
              <input
                type="number"
                step="0.001"
                value={config.trueConversionRate}
                onChange={(e) => updateConfig(idx, 'trueConversionRate', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Revenue Mean ($)
              </label>
              <input
                type="number"
                value={config.revenueMean}
                onChange={(e) => updateConfig(idx, 'revenueMean', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Revenue Std Dev ($)
              </label>
              <input
                type="number"
                value={config.revenueStd}
                onChange={(e) => updateConfig(idx, 'revenueStd', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Distribution Type
                </label>
                <select
                  value={config.revenueDistribution}
                  onChange={(e) => updateConfig(idx, 'revenueDistribution', e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="normal">Normal</option>
                  <option value="lognormal">Log-normal</option>
                  <option value="uniform">Uniform</option>
                  <option value="mixed">Mixed (bimodal)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Outlier Probability
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={config.outlierProbability}
                  onChange={(e) => updateConfig(idx, 'outlierProbability', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Outlier Multiplier
                </label>
                <input
                  type="number"
                  value={config.outlierMultiplier}
                  onChange={(e) => updateConfig(idx, 'outlierMultiplier', parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-4">
        <button
          onClick={addVariant}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Add Variant
        </button>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced
        </button>
        <button
          onClick={generateData}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Generate Data
        </button>
      </div>
    </div>
  );
};