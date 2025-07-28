// src/core/data-generation.ts
import { SyntheticDataGenerator } from '../tests/utilities/synthetic/DataGenerator';
import { BusinessScenarios } from '../tests/utilities/synthetic/BusinessScenarios';
import { UserData } from '../inference/base/types';

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
  };
  metadata: {
    sampleSize: number;
    seed?: number;
    generatedAt: Date;
    assignments?: number[]; // For mixture models, tracks which component each point came from
  };
}

export class DataGenerator {
  private generator: SyntheticDataGenerator;
  private scenarios: BusinessScenarios;
  private seed?: number;

  constructor(seed?: number) {
    this.seed = seed;
    this.generator = new SyntheticDataGenerator(seed);
    this.scenarios = new BusinessScenarios(seed);
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
    const result = this.scenarios.ecommerce({
      baseConversionRate: conversionRate,
      conversionLift: 0,
      revenueDistribution: revenueConfig.distribution || 'lognormal',
      revenueParams: revenueConfig.params || { mean: 75, variance: 1200 },
      revenueLift: 0,
      sampleSize: n
    });
    
    return {
      data: result.control,
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
      const users = gen.scenarios.ecommerce({
        baseConversionRate: 0.08,
        conversionLift: 0,
        revenueDistribution: 'lognormal',
        revenueParams: { mean: 50, variance: 2500 }, // High variance to create natural segments
        revenueLift: 0,
        sampleSize: n
      }).control;
      
      // Post-process to create clearer segments
      const processedUsers = users.map(u => {
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
            conversionRate: 0.08,
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
}

export const dataGenerator = new DataGenerator(); 