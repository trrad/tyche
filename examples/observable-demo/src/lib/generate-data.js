/**
 * Shared data generation utilities for Tyche Observable demo
 *
 * Provides synthetic marketplace experiment data generation
 * that can be used across multiple pages (load-data, explore-results, etc.)
 */

/**
 * Simple seedable random number generator
 * Using Linear Congruential Generator (LCG) for reproducibility
 */
export class SimpleRNG {
  constructor(seed = 42) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  /**
   * Generate normal (Gaussian) random value using Box-Muller transform
   */
  normal() {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

/**
 * Generate synthetic marketplace experiment data
 *
 * @param {Object} config - Configuration object
 * @param {number} config.seed - Random seed for reproducibility
 * @param {number} config.usersPerVariant - Number of users per variant
 * @returns {Object} Raw experiment data with control and treatment variants
 */
export function generateMarketplace({
  seed = 42,
  usersPerVariant = 1000
} = {}) {

  // Define variant configurations
  const variantConfigs = {
    control: {
      name: 'control',
      displayName: 'Control',
      conversionRate: 0.05,
      logMean: Math.log(50),
      logStd: 0.5,
      seed: seed
    },
    treatment1: {
      name: 'New Checkout Flow',
      displayName: 'New Checkout Flow',
      conversionRate: 0.055,
      logMean: Math.log(52),
      logStd: 0.48,
      seed: seed + 1
    },
    treatment2: {
      name: 'Personalized Recommendations',
      displayName: 'Personalized Recommendations',
      conversionRate: 0.06,
      logMean: Math.log(48),
      logStd: 0.52,
      seed: seed + 2
    },
    treatment3: {
      name: 'Combined (Checkout + Recs)',
      displayName: 'Combined (Checkout + Recs)',
      conversionRate: 0.065,
      logMean: Math.log(53),
      logStd: 0.47,
      seed: seed + 3
    }
  };

  const rawData = {};

  // Generate user-level data for each variant
  for (const [key, config] of Object.entries(variantConfigs)) {
    const rng = new SimpleRNG(config.seed);
    const users = [];

    for (let i = 0; i < usersPerVariant; i++) {
      const converted = rng.next() < config.conversionRate;
      let value = 0;

      if (converted) {
        // Lognormal distribution for AOV (revenue per converter)
        const normalSample = rng.normal();
        value = Math.exp(config.logMean + config.logStd * normalSample);
      }

      users.push({
        userId: `${key}_user_${i}`,
        value,
        converted
      });
    }

    rawData[key] = {
      name: config.name,
      displayName: config.displayName,
      users
    };
  }

  return rawData;
}
