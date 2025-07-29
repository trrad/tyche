// src/tests/utilities/synthetic/DataGenerator.ts
import jStat from 'jstat';
import { Random, MersenneTwister19937 } from 'random-js';
import { UserData } from '../../../inference/base/types';

export type NoiseLevel = 'clean' | 'realistic' | 'noisy';

export interface ComponentTruth {
  weight: number;
  distribution: string;
  parameters: {
    mean?: number;
    std?: number;
    logMean?: number;
    logStd?: number;
    shape?: number;
    scale?: number;
    [key: string]: any;
  };
}

export interface GeneratedDataset {
  data: any; // The actual data (numbers[], UserData[], etc.)
  groundTruth: {
    type: string;
    parameters: any;
    components?: ComponentTruth[];
    noiseLevel?: NoiseLevel;
  };
  metadata: {
    sampleSize: number;
    seed?: number;
    generatedAt: Date;
    assignments?: number[]; // For mixture models, tracks which component each point came from
  };
}

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

export class DataGenerator {
  private generator: SyntheticDataGenerator;
  private seed?: number;

  constructor(seed?: number) {
    this.seed = seed;
    this.generator = new SyntheticDataGenerator(seed);
  }

  /**
   * Apply noise based on predefined noise level
   */
  applyNoiseLevel(data: number[], level: NoiseLevel, options?: { 
    preservePositive?: boolean; 
    distribution?: 'normal' | 'lognormal' | 'gamma' | 'beta';
  }): number[] {
    if (level === 'clean') return data;
    
    let noisyData = [...data];
    
    // Noise parameters based on level
    const noiseStd = level === 'realistic' ? 0.05 : 0.15;
    const outlierRate = level === 'realistic' ? 0.02 : 0.05;
    const outlierMagnitude = level === 'realistic' ? 5 : 20;
    
    // Determine if we should preserve positive values
    const preservePositive = options?.preservePositive ?? (options?.distribution === 'lognormal');
    
    // Apply measurement noise
    noisyData = noisyData.map(value => {
      const noise = this.generator.generateFromDistribution('normal', 
        [0, Math.abs(value) * noiseStd], 1)[0];
      const noisyValue = value + noise;
      
      // For LogNormal data, ensure values stay positive
      if (preservePositive) {
        return Math.max(0.001, noisyValue); // Small positive minimum
      }
      
      return Math.max(0, noisyValue); // General non-negative constraint
    });
    
    // Apply outliers
    const numOutliers = Math.floor(data.length * outlierRate);
    if (numOutliers > 0) {
      const indices = Array.from({length: data.length}, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, numOutliers);
      
      const sorted = [...data].sort((a, b) => a - b);
      const q75 = sorted[Math.floor(sorted.length * 0.75)];
      
      indices.forEach(idx => {
        const outlierValue = q75 * outlierMagnitude * (0.8 + Math.random() * 0.4);
        // Ensure outliers also respect positive constraint for LogNormal
        noisyData[idx] = preservePositive ? Math.max(0.001, outlierValue) : outlierValue;
      });
    }
    
    return noisyData;
  }

