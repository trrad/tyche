// src/tests/synthetic/BusinessScenarios.ts
import { SyntheticDataGenerator } from './DataGenerator';
import jStat from 'jstat';


export interface UserData {
  converted: boolean;
  value: number;
  metadata?: Record<string, any>;
}

export interface BusinessExperimentData {
  control: UserData[];
  treatment: UserData[];
  metadata: {
    trueConversionLift: number;
    trueRevenueLift: number;
    sampleSize: number;
  };
}

export class BusinessScenarios {
  private generator: SyntheticDataGenerator;

  constructor(seed?: number) {
    this.generator = new SyntheticDataGenerator(seed);
  }

  /**
   * E-commerce scenario with compound effects
   */
  ecommerce(config: {
    baseConversionRate: number;
    conversionLift: number;
    revenueDistribution: 'gamma' | 'lognormal';
    revenueParams: { mean: number; variance: number };
    revenueLift: number;
    sampleSize: number;
  }): BusinessExperimentData {
    const controlUsers: UserData[] = [];
    const treatmentUsers: UserData[] = [];

    // Control group
    for (let i = 0; i < config.sampleSize / 2; i++) {
      const converted = Math.random() < config.baseConversionRate;
      let value = 0;
      
      if (converted) {
        if (config.revenueDistribution === 'lognormal') {
          // Convert mean/var to lognormal params
          const cv = Math.sqrt(config.revenueParams.variance) / config.revenueParams.mean;
          const sigma = Math.sqrt(Math.log(1 + cv * cv));
          const mu = Math.log(config.revenueParams.mean) - sigma * sigma / 2;
          value = Math.exp(jStat.normal.sample(mu, sigma));
        } else {
          // Gamma parameterization
          const shape = config.revenueParams.mean * config.revenueParams.mean / config.revenueParams.variance;
          const scale = config.revenueParams.variance / config.revenueParams.mean;
          value = jStat.gamma.sample(shape, scale);
        }
      }
      
      controlUsers.push({ converted, value });
    }

    // Treatment group
    const treatmentConversionRate = config.baseConversionRate * (1 + config.conversionLift);
    const treatmentRevenueMean = config.revenueParams.mean * (1 + config.revenueLift);
    
    for (let i = 0; i < config.sampleSize / 2; i++) {
      const converted = Math.random() < treatmentConversionRate;
      let value = 0;
      
      if (converted) {
        if (config.revenueDistribution === 'lognormal') {
          const cv = Math.sqrt(config.revenueParams.variance) / treatmentRevenueMean;
          const sigma = Math.sqrt(Math.log(1 + cv * cv));
          const mu = Math.log(treatmentRevenueMean) - sigma * sigma / 2;
          value = Math.exp(jStat.normal.sample(mu, sigma));
        } else {
          const shape = treatmentRevenueMean * treatmentRevenueMean / config.revenueParams.variance;
          const scale = config.revenueParams.variance / treatmentRevenueMean;
          value = jStat.gamma.sample(shape, scale);
        }
      }
      
      treatmentUsers.push({ converted, value });
    }

    return {
      control: controlUsers,
      treatment: treatmentUsers,
      metadata: {
        trueConversionLift: config.conversionLift,
        trueRevenueLift: config.revenueLift,
        sampleSize: config.sampleSize
      }
    };
  }

  /**
   * SaaS scenario with retention and feature usage
   */
  saas(config: {
    baseRetention: number;
    retentionLift: number;
    featureUsage: 'poisson' | 'negative-binomial';
    baseUsageRate: number;
    usageLift: number;
    sampleSize: number;
  }): BusinessExperimentData {
    // Implementation similar to ecommerce but with retention/usage metrics
    throw new Error('Not implemented yet');
  }
}