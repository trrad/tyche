// Generate example CSV datasets for the experiment analyzer
// Run with: node generate-examples.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Utility: Generate lognormal revenue values
function generateLognormalRevenue(median, cv, n) {
  const logMean = Math.log(median);
  const logStd = Math.sqrt(Math.log(1 + cv * cv));

  return Array.from({ length: n }, () => {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.exp(logMean + z * logStd);
  });
}

// Utility: Generate user-level data for a variant
function generateVariantData(variantName, nUsers, conversionRate, medianRevenue, revenueCV) {
  const users = [];

  // Generate revenue values for all potential conversions (we'll zero out non-converters)
  const revenueValues = generateLognormalRevenue(medianRevenue, revenueCV, nUsers);

  for (let i = 0; i < nUsers; i++) {
    const converted = Math.random() < conversionRate;
    const revenue = converted ? revenueValues[i] : 0;

    users.push({
      variant: variantName,
      converted: converted ? 1 : 0,
      revenue: revenue.toFixed(2)
    });
  }

  return users;
}

// Utility: Write CSV file
function writeCSV(filename, data) {
  const header = 'variant,converted,revenue\n';
  const rows = data.map(row => `${row.variant},${row.converted},${row.revenue}`).join('\n');
  const filepath = path.join(__dirname, 'data', filename);
  fs.writeFileSync(filepath, header + rows);
  console.log(`✓ Generated ${filename} (${data.length} rows)`);
}

// Example 1: Small Lift (5%)
// Subtle revenue improvement - requires careful analysis
function generateSmallLift() {
  const data = [
    ...generateVariantData('control', 8000, 0.10, 50, 0.5),
    ...generateVariantData('treatment', 8000, 0.102, 52.5, 0.5) // ~5% lift
  ];
  writeCSV('small-lift.csv', data);
}

// Example 2: Medium Lift (15%)
// Clear revenue improvement - easy to detect
function generateMediumLift() {
  const data = [
    ...generateVariantData('control', 8000, 0.10, 50, 0.5),
    ...generateVariantData('treatment', 8000, 0.105, 57.5, 0.5) // ~15% lift
  ];
  writeCSV('medium-lift.csv', data);
}

// Example 3: Multi-Variant Test
// 3 treatments with varying effects
function generateMultiVariant() {
  const data = [
    ...generateVariantData('control', 6000, 0.10, 50, 0.5),
    ...generateVariantData('treatment_a', 6000, 0.102, 52.5, 0.5), // 5% lift
    ...generateVariantData('treatment_b', 6000, 0.105, 57.5, 0.5), // 15% lift
    ...generateVariantData('treatment_c', 6000, 0.108, 60, 0.5)    // 20% lift
  ];
  writeCSV('multi-variant.csv', data);
}

// Example 4: Low Conversion
// 2% conversion rate - needs larger sample
function generateLowConversion() {
  const data = [
    ...generateVariantData('control', 15000, 0.02, 100, 0.6),
    ...generateVariantData('treatment', 15000, 0.024, 110, 0.6) // 10% lift
  ];
  writeCSV('low-conversion.csv', data);
}

// Generate all examples
console.log('Generating example datasets...\n');
generateSmallLift();
generateMediumLift();
generateMultiVariant();
generateLowConversion();
console.log('\n✓ All examples generated successfully!');