  /**
   * Generate mixture data with ground truth tracking
   */
  mixture(components: Array<{
    distribution: 'normal' | 'lognormal' | 'gamma';
    params: number[];
    weight: number;
  }>, n: number): GeneratedDataset {
    const data: number[] = [];
    const assignments: number[] = []; // Track which component each point came from
    
    components.forEach((comp, idx) => {
      const componentSize = Math.round(n * comp.weight);
      const values = this.generator.generateFromDistribution(
        comp.distribution,
        comp.params,
        componentSize
      );
      data.push(...values);
      assignments.push(...Array(componentSize).fill(idx));
    });
    
    // Shuffle together
    const indices = Array(data.length).fill(0).map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    const shuffledData = indices.map(i => data[i]);
    const shuffledAssignments = indices.map(i => assignments[i]);
    
    // Convert params to meaningful values
    const componentTruths: ComponentTruth[] = components.map(comp => {
      const truth: ComponentTruth = {
        weight: comp.weight,
        distribution: comp.distribution,
        parameters: {}
      };
      
      if (comp.distribution === 'lognormal') {
        // params are [logMean, logStd]
        truth.parameters.logMean = comp.params[0];
        truth.parameters.logStd = comp.params[1];
        // Calculate actual mean for reference
        truth.parameters.mean = Math.exp(comp.params[0] + comp.params[1] * comp.params[1] / 2);
        truth.parameters.std = truth.parameters.mean * Math.sqrt(Math.exp(comp.params[1] * comp.params[1]) - 1);
      } else if (comp.distribution === 'normal') {
        truth.parameters.mean = comp.params[0];
        truth.parameters.std = comp.params[1];
      } else if (comp.distribution === 'gamma') {
        // params are [shape, scale]
        truth.parameters.shape = comp.params[0];
        truth.parameters.scale = comp.params[1];
        truth.parameters.mean = comp.params[0] * comp.params[1];
        truth.parameters.std = Math.sqrt(comp.params[0] * comp.params[1] * comp.params[1]);
      }
      
      return truth;
    });
    
    return {
      data: shuffledData,
      groundTruth: {
        type: 'mixture',
        parameters: {
          numComponents: components.length
        },
        components: componentTruths
      },
      metadata: {
        sampleSize: n,
        seed: this.seed,
        generatedAt: new Date(),
        assignments: shuffledAssignments
      }
    };
  }

