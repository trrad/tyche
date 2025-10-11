/**
 * Multi-variant marketplace data generator
 *
 * Scenario: E-commerce marketplace testing 3 recommendation algorithms
 * - Compound model: conversion_rate × revenue_per_converter
 * - Mixture in severity: k=2 (budget sellers ~$25, premium sellers ~$95)
 * - 4 variants: control + 3 treatments
 */

// Simple seeded random number generator
class SimpleRNG {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  gamma(shape, scale) {
    // Simple gamma approximation using normal approximation for large shape
    if (shape > 1) {
      const mean = shape * scale;
      const stdDev = Math.sqrt(shape) * scale;
      return Math.max(0.01, mean + stdDev * (this.next() - 0.5) * 2);
    }
    return scale * Math.pow(-Math.log(this.next()), 1/shape);
  }

  beta(a, b) {
    const x = this.gamma(a, 1);
    const y = this.gamma(b, 1);
    return x / (x + y);
  }
}

export function generateMarketplace(seed = 42) {
  const rng = new SimpleRNG(seed);

  // Define variant parameters
  // Each has different conversion × different value mix
  const variants = {
    control: {
      name: 'Control',
      description: 'Current algorithm',
      conversionRate: 0.08,
      mixtureProportion: 0.35,  // 35% budget sellers
      budgetLogMean: 3.2,        // ~$24.53
      premiumLogMean: 4.55,      // ~$94.63
    },
    treatmentA: {
      name: 'Collaborative Filtering',
      description: 'User-based recommendations',
      conversionRate: 0.10,      // Higher conversion
      mixtureProportion: 0.35,   // Same seller mix
      budgetLogMean: 3.2,
      premiumLogMean: 4.55,
    },
    treatmentB: {
      name: 'Content-Based',
      description: 'Item similarity recommendations',
      conversionRate: 0.085,     // Slightly higher conversion
      mixtureProportion: 0.25,   // More premium sellers!
      budgetLogMean: 3.2,
      premiumLogMean: 4.65,      // Higher premium value (~$104)
    },
    treatmentC: {
      name: 'Hybrid',
      description: 'Combined approach',
      conversionRate: 0.095,     // Balanced improvement
      mixtureProportion: 0.30,   // Moderate shift to premium
      budgetLogMean: 3.2,
      premiumLogMean: 4.60,      // Moderate premium increase (~$99)
    }
  };

  const data = {};

  for (const [key, params] of Object.entries(variants)) {
    // Generate compound data: conversion events × revenue per converter
    const n = 5000;
    const users = [];

    for (let i = 0; i < n; i++) {
      const converted = rng.next() < params.conversionRate;
      let value = 0;

      if (converted) {
        // Mixture: choose component based on mixture proportion
        const useBudget = rng.next() < params.mixtureProportion;
        const logMean = useBudget ? params.budgetLogMean : params.premiumLogMean;
        const logStd = 0.3;

        // Generate lognormal value using Box-Muller for normal sample
        const u1 = rng.next();
        const u2 = rng.next();
        const normalSample = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        value = Math.exp(logMean + logStd * normalSample);
      }

      users.push({ value, converted });
    }

    data[key] = {
      users,
      name: params.name,
      description: params.description,
      groundTruth: {
        conversionRate: params.conversionRate,
        mixtureProportion: params.mixtureProportion,
        budgetMean: Math.exp(params.budgetLogMean),
        premiumMean: Math.exp(params.premiumLogMean)
      }
    };
  }

  return data;
}
