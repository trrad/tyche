/**
 * Experiment data loader - multi-variant analysis
 *
 * Analyzes all 4 variants (control + 3 treatments) and returns
 * comparison results for each treatment vs control.
 */

import * as Tyche from '../dist/tyche.js';
import { generateMarketplace } from './marketplace.js';

// Data loader - outputs JSON to stdout
async function main() {
  const rawData = generateMarketplace();

  // Build ExperimentData with all variants
  const experimentData = {
    id: 'marketplace-test',
    name: 'Recommendation Algorithm Test',
    variants: {
      control: {
        name: 'control',
        data: Tyche.StandardDataFactory.fromUserLevel(
          rawData.control.users.map((u, i) => ({
            userId: `user_${i}`,
            value: u.value,
            converted: u.converted
          }))
        )
      },
      treatments: new Map([
        ['treatmentA', {
          name: 'treatmentA',
          data: Tyche.StandardDataFactory.fromUserLevel(
            rawData.treatmentA.users.map((u, i) => ({
              userId: `user_${i}`,
              value: u.value,
              converted: u.converted
            }))
          )
        }],
        ['treatmentB', {
          name: 'treatmentB',
          data: Tyche.StandardDataFactory.fromUserLevel(
            rawData.treatmentB.users.map((u, i) => ({
              userId: `user_${i}`,
              value: u.value,
              converted: u.converted
            }))
          )
        }],
        ['treatmentC', {
          name: 'treatmentC',
          data: Tyche.StandardDataFactory.fromUserLevel(
            rawData.treatmentC.users.map((u, i) => ({
              userId: `user_${i}`,
              value: u.value,
              converted: u.converted
            }))
          )
        }]
      ])
    },
    metadata: {
      startDate: new Date(),
      hypothesis: 'New algorithms improve revenue per user'
    }
  };

  // Run analyzer
  const analyzer = new Tyche.RevenueAnalyzer();
  const analysisResult = await analyzer.analyze(experimentData);

  // Get all comparisons (each treatment vs control)
  const variantComparison = await analysisResult.compareVariants();

  // Serialize for Observable (plain data only)
  const comparisons = {};
  for (const [name, comp] of variantComparison.comparisons) {
    comparisons[name] = {
      liftSamples: comp.liftSamples,
      effectSamples: comp.effectSamples,
      probabilityPositive: comp.probabilityPositive,
      probabilityMeaningful: comp.probabilityMeaningful,
      decomposition: comp.decomposition ? {
        combined: {
          frequencyContribution: comp.decomposition.combined.frequencyContribution,
          valueContribution: comp.decomposition.combined.valueContribution
        },
        components: {
          frequencyEffect: comp.decomposition.components.frequencyEffect,
          valueEffect: comp.decomposition.components.valueEffect
        }
      } : null,
      metadata: {
        baseline: comp.metadata.variants.baseline,
        treatment: comp.metadata.variants.treatment,
        sampleSizes: comp.metadata.sampleSizes
      }
    };
  }

  // Build serializable result
  const result = {
    variants: {
      control: {
        name: rawData.control.name,
        description: rawData.control.description
      },
      treatmentA: {
        name: rawData.treatmentA.name,
        description: rawData.treatmentA.description
      },
      treatmentB: {
        name: rawData.treatmentB.name,
        description: rawData.treatmentB.description
      },
      treatmentC: {
        name: rawData.treatmentC.name,
        description: rawData.treatmentC.description
      }
    },
    comparisons,
    winningVariant: variantComparison.winningVariant,
    primaryComparison: variantComparison.primaryComparison ? {
      treatmentName: variantComparison.primaryComparison.treatmentName,
      probabilityPositive: variantComparison.primaryComparison.result.probabilityPositive
    } : null,
    observedData: {
      control: rawData.control.users.map(u => u.value),
      treatmentA: rawData.treatmentA.users.map(u => u.value),
      treatmentB: rawData.treatmentB.users.map(u => u.value),
      treatmentC: rawData.treatmentC.users.map(u => u.value)
    },
    groundTruth: {
      control: rawData.control.groundTruth,
      treatmentA: rawData.treatmentA.groundTruth,
      treatmentB: rawData.treatmentB.groundTruth,
      treatmentC: rawData.treatmentC.groundTruth
    }
  };

  // Output JSON to stdout
  process.stdout.write(JSON.stringify(result, null, 2));
}

// Run the main function
main().catch(err => {
  console.error(err);
  process.exit(1);
});
