/**
 * ConversionValueModel2 - Refactored using compound model architecture
 * 
 * This will eventually replace ConversionValueModelVI
 * Uses the new modular inference engine and compound models
 */

import { InferenceEngine } from '../inference/InferenceEngine';
import { 
  BetaGammaCompound,
  BetaLogNormalCompound,
  CompoundPosterior,
  UserData as CompoundUserData
} from '../models/compound/CompoundModel';

// Re-export types for compatibility
export interface UserData {
  converted: boolean;
  value: number;
}

export interface VariantData {
  name: string;
  users: UserData[];
}

export interface AnalysisOptions {
  modelType?: 'auto' | 'gamma' | 'lognormal';
  priorStrength?: 'weak' | 'medium' | 'strong';
  credibleLevel?: number;
}

export interface VariantResults {
  conversionRate: {
    mean: number;
    ci: [number, number];
  };
  revenuePerConverter: {
    mean: number;
    ci: [number, number];
  };
  revenuePerUser: {
    mean: number;
    ci: [number, number];
  };
  sampleSize: number;
  conversions: number;
}

export interface ComparisonResults {
  variants: Map<string, VariantResults>;
  comparison: {
    conversionLift: {
      absolute: number;
      relative: number;
      ci: [number, number];
      probabilityPositive: number;
    };
    revenueLift: {
      absolute: number;
      relative: number;
      ci: [number, number];
      probabilityPositive: number;
    };
  };
  recommendation: string;
}

/**
 * Modern implementation using compound models
 */
export class ConversionValueModel2 {
  private inferenceEngine: InferenceEngine;
  private variants: Map<string, VariantData> = new Map();
  
  constructor() {
    this.inferenceEngine = new InferenceEngine();
  }
  
  /**
   * Add a variant to analyze
   */
  addVariant(data: VariantData): void {
    this.variants.set(data.name, data);
  }
  
  /**
   * Clear all variants
   */
  clear(): void {
    this.variants.clear();
  }
  