  /**
   * Generate compound model data with ground truth
   */
  compound(conversionRate: number, revenueConfig: any, n: number): GeneratedDataset {
    const users: UserData[] = [];
    
    for (let i = 0; i < n; i++) {
      const converted = Math.random() < conversionRate;
      let value = 0;
      
      if (converted) {
        // Generate revenue for converted users
        const { mean, variance } = revenueConfig.params || { mean: 75, variance: 1200 };
        const cv = Math.sqrt(variance) / mean;
        const sigma = Math.sqrt(Math.log(1 + cv * cv));
        const mu = Math.log(mean) - sigma * sigma / 2;
        value = Math.exp(this.generator.generateFromDistribution('normal', [mu, sigma], 1)[0]);
      }
      
      users.push({ converted, value });
    }
    
    return {
      data: users,
      groundTruth: {
        type: 'compound',
        parameters: {
          conversionRate,
          revenueDistribution: revenueConfig.distribution || 'lognormal',
          revenueMean: revenueConfig.params?.mean || 75,
          revenueVariance: revenueConfig.params?.variance || 1200
        }
      },
      metadata: {
        sampleSize: n,
        seed: this.seed,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Generate simple continuous distribution data
   */
  continuous(distribution: 'normal' | 'lognormal' | 'gamma', params: any, n: number): GeneratedDataset {
    const data = this.generator.generateFromDistribution(distribution, Object.values(params), n);
    
    return {
      data,
      groundTruth: {
        type: distribution,
        parameters: params
      },
      metadata: {
        sampleSize: n,
        seed: this.seed,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Generate beta-binomial data with ground truth
   */
  betaBinomial(p: number, n: number): GeneratedDataset {
    const successes = Math.floor(p * n + this.generator.generateFromDistribution('normal', [0, Math.sqrt(n * p * (1 - p))], 1)[0]);
    
    return {
      data: { 
        successes: Math.max(0, Math.min(n, successes)), 
        trials: n 
      },
      groundTruth: {
        type: 'beta-binomial',
        parameters: { 
          probability: p,
          trials: n
        }
      },
      metadata: {
        sampleSize: n,
        seed: this.seed,
        generatedAt: new Date()
      }
    };
  }

  /**
   * Generate compound data with customer segments
   */
  compoundWithSegments(config: {
    conversionRate: number;
    segments: Array<{
      weight: number;
      revenueMean: number;
      revenueVariance: number;
    }>;
    n: number;
  }): GeneratedDataset {
    const users: UserData[] = [];
    const segmentAssignments: number[] = [];
    
    for (let i = 0; i < config.n; i++) {
      const converted = Math.random() < config.conversionRate;
      let value = 0;
      let segmentIdx = 0;
      
      if (converted) {
        // Determine segment
        const rand = Math.random();
        let cumulativeWeight = 0;
        for (let j = 0; j < config.segments.length; j++) {
          cumulativeWeight += config.segments[j].weight;
          if (rand <= cumulativeWeight) {
            segmentIdx = j;
            break;
          }
        }
        
        // Generate revenue for this segment
        const segment = config.segments[segmentIdx];
        const cv = Math.sqrt(segment.revenueVariance) / segment.revenueMean;
        const sigma = Math.sqrt(Math.log(1 + cv * cv));
        const mu = Math.log(segment.revenueMean) - sigma * sigma / 2;
        value = Math.exp(this.generator.generateFromDistribution('normal', [mu, sigma], 1)[0]);
      }
      
      users.push({ converted, value });
      segmentAssignments.push(segmentIdx);
    }
    
    return {
      data: users,
      groundTruth: {
        type: 'compound-segments',
        parameters: {
          conversionRate: config.conversionRate,
          segments: config.segments
        }
      },
      metadata: {
        sampleSize: config.n,
        seed: this.seed,
        generatedAt: new Date(),
        assignments: segmentAssignments
      }
    };
  }

  // Static presets for common test cases
  static presets = {
    // Two clear segments
    clearSegments: (n: number, seed?: number) => 
      new DataGenerator(seed).mixture([
        { distribution: 'lognormal', params: [3.2, 0.4], weight: 0.7 }, // ~$25
        { distribution: 'lognormal', params: [5, 0.4], weight: 0.3 }    // ~$150
      ], n),
    
    // Overlapping segments
    overlappingSegments: (n: number, seed?: number) =>
      new DataGenerator(seed).mixture([
        { distribution: 'lognormal', params: [3.7, 0.6], weight: 0.6 },
        { distribution: 'lognormal', params: [4.2, 0.5], weight: 0.4 }
      ], n),
    
    // Three tier SaaS
    saasTiers: (n: number, seed?: number) =>
      new DataGenerator(seed).mixture([
        { distribution: 'lognormal', params: [2.3, 0.3], weight: 0.5 },  // ~$10
        { distribution: 'lognormal', params: [3.9, 0.2], weight: 0.35 }, // ~$50
        { distribution: 'lognormal', params: [5.3, 0.3], weight: 0.15 }  // ~$200
      ], n),
    
    // Four component mixture (stress test)
    fourSegments: (n: number, seed?: number) =>
      new DataGenerator(seed).mixture([
        { distribution: 'lognormal', params: [2.3, 0.3], weight: 0.4 },
        { distribution: 'lognormal', params: [3.4, 0.3], weight: 0.3 },
        { distribution: 'lognormal', params: [4.6, 0.3], weight: 0.2 },
        { distribution: 'lognormal', params: [5.7, 0.4], weight: 0.1 }
      ], n),
    
    // E-commerce compound
    ecommerce: (n: number, seed?: number) =>
      new DataGenerator(seed).compound(0.05, {
        distribution: 'lognormal',
        params: { mean: 75, variance: 1200 }
      }, n),
    
    // E-commerce with customer segments
    ecommerceSegments: (n: number, seed?: number) => {
      const gen = new DataGenerator(seed);
      
      // Generate base e-commerce data
      const baseData = DataGenerator.scenarios.ecommerce.clean(n, seed);
      const users = baseData.data;
      
      // Post-process to create clearer segments
      const processedUsers = users.map((u: any) => {
        if (u.converted && u.value > 0) {
          // 65% budget, 35% premium
          if (Math.random() < 0.65) {
            u.value = u.value * 0.4; // Scale down for budget segment
          } else {
            u.value = u.value * 2.5; // Scale up for premium segment
          }
        }
        return u;
      });
      
      return {
        data: processedUsers,
        groundTruth: {
          type: 'compound-segments',
          parameters: {
            conversionRate: 0.05, // Base conversion rate
            segments: [
              { weight: 0.65, revenueMean: 20, revenueVariance: 400 },
              { weight: 0.35, revenueMean: 125, revenueVariance: 15625 }
            ]
          }
        },
        metadata: {
          sampleSize: n,
          seed,
          generatedAt: new Date()
        }
      };
    },

    // Beta-binomial with known probability
    betaBinomial: (p: number, n: number, seed?: number) => 
      new DataGenerator(seed).betaBinomial(p, n),

    // Normal distribution
    normal: (mean: number, std: number, n: number, seed?: number) =>
      new DataGenerator(seed).continuous('normal', { mean, std }, n),

    // LogNormal distribution
    lognormal: (logMean: number, logStd: number, n: number, seed?: number) =>
      new DataGenerator(seed).continuous('lognormal', { logMean, logStd }, n)
  };

  // Scenarios with noise levels
  static scenarios = {
    // Beta-Binomial scenarios
    betaBinomial: {
      clean: (p: number, n: number, seed?: number): GeneratedDataset => {
        const gen = new DataGenerator(seed);
        
        // Seed-controlled conversion rate
        const rng = new DataGenerator(seed);
        const actualP = p + (rng.generator.generateFromDistribution('normal', [0, p * 0.1], 1)[0]);
        const clampedP = Math.max(0.001, Math.min(0.999, actualP));
        
        const successes = Math.floor(clampedP * n + gen.generator.generateFromDistribution('normal', [0, Math.sqrt(n * clampedP * (1 - clampedP))], 1)[0]);
        
        return {
          data: { 
            successes: Math.max(0, Math.min(n, successes)), 
            trials: n 
          },
          groundTruth: {
            type: 'beta-binomial',
            parameters: { 
              probability: clampedP,
              trials: n
            },
            noiseLevel: 'clean'
          },
          metadata: {
            sampleSize: n,
            seed,
            generatedAt: new Date()
          }
        };
      },
      
      realistic: (p: number, n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.betaBinomial.clean(p, n, seed);
        const errorRate = 0.05;
        
        // Simulate measurement error
        let noisySuccesses = 0;
        for (let i = 0; i < base.data.trials; i++) {
          const isSuccess = i < base.data.successes;
          const hasError = Math.random() < errorRate;
          if (hasError ? !isSuccess : isSuccess) {
            noisySuccesses++;
          }
        }
        
        return {
          ...base,
          data: { successes: noisySuccesses, trials: base.data.trials },
          groundTruth: { ...base.groundTruth, noiseLevel: 'realistic' }
        };
      },
      
      noisy: (p: number, n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.betaBinomial.clean(p, n, seed);
        const errorRate = 0.15;
        
        let noisySuccesses = 0;
        for (let i = 0; i < base.data.trials; i++) {
          const isSuccess = i < base.data.successes;
          const hasError = Math.random() < errorRate;
          if (hasError ? !isSuccess : isSuccess) {
            noisySuccesses++;
          }
        }
        
        return {
          ...base,
          data: { successes: noisySuccesses, trials: base.data.trials },
          groundTruth: { ...base.groundTruth, noiseLevel: 'noisy' }
        };
      }
    },
    
    // Revenue scenarios  
    revenue: {
      clean: (logMean: number, logStd: number, n: number, seed?: number): GeneratedDataset => {
        const gen = new DataGenerator(seed);
        
        // Seed-controlled parameters
        const rng = new DataGenerator(seed);
        const actualLogMean = logMean + (rng.generator.generateFromDistribution('normal', [0, 0.1], 1)[0]);
        const actualLogStd = logStd + (rng.generator.generateFromDistribution('normal', [0, 0.05], 1)[0]);
        
        const data = gen.generator.generateFromDistribution('lognormal', [actualLogMean, actualLogStd], n);
        
        return {
          data,
          groundTruth: {
            type: 'lognormal',
            parameters: { logMean: actualLogMean, logStd: actualLogStd },
            noiseLevel: 'clean'
          },
          metadata: {
            sampleSize: n,
            seed,
            generatedAt: new Date()
          }
        };
      },
      
      realistic: (logMean: number, logStd: number, n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.revenue.clean(logMean, logStd, n, seed);
        const gen = new DataGenerator(seed);
        return {
          ...base,
          data: gen.applyNoiseLevel(base.data, 'realistic', { distribution: 'lognormal' }),
          groundTruth: { ...base.groundTruth, noiseLevel: 'realistic' }
        };
      },
      
      noisy: (logMean: number, logStd: number, n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.revenue.clean(logMean, logStd, n, seed);
        const gen = new DataGenerator(seed);
        return {
          ...base,
          data: gen.applyNoiseLevel(base.data, 'noisy', { distribution: 'lognormal' }),
          groundTruth: { ...base.groundTruth, noiseLevel: 'noisy' }
        };
      }
    },
    
    // Customer segments
    segments: {
      clean: (n: number, seed?: number): GeneratedDataset => {
        const gen = new DataGenerator(seed);
        
        // Seed-controlled parameters
        const rng = new DataGenerator(seed);
        const numSegments = Math.floor(2 + rng.generator.generateFromDistribution('normal', [0, 0.5], 1)[0]); // 2-3 segments
        const segments = [];
        
        for (let i = 0; i < numSegments; i++) {
          const weight = (1 / numSegments) + (rng.generator.generateFromDistribution('normal', [0, 0.1], 1)[0]);
          const logMean = 3.2 + i * 0.8 + (rng.generator.generateFromDistribution('normal', [0, 0.2], 1)[0]);
          const logStd = 0.4 + (rng.generator.generateFromDistribution('normal', [0, 0.1], 1)[0]);
          
          segments.push({
            distribution: 'lognormal' as const,
            params: [logMean, logStd],
            weight: Math.max(0.1, Math.min(0.8, weight))
          });
        }
        
        // Normalize weights
        const totalWeight = segments.reduce((sum, seg) => sum + seg.weight, 0);
        segments.forEach(seg => seg.weight /= totalWeight);
        
        return gen.mixture(segments, n);
      },
      
      realistic: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.segments.clean(n, seed);
        const gen = new DataGenerator(seed);
        return {
          ...base,
          data: gen.applyNoiseLevel(base.data, 'realistic', { distribution: 'lognormal' }),
          groundTruth: { ...base.groundTruth, noiseLevel: 'realistic' }
        };
      },
      
      noisy: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.segments.clean(n, seed);
        const gen = new DataGenerator(seed);
        return {
          ...base,
          data: gen.applyNoiseLevel(base.data, 'noisy', { distribution: 'lognormal' }),
          groundTruth: { ...base.groundTruth, noiseLevel: 'noisy' }
        };
      }
    },
    
    // E-commerce compound
    ecommerce: {
      clean: (n: number, seed?: number): GeneratedDataset => {
        const gen = new DataGenerator(seed);
        const users: UserData[] = [];
        
        // Seed-controlled parameters
        const rng = new DataGenerator(seed);
        const conversionRate = 0.05 + (rng.generator.generateFromDistribution('normal', [0, 0.015], 1)[0]);
        const revenueMean = 75 + (rng.generator.generateFromDistribution('normal', [0, 15], 1)[0]);
        const revenueVariance = 1200 + (rng.generator.generateFromDistribution('normal', [0, 300], 1)[0]);
        
        for (let i = 0; i < n; i++) {
          const converted = Math.random() < conversionRate;
          let value = 0;
          
          if (converted) {
            // Generate LogNormal revenue for converted users
            const cv = Math.sqrt(revenueVariance) / revenueMean;
            const sigma = Math.sqrt(Math.log(1 + cv * cv));
            const mu = Math.log(revenueMean) - sigma * sigma / 2;
            value = Math.exp(gen.generator.generateFromDistribution('normal', [mu, sigma], 1)[0]);
          }
          
          users.push({ converted, value });
        }
        
        return {
          data: users,
          groundTruth: {
            type: 'compound-ecommerce',
            parameters: { conversionRate, revenueMean, revenueVariance },
            noiseLevel: 'clean'
          },
          metadata: { sampleSize: n, seed, generatedAt: new Date() }
        };
      },
      
      realistic: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.ecommerce.clean(n, seed);
        const gen = new DataGenerator(seed);
        
        const noisyUsers = base.data.map((user: UserData) => {
          if (user.converted && user.value > 0) {
            const noisy = gen.applyNoiseLevel([user.value], 'realistic', { distribution: 'lognormal' })[0];
            return { ...user, value: noisy };
          }
          return user;
        });
        
        return {
          ...base,
          data: noisyUsers,
          groundTruth: { ...base.groundTruth, noiseLevel: 'realistic' }
        };
      },
      
      noisy: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.ecommerce.clean(n, seed);
        const gen = new DataGenerator(seed);
        
        const noisyUsers = base.data.map((user: UserData) => {
          if (user.converted && user.value > 0) {
            const noisy = gen.applyNoiseLevel([user.value], 'noisy')[0];
            return { ...user, value: noisy };
          }
          return user;
        });
        
        return {
          ...base,
          data: noisyUsers,
          groundTruth: { ...base.groundTruth, noiseLevel: 'noisy' }
        };
      }
    },
    
    // SaaS subscription with tiers
    saas: {
      clean: (n: number, seed?: number): GeneratedDataset => {
        const gen = new DataGenerator(seed);
        const users: UserData[] = [];
        
        // Seed-controlled parameters
        const rng = new DataGenerator(seed);
        const conversionRate = 0.08 + (rng.generator.generateFromDistribution('normal', [0, 0.02], 1)[0]);
        const tiers = [
          { weight: 0.6, mean: 25 + rng.generator.generateFromDistribution('normal', [0, 5], 1)[0] },
          { weight: 0.3, mean: 75 + rng.generator.generateFromDistribution('normal', [0, 15], 1)[0] },
          { weight: 0.1, mean: 200 + rng.generator.generateFromDistribution('normal', [0, 50], 1)[0] }
        ];
        
        for (let i = 0; i < n; i++) {
          const converted = Math.random() < conversionRate;
          let value = 0;
          
          if (converted) {
            const rand = Math.random();
            let cumulativeWeight = 0;
            let selectedTier = tiers[0];
            
            for (const tier of tiers) {
              cumulativeWeight += tier.weight;
              if (rand <= cumulativeWeight) {
                selectedTier = tier;
                break;
              }
            }
            
            value = Math.max(0, selectedTier.mean + rng.generator.generateFromDistribution('normal', [0, selectedTier.mean * 0.3], 1)[0]);
          }
          
          users.push({ converted, value });
        }
        
        return {
          data: users,
          groundTruth: {
            type: 'compound-saas',
            parameters: { conversionRate, tiers },
            noiseLevel: 'clean'
          },
          metadata: { sampleSize: n, seed, generatedAt: new Date() }
        };
      },
      
      realistic: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.saas.clean(n, seed);
        const gen = new DataGenerator(seed);
        
        const noisyUsers = base.data.map((user: UserData) => {
          if (user.converted && user.value > 0) {
            const noisy = gen.applyNoiseLevel([user.value], 'realistic')[0];
            return { ...user, value: noisy };
          }
          return user;
        });
        
        return {
          ...base,
          data: noisyUsers,
          groundTruth: { ...base.groundTruth, noiseLevel: 'realistic' }
        };
      },
      
      noisy: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.saas.clean(n, seed);
        const gen = new DataGenerator(seed);
        
        const noisyUsers = base.data.map((user: UserData) => {
          if (user.converted && user.value > 0) {
            const noisy = gen.applyNoiseLevel([user.value], 'noisy')[0];
            return { ...user, value: noisy };
          }
          return user;
        });
        
        return {
          ...base,
          data: noisyUsers,
          groundTruth: { ...base.groundTruth, noiseLevel: 'noisy' }
        };
      }
    },
    
    // Marketplace with multiple sellers
    marketplace: {
      clean: (n: number, seed?: number): GeneratedDataset => {
        const gen = new DataGenerator(seed);
        const users: UserData[] = [];
        
        // Seed-controlled parameters
        const rng = new DataGenerator(seed);
        const conversionRate = 0.12 + (rng.generator.generateFromDistribution('normal', [0, 0.03], 1)[0]);
        const sellers = [
          { weight: 0.4, mean: 15 + rng.generator.generateFromDistribution('normal', [0, 3], 1)[0] },
          { weight: 0.35, mean: 45 + rng.generator.generateFromDistribution('normal', [0, 8], 1)[0] },
          { weight: 0.2, mean: 120 + rng.generator.generateFromDistribution('normal', [0, 25], 1)[0] },
          { weight: 0.05, mean: 350 + rng.generator.generateFromDistribution('normal', [0, 100], 1)[0] }
        ];
        
        for (let i = 0; i < n; i++) {
          const converted = Math.random() < conversionRate;
          let value = 0;
          
          if (converted) {
            const rand = Math.random();
            let cumulativeWeight = 0;
            let selectedSeller = sellers[0];
            
            for (const seller of sellers) {
              cumulativeWeight += seller.weight;
              if (rand <= cumulativeWeight) {
                selectedSeller = seller;
                break;
              }
            }
            
            value = Math.max(0, selectedSeller.mean + rng.generator.generateFromDistribution('normal', [0, selectedSeller.mean * 0.4], 1)[0]);
          }
          
          users.push({ converted, value });
        }
        
        return {
          data: users,
          groundTruth: {
            type: 'compound-marketplace',
            parameters: { conversionRate, sellers },
            noiseLevel: 'clean'
          },
          metadata: { sampleSize: n, seed, generatedAt: new Date() }
        };
      },
      
      realistic: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.marketplace.clean(n, seed);
        const gen = new DataGenerator(seed);
        
        const noisyUsers = base.data.map((user: UserData) => {
          if (user.converted && user.value > 0) {
            const noisy = gen.applyNoiseLevel([user.value], 'realistic')[0];
            return { ...user, value: noisy };
          }
          return user;
        });
        
        return {
          ...base,
          data: noisyUsers,
          groundTruth: { ...base.groundTruth, noiseLevel: 'realistic' }
        };
      },
      
      noisy: (n: number, seed?: number): GeneratedDataset => {
        const base = DataGenerator.scenarios.marketplace.clean(n, seed);
        const gen = new DataGenerator(seed);
        
        const noisyUsers = base.data.map((user: UserData) => {
          if (user.converted && user.value > 0) {
            const noisy = gen.applyNoiseLevel([user.value], 'noisy')[0];
            return { ...user, value: noisy };
          }
          return user;
        });
        
        return {
          ...base,
          data: noisyUsers,
          groundTruth: { ...base.groundTruth, noiseLevel: 'noisy' }
        };
      }
    }
  };
}

export const dataGenerator = new DataGenerator();