/**
 * Data Loading Utilities
 *
 * Centralized data loading for the experiment analysis app.
 * Supports example data generation and CSV upload.
 */

import { generateMarketplace } from '../lib/generate-data.js';
import * as Tyche from '../dist/tyche.js';

/**
 * Load experiment data from various sources
 * Priority: localStorage > URL params > default example
 */
export function loadExperimentData() {
  // Check localStorage first (set by data loader page)
  const stored = localStorage.getItem('tycheExperimentData');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn('Failed to parse stored data, using default');
      localStorage.removeItem('tycheExperimentData');
    }
  }

  // Check URL params
  const params = new URLSearchParams(window.location.search);
  const scenario = params.get('scenario');

  if (scenario) {
    return generateExampleData(scenario);
  }

  // Default: marketplace scenario
  return generateExampleData('marketplace');
}

/**
 * Save experiment data to localStorage
 */
export function saveExperimentData(data) {
  localStorage.setItem('tycheExperimentData', JSON.stringify(data));
}

/**
 * Clear stored experiment data
 */
export function clearExperimentData() {
  localStorage.removeItem('tycheExperimentData');
}

/**
 * Generate example data for different scenarios
 */
export function generateExampleData(scenario = 'marketplace', options = {}) {
  const defaults = {
    seed: 42,
    usersPerVariant: 1000,
  };

  const config = { ...defaults, ...options };

  switch (scenario) {
    case 'marketplace':
      return formatMarketplaceData(generateMarketplace(config));

    case 'saas':
      // Could add SaaS-specific generator
      return formatMarketplaceData(generateMarketplace({
        ...config,
        conversionRates: { control: 0.15, treatment_a: 0.18, treatment_b: 0.17 }
      }));

    case 'ecommerce':
      return formatMarketplaceData(generateMarketplace(config));

    default:
      return formatMarketplaceData(generateMarketplace(config));
  }
}

/**
 * Format raw marketplace data into Tyche ExperimentData structure
 */
function formatMarketplaceData(rawData) {
  const treatments = new Map();

  for (const [key, variantData] of Object.entries(rawData)) {
    if (key !== 'control') {
      treatments.set(variantData.name, {
        name: variantData.name,
        data: Tyche.StandardDataFactory.fromUserLevel(variantData.users),
      });
    }
  }

  return {
    id: `experiment-${Date.now()}`,
    name: 'Marketplace Revenue Optimization',
    variants: {
      control: {
        name: rawData.control.name,
        data: Tyche.StandardDataFactory.fromUserLevel(rawData.control.users),
      },
      treatments,
    },
    metadata: {
      startDate: new Date().toISOString(),
      scenario: 'marketplace',
      generated: true,
    },
    // Keep raw data for summary cards
    _raw: rawData,
  };
}

/**
 * Parse CSV file and convert to ExperimentData structure
 *
 * Expected CSV format:
 * user_id,variant,converted,revenue
 * user_1,control,true,25.50
 * user_2,treatment_a,false,0
 * ...
 */
export async function parseCSVFile(file) {
  const text = await file.text();
  return parseCSVText(text);
}

/**
 * Parse CSV text content
 */
export function parseCSVText(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  // Validate required columns
  const required = ['user_id', 'variant', 'converted', 'revenue'];
  const missing = required.filter(col => !headers.includes(col));

  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }

  // Parse rows
  const rows = lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i]?.trim();
    });
    return row;
  });

  // Group by variant
  const variantGroups = {};
  rows.forEach(row => {
    const variant = row.variant;
    if (!variantGroups[variant]) {
      variantGroups[variant] = [];
    }

    variantGroups[variant].push({
      userId: row.user_id,
      converted: row.converted === 'true' || row.converted === '1',
      value: parseFloat(row.revenue) || 0,
    });
  });

  // Convert to Tyche format
  const variantNames = Object.keys(variantGroups);
  const controlName = variantNames.find(v => v.toLowerCase().includes('control')) || variantNames[0];

  const treatments = new Map();
  variantNames.forEach(name => {
    const data = Tyche.StandardDataFactory.fromUserLevel(variantGroups[name]);

    if (name === controlName) {
      // Skip, will add separately
    } else {
      treatments.set(name, { name, data });
    }
  });

  return {
    id: `experiment-csv-${Date.now()}`,
    name: 'Uploaded Experiment',
    variants: {
      control: {
        name: controlName,
        data: Tyche.StandardDataFactory.fromUserLevel(variantGroups[controlName]),
      },
      treatments,
    },
    metadata: {
      uploadDate: new Date().toISOString(),
      source: 'csv',
      totalRows: rows.length,
      variantCount: variantNames.length,
    },
    // Store raw for summary
    _raw: variantGroups,
  };
}

/**
 * Validate experiment data structure
 */
export function validateExperimentData(data) {
  const errors = [];
  const warnings = [];

  if (!data.variants || !data.variants.control) {
    errors.push('Missing control variant');
  }

  if (!data.variants.treatments || data.variants.treatments.size === 0) {
    errors.push('No treatment variants found');
  }

  // Check sample sizes
  const allVariants = [data.variants.control, ...data.variants.treatments.values()];
  allVariants.forEach(variant => {
    const sampleSize = variant.data?.conversions?.length || 0;

    if (sampleSize < 100) {
      warnings.push(`${variant.name}: Small sample size (${sampleSize} < 100)`);
    }

    if (sampleSize < 20) {
      errors.push(`${variant.name}: Insufficient data (${sampleSize} < 20)`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get summary statistics from raw experiment data
 */
export function getDataSummary(experimentData) {
  const summary = {
    variants: {},
    totalUsers: 0,
  };

  if (experimentData._raw) {
    // From generated data
    Object.entries(experimentData._raw).forEach(([key, variantData]) => {
      const users = variantData.users;
      const convertedUsers = users.filter(u => u.converted);
      const totalRevenue = users.reduce((sum, u) => sum + u.value, 0);

      summary.variants[variantData.name] = {
        displayName: variantData.displayName || variantData.name,
        totalUsers: users.length,
        convertedUsers: convertedUsers.length,
        conversionRate: convertedUsers.length / users.length,
        totalRevenue,
        averageRevenuePerUser: totalRevenue / users.length,
        averageOrderValue:
          convertedUsers.length > 0
            ? convertedUsers.reduce((sum, u) => sum + u.value, 0) / convertedUsers.length
            : 0,
      };

      summary.totalUsers += users.length;
    });
  } else {
    // From CSV upload - compute from Tyche data
    const processVariant = (variant, name) => {
      const conversions = variant.data.conversions || [];
      const revenues = variant.data.revenues || [];
      const totalUsers = conversions.length;
      const convertedUsers = conversions.filter(c => c).length;
      const totalRevenue = revenues.reduce((sum, r) => sum + r, 0);

      summary.variants[name] = {
        displayName: name,
        totalUsers,
        convertedUsers,
        conversionRate: convertedUsers / totalUsers,
        totalRevenue,
        averageRevenuePerUser: totalRevenue / totalUsers,
        averageOrderValue: convertedUsers > 0 ? totalRevenue / convertedUsers : 0,
      };

      summary.totalUsers += totalUsers;
    };

    processVariant(experimentData.variants.control, experimentData.variants.control.name);
    experimentData.variants.treatments.forEach((variant, name) => {
      processVariant(variant, name);
    });
  }

  return summary;
}