  /**
   * Get summary statistics
   */
  getSummary(): string {
    const lines = ['Conversion + Value Analysis (v2)', '='.repeat(40)];
    
    for (const [name, data] of this.variants) {
      const conversions = data.users.filter(u => u.converted).length;
      const revenues = data.users.filter(u => u.converted).map(u => u.value);
      const totalRevenue = revenues.reduce((a, b) => a + b, 0);
      
      lines.push(`\n${name}:`);
      lines.push(`  Sample Size: ${data.users.length}`);
      lines.push(`  Conversions: ${conversions} (${(conversions / data.users.length * 100).toFixed(1)}%)`);
      
      if (revenues.length > 0) {
        lines.push(`  Total Revenue: $${totalRevenue.toFixed(2)}`);
        lines.push(`  Avg Order Value: $${(totalRevenue / revenues.length).toFixed(2)}`);
        lines.push(`  Revenue/User: $${(totalRevenue / data.users.length).toFixed(2)}`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Analyze variants using compound models
   */
  async analyze(options: AnalysisOptions = {}): Promise<ComparisonResults> {
    if (this.variants.size === 0) {
      throw new Error('No variants to analyze');
    }
    
    const credibleLevel = options.credibleLevel || 0.8;
    const results = new Map<string, VariantResults>();
    const posteriors = new Map<string, CompoundPosterior>();
    
    // Analyze each variant
    for (const [name, data] of this.variants) {
      const posterior = await this.analyzeVariant(data, options);
      posteriors.set(name, posterior);
      
      const [convRate, revenuePerConv, revenuePerUser] = posterior.mean();
      const [convCI, revConvCI, revUserCI] = posterior.credibleInterval(credibleLevel);
      
      results.set(name, {
        conversionRate: {
          mean: convRate,
          ci: convCI
        },
        revenuePerConverter: {
          mean: revenuePerConv,
          ci: revConvCI
        },
        revenuePerUser: {
          mean: revenuePerUser,
          ci: revUserCI
        },
        sampleSize: data.users.length,
        conversions: data.users.filter(u => u.converted).length
      });
    }
    
    // Compare variants (assumes 2 variants for now)
    const comparison = this.compareVariants(posteriors, credibleLevel);
    
    return {
      variants: results,
      comparison,
      recommendation: this.generateRecommendation(results, comparison)
    };
  }
  
  /**
   * Analyze a single variant
   */
  private async analyzeVariant(
    data: VariantData, 
    options: AnalysisOptions
  ): Promise<CompoundPosterior> {
    // Detect best model type if auto
    const modelType = options.modelType === 'auto' 
      ? this.detectModelType(data.users)
      : options.modelType || 'gamma';
    
    // Create compound model
    const compound = modelType === 'lognormal'
      ? new BetaLogNormalCompound(this.inferenceEngine)
      : new BetaGammaCompound(this.inferenceEngine);
    
    // Set priors based on strength and model type
    const priorConfig = this.getPriorOptions(options.priorStrength);
    
    // For LogNormal, use the appropriate prior
    if (modelType === 'lognormal') {
      const lognormalOptions = {
        frequencyOptions: priorConfig.frequencyOptions,
        severityOptions: {
          priorParams: (priorConfig.severityOptions as any).priorParamsLogNormal
        }
      };
      return await compound.fit(data.users, lognormalOptions);
    }
    
    // For Gamma, use standard priors
    return await compound.fit(data.users, priorConfig);
  }
  
  /**
   * Detect appropriate model type from data
   */
  private detectModelType(users: UserData[]): 'gamma' | 'lognormal' {
    const revenues = users
      .filter(u => u.converted && u.value > 0)
      .map(u => u.value);
    
    if (revenues.length < 10) {
      return 'gamma'; // Default for small samples
    }
    
    // Calculate coefficient of variation
    const mean = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    const variance = revenues.reduce(
      (sum, x) => sum + Math.pow(x - mean, 2), 0
    ) / revenues.length;
    const cv = Math.sqrt(variance) / mean;
    
    // High CV suggests heavy-tailed distribution
    return cv > 1.5 ? 'lognormal' : 'gamma';
  }
  
  /**
   * Get prior options based on strength
   */
  private getPriorOptions(strength?: 'weak' | 'medium' | 'strong') {
    const priorMap = {
      weak: {
        frequencyOptions: {
          priorParams: { type: 'beta' as const, params: [1, 1] }
        },
        severityOptions: {
          // Weak priors - let data speak
          priorParams: { type: 'gamma' as const, params: [1, 0.01] },
          // For LogNormal: centered at log(100) with weak confidence
          priorParamsLogNormal: { 
            type: 'normal-inverse-gamma' as const, 
            params: [Math.log(100), 1, 2, 2] 
          }
        }
      },
      medium: {
        frequencyOptions: {
          priorParams: { type: 'beta' as const, params: [2, 20] }  // ~10% baseline
        },
        severityOptions: {
          priorParams: { type: 'gamma' as const, params: [2, 0.02] },  // ~$100 baseline
          priorParamsLogNormal: { 
            type: 'normal-inverse-gamma' as const, 
            params: [Math.log(100), 5, 3, 5]  // More confident in $100
          }
        }
      },
      strong: {
        frequencyOptions: {
          priorParams: { type: 'beta' as const, params: [5, 50] }  // Strong 10% prior
        },
        severityOptions: {
          priorParams: { type: 'gamma' as const, params: [10, 0.1] },  // Strong $100 prior
          priorParamsLogNormal: { 
            type: 'normal-inverse-gamma' as const, 
            params: [Math.log(100), 20, 10, 20]  // Very confident
          }
        }
      }
    };
    
    return priorMap[strength || 'weak'];
  }
  
  /**
   * Compare two variants (assumes Control and Treatment)
   */
  private compareVariants(
    posteriors: Map<string, CompoundPosterior>,
    credibleLevel: number
  ): ComparisonResults['comparison'] {
    // Get posteriors (assumes Control and Treatment)
    const control = posteriors.get('Control');
    const treatment = posteriors.get('Treatment');
    
    if (!control || !treatment) {
      throw new Error('Comparison requires Control and Treatment variants');
    }
    
    // Sample from posteriors for comparison
    const nSamples = 10000;
    const controlSamples = {
      conv: Array(nSamples).fill(0).map(() => control.frequency.sample()[0]),
      rev: Array(nSamples).fill(0).map(() => control.severity.sample()[0])
    };
    const treatmentSamples = {
      conv: Array(nSamples).fill(0).map(() => treatment.frequency.sample()[0]),
      rev: Array(nSamples).fill(0).map(() => treatment.severity.sample()[0])
    };
    
    // Calculate lifts
    const convLifts = controlSamples.conv.map((c, i) => treatmentSamples.conv[i] - c);
    const convLiftRel = controlSamples.conv.map((c, i) => 
      c > 0 ? (treatmentSamples.conv[i] - c) / c : 0
    );
    
    // Revenue per user lifts
    const controlRevUser = controlSamples.conv.map((c, i) => c * controlSamples.rev[i]);
    const treatmentRevUser = treatmentSamples.conv.map((c, i) => c * treatmentSamples.rev[i]);
    const revLifts = controlRevUser.map((c, i) => treatmentRevUser[i] - c);
    const revLiftRel = controlRevUser.map((c, i) => 
      c > 0 ? (treatmentRevUser[i] - c) / c : 0
    );
    
    // Calculate statistics
    const alpha = (1 - credibleLevel) / 2;
    const sortAndGetCI = (arr: number[]) => {
      arr.sort((a, b) => a - b);
      return [
        arr[Math.floor(alpha * arr.length)],
        arr[Math.floor((1 - alpha) * arr.length)]
      ] as [number, number];
    };
    
    return {
      conversionLift: {
        absolute: convLifts.reduce((a, b) => a + b, 0) / nSamples,
        relative: convLiftRel.reduce((a, b) => a + b, 0) / nSamples,
        ci: sortAndGetCI(convLiftRel),
        probabilityPositive: convLifts.filter(x => x > 0).length / nSamples
      },
      revenueLift: {
        absolute: revLifts.reduce((a, b) => a + b, 0) / nSamples,
        relative: revLiftRel.reduce((a, b) => a + b, 0) / nSamples,
        ci: sortAndGetCI(revLiftRel),
        probabilityPositive: revLifts.filter(x => x > 0).length / nSamples
      }
    };
  }
  
  /**
   * Generate recommendation based on results
   */
  private generateRecommendation(
    results: Map<string, VariantResults>,
    comparison: ComparisonResults['comparison']
  ): string {
    const convProb = comparison.conversionLift.probabilityPositive;
    const revProb = comparison.revenueLift.probabilityPositive;
    
    if (revProb > 0.95) {
      return 'Strong evidence favors Treatment. Recommend shipping.';
    } else if (revProb > 0.80) {
      return 'Moderate evidence favors Treatment. Consider shipping or gathering more data.';
    } else if (revProb < 0.20) {
      return 'Evidence suggests Treatment may be harmful. Do not ship.';
    } else {
      return 'Insufficient evidence to make a recommendation. Gather more data.';
    }
  }
}