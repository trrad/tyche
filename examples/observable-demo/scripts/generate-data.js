/**
 * Static data generation script for Observable demo
 *
 * This script uses Tyche to:
 * 1. Generate synthetic marketplace experiment data
 * 2. Run RevenueAnalyzer on the data
 * 3. Output static JSON files that Observable can load directly
 */

import * as Tyche from '../../../dist/tyche.js';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple RNG for reproducible synthetic data
class SimpleRNG {
  constructor(seed = 42) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  normal() {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Generate synthetic marketplace data for a variant
 */
function generateVariantData(params, n = 1000, seed = 42) {
  const rng = new SimpleRNG(seed);
  const users = [];

  for (let i = 0; i < n; i++) {
    const converted = rng.next() < params.conversionRate;
    let value = 0;

    if (converted) {
      // Lognormal distribution for AOV
      const normalSample = rng.normal();
      value = Math.exp(params.logMean + params.logStd * normalSample);
    }

    users.push({
      userId: `user_${i}`,
      value,
      converted
    });
  }

  return users;
}

/**
 * Serialize comparison results for JSON output
 */
function serializeComparison(comparison) {
  return {
    liftSamples: comparison.liftSamples,
    effectSamples: comparison.effectSamples,
    probabilityPositive: comparison.probabilityPositive,
    probabilityMeaningful: comparison.probabilityMeaningful,
    decomposition: comparison.decomposition,
    metadata: {
      variants: comparison.metadata.variants,
      threshold: comparison.metadata.threshold,
      sampleSize: comparison.metadata.sampleSize
    }
  };
}

/**
 * Main data generation function
 */
async function generateExperimentData() {
  console.log('Generating synthetic marketplace experiment data...');

  // Define experiment variants with different parameters
  const variantConfigs = {
    control: {
      name: 'control', // Must be 'control' for comparison to work
      displayName: 'Control',
      conversionRate: 0.05,
      logMean: Math.log(50),
      logStd: 0.5,
      seed: 42
    },
    treatment1: {
      name: 'New Checkout Flow',
      conversionRate: 0.055,
      logMean: Math.log(52),
      logStd: 0.48,
      seed: 43
    },
    treatment2: {
      name: 'Personalized Recommendations',
      conversionRate: 0.06,
      logMean: Math.log(48),
      logStd: 0.52,
      seed: 44
    },
    treatment3: {
      name: 'Combined (Checkout + Recs)',
      conversionRate: 0.065,
      logMean: Math.log(53),
      logStd: 0.47,
      seed: 45
    }
  };

  // Generate raw data for each variant
  console.log('Generating user-level data for each variant...');
  const rawData = {};
  for (const [key, config] of Object.entries(variantConfigs)) {
    rawData[key] = generateVariantData(config, 1000, config.seed);
  }

  // Create StandardData objects for Tyche
  console.log('Creating StandardData objects...');

  // Build treatments Map (all non-control variants)
  const treatments = new Map();
  for (const [key, users] of Object.entries(rawData)) {
    if (key !== 'control') {
      treatments.set(key, {
        name: variantConfigs[key].name,
        data: Tyche.StandardDataFactory.fromUserLevel(users)
      });
    }
  }

  // Create properly structured ExperimentData
  const experimentData = {
    id: 'marketplace-experiment-001',
    name: 'Marketplace Revenue Optimization',
    variants: {
      control: {
        name: variantConfigs.control.name,
        data: Tyche.StandardDataFactory.fromUserLevel(rawData.control)
      },
      treatments
    },
    metadata: {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      hypothesis: 'New checkout flow and personalized recommendations will increase revenue per user'
    }
  };

  // Run RevenueAnalyzer
  console.log('Running RevenueAnalyzer...');
  const analyzer = new Tyche.RevenueAnalyzer();
  const analysisResult = await analyzer.analyze(experimentData);

  // Get variant comparisons
  console.log('Computing variant comparisons...');
  const variantComparison = await analysisResult.compareVariants();

  // Serialize results
  const output = {
    variants: {},
    comparisons: {},
    metadata: {
      generatedAt: new Date().toISOString(),
      totalUsers: 1000 * Object.keys(variantConfigs).length,
      variantCount: Object.keys(variantConfigs).length
    }
  };

  // Add variant information
  for (const [key, config] of Object.entries(variantConfigs)) {
    const users = rawData[key];
    const convertedUsers = users.filter(u => u.converted);
    const totalRevenue = users.reduce((sum, u) => sum + u.value, 0);

    output.variants[config.name] = {
      displayName: config.displayName || config.name,
      totalUsers: users.length,
      convertedUsers: convertedUsers.length,
      conversionRate: convertedUsers.length / users.length,
      totalRevenue,
      averageRevenuePerUser: totalRevenue / users.length,
      averageOrderValue: convertedUsers.length > 0
        ? convertedUsers.reduce((sum, u) => sum + u.value, 0) / convertedUsers.length
        : 0
    };
  }

  // Add comparison results (variantComparison.comparisons is a Map)
  for (const [key, comparison] of variantComparison.comparisons.entries()) {
    output.comparisons[key] = serializeComparison(comparison);
  }

  return output;
}

/**
 * Main execution
 */
async function main() {
  try {
    const data = await generateExperimentData();

    // Ensure output directory exists
    const outputDir = join(__dirname, '..', 'src', 'data');
    mkdirSync(outputDir, { recursive: true });

    // Write output file
    const outputPath = join(outputDir, 'experiment-results.json');
    writeFileSync(outputPath, JSON.stringify(data, null, 2));

    console.log(`\n✓ Successfully generated experiment data`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Variants: ${Object.keys(data.variants).length}`);
    console.log(`  Comparisons: ${Object.keys(data.comparisons).length}`);

    // Also write a summary CSV for quick inspection
    const csvPath = join(outputDir, 'experiment-summary.csv');
    const csvLines = [
      'variant,name,totalUsers,convertedUsers,conversionRate,totalRevenue,averageRevenuePerUser,averageOrderValue'
    ];

    for (const [key, variant] of Object.entries(data.variants)) {
      csvLines.push([
        key,
        variant.name,
        variant.totalUsers,
        variant.convertedUsers,
        variant.conversionRate.toFixed(4),
        variant.totalRevenue.toFixed(2),
        variant.averageRevenuePerUser.toFixed(2),
        variant.averageOrderValue.toFixed(2)
      ].join(','));
    }

    writeFileSync(csvPath, csvLines.join('\n'));
    console.log(`  Summary CSV: ${csvPath}\n`);

  } catch (error) {
    console.error('Error generating data:', error);
    process.exit(1);
  }
}

main();
