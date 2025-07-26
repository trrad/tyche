// src/tests/synthetic/DataGenerator.ts
import jStat from 'jstat';
import { Random, MersenneTwister19937 } from 'random-js';

export interface DataSample {
  value: number;
  metadata?: Record<string, any>;
}

export interface ExperimentData {
  control: DataSample[];
  treatment: DataSample[];
  metadata: {
    trueEffect: number;
    sampleSize: number;
    allocation: number;
  };
}

export class SyntheticDataGenerator {
  private random: Random;

  constructor(seed?: number) {
    const engine = seed ? MersenneTwister19937.seed(seed) : MersenneTwister19937.autoSeed();
    this.random = new Random(engine);
  }

  /**
   * Generate from a parameterized distribution
   */
  generateFromDistribution(
    type: 'beta' | 'normal' | 'lognormal' | 'gamma',
    params: number[],
    n: number
  ): number[] {
    switch (type) {
      case 'beta':
        return Array(n).fill(0).map(() => 
          jStat.beta.sample(params[0], params[1])
        );
      
      case 'normal':
        return Array(n).fill(0).map(() => 
          jStat.normal.sample(params[0], params[1])
        );
      
      case 'lognormal':
        return Array(n).fill(0).map(() => {
          const z = jStat.normal.sample(0, 1);
          return Math.exp(params[0] + params[1] * z);
        });
      
      case 'gamma':
        return Array(n).fill(0).map(() => 
          jStat.gamma.sample(params[0], params[1])
        );
      
      default:
        throw new Error(`Unknown distribution type: ${type}`);
    }
  }

  /**
   * Generate A/B test experiment data
   */
  generateExperiment(config: {
    control: { type: string; params: number[] };
    treatment: { type: string; params: number[] };
    sampleSize: number;
    allocation?: number;
  }): ExperimentData {
    const allocation = config.allocation ?? 0.5;
    const controlSize = Math.floor(config.sampleSize * allocation);
    const treatmentSize = config.sampleSize - controlSize;

    const controlData = this.generateFromDistribution(
      config.control.type as any,
      config.control.params,
      controlSize
    ).map(value => ({ value }));

    const treatmentData = this.generateFromDistribution(
      config.treatment.type as any,
      config.treatment.params,
      treatmentSize
    ).map(value => ({ value }));

    // Calculate true effect based on distribution parameters
    const trueEffect = this.calculateTrueEffect(config);

    return {
      control: controlData,
      treatment: treatmentData,
      metadata: {
        trueEffect,
        sampleSize: config.sampleSize,
        allocation
      }
    };
  }

  private calculateTrueEffect(config: any): number {
    // Implementation depends on distribution type
    // This is a simplified version
    if (config.control.type === 'beta' && config.treatment.type === 'beta') {
      const controlMean = config.control.params[0] / (config.control.params[0] + config.control.params[1]);
      const treatmentMean = config.treatment.params[0] / (config.treatment.params[0] + config.treatment.params[1]);
      return (treatmentMean - controlMean) / controlMean;
    }
    // Add other cases...
    return 0;
  }
}