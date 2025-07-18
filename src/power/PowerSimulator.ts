// src/power/PowerSimulator.ts
import { RandomVariable } from '../core/RandomVariable';
import { ConversionValueModel, VariantData, UserData } from '../models/ConversionValueModel';
import { beta } from '../core/distributions/Beta';
import { normal } from '../core/distributions/Normal';
import { gamma } from '../core/distributions/Gamma';
import { logNormal } from '../core/distributions/LogNormal';
import { binomial } from '../core/distributions/Binomial';
import { RNG } from '../core/math/random';

/**
 * Distribution that can generate samples
 */
export interface Distribution {
  sample(): number;
  mean?(): number;
}

/**
 * Configuration for power analysis simulation
 */
export interface SimulationScenario {
  control: Distribution;      // Distribution of control outcomes
  treatment: Distribution;    // Distribution of treatment outcomes
  sampleSizePerVariant: number;
  analysisConfig: {
    modelType?: 'revenue' | 'conversion';  // What are we analyzing?
    credibleInterval?: number;  // default 0.95
    ropeThreshold?: number;    // Region of Practical Equivalence
    iterations?: number;       // For MCMC sampling
  };
  trueEffect?: number;         // Known true effect for validation
}

/**
 * Result from a single simulation
 */
export interface SimulationResult {
  // Core metrics
  probTreatmentBetter: number;
  credibleInterval: [number, number];
  effectEstimate: number;
  
  // Decision outcomes
  declareWinner: 'control' | 'treatment' | 'no-difference';
  correctDecision?: boolean;
  
  // Additional info
  sampleSize: number;
}

/**
 * Aggregated results from multiple simulations
 */
export interface PowerAnalysisResult {
  // Power metrics
  power: number;                    // Rate of detecting true effects
  typeIError: number;              // Rate of false positives
  correctDecisionRate: number;      
  
  // Effect estimation
  averageEffectEstimate: number;
  effectEstimateBias: number;
  
  // Precision metrics
  averageCredibleIntervalWidth: number;
  coverageProbability: number;     // How often CI contains true effect
  
  // Raw results for detailed analysis
  simulationResults: SimulationResult[];
  
  // Scenario info
  scenario: SimulationScenario;
}

export class PowerSimulator {
  private rng: RNG;
  
  constructor(seed?: number) {
    this.rng = new RNG(seed);
    if (seed !== undefined) {
      console.log(`PowerSimulator initialized with seed: ${seed}`);
    }
  }
  
  /**
   * Run power analysis simulation
   */
  async simulate(
    scenario: SimulationScenario,
    iterations: number = 1000,
    onProgress?: (progress: number) => void
  ): Promise<PowerAnalysisResult> {
    const results: SimulationResult[] = [];
    let debugFirst = true; // Debug flag for first iteration
    
    for (let i = 0; i < iterations; i++) {
      // Generate synthetic experiment data
      const experimentData = this.generateExperimentData(scenario);
      
      // Analyze using ConversionValueModel
      const analysisResult = await this.analyzeExperiment(
        experimentData,
        scenario.analysisConfig
      );
      
      // Extract metrics and decision
      const result = this.extractSimulationResult(
        analysisResult,
        scenario,
        debugFirst // Pass debug flag
      );
      
      debugFirst = false; // Only debug first iteration
      results.push(result);
      
      // Report progress
      if (onProgress && i % 10 === 0) {
        onProgress((i + 1) / iterations);
      }
    }
    
    return this.aggregateResults(results, scenario);
  }
  
  /**
   * Generate synthetic experiment data
   */
  private generateExperimentData(scenario: SimulationScenario): {
    control: VariantData;
    treatment: VariantData;
  } {
    const n = scenario.sampleSizePerVariant;
    
    // Generate individual user outcomes
    const controlUsers: UserData[] = [];
    const treatmentUsers: UserData[] = [];
    
    for (let i = 0; i < n; i++) {
      // Sample from control distribution
      const controlValue = scenario.control.sample();
      controlUsers.push({
        converted: controlValue > 0,
        value: controlValue
      });
      
      // Sample from treatment distribution
      const treatmentValue = scenario.treatment.sample();
      treatmentUsers.push({
        converted: treatmentValue > 0,
        value: treatmentValue
      });
    }
    
    return {
      control: {
        name: 'Control',
        users: controlUsers
      },
      treatment: {
        name: 'Treatment',
        users: treatmentUsers
      }
    };
  }
  
  /**
   * Analyze experiment using ConversionValueModel
   */
  private async analyzeExperiment(
    data: { control: VariantData; treatment: VariantData },
    config: SimulationScenario['analysisConfig']
  ): Promise<any> {
    // Create model with appropriate prior
    const model = new ConversionValueModel(
      beta(1, 1), // Uniform prior for conversion
      'auto',     // Auto-detect value distribution
      config.modelType || 'revenue'
    );
    
    // Add data
    model.addVariant(data.control);
    model.addVariant(data.treatment);
    
    // Run analysis
    const result = await model.analyze({
      iterations: config.iterations || 3000,
      referenceVariant: 'Control'
    });
    
    // Debug: Check structure
    if (!result || !result.relativeEffects) {
      console.error('Invalid result structure from analyze:', result);
    }
    
    return result;
  }
  
  /**
   * Extract metrics from analysis result
   */
  private extractSimulationResult(
    analysisResult: any,
    scenario: SimulationScenario,
    debug: boolean = false
  ): SimulationResult {
    // The analyze method returns ConversionValuePosterior type
    // Check if we got valid results
    if (!analysisResult || !analysisResult.relativeEffects) {
      console.warn('Invalid analysis result structure:', analysisResult);
      return {
        probTreatmentBetter: 0.5,
        credibleInterval: [0, 0],
        effectEstimate: 0,
        declareWinner: 'no-difference',
        correctDecision: false,
        sampleSize: scenario.sampleSizePerVariant
      };
    }
    
    // Extract overall relative effect (revenue per user)
    const relativeEffects = analysisResult.relativeEffects;
    
    // Debug logging for first iteration
    if (debug) {
      console.log('DEBUG - First simulation:');
      console.log('  RelativeEffects keys:', Array.from(relativeEffects.keys()));
      console.log('  Has Treatment?', relativeEffects.has('Treatment'));
    }
    
    const treatmentEffects = relativeEffects.get('Treatment');
    const overallEffects = treatmentEffects?.overall || [];
    
    if (overallEffects.length === 0) {
      console.warn('No overall effects found for Treatment');
      return {
        probTreatmentBetter: 0.5,
        credibleInterval: [0, 0],
        effectEstimate: 0,
        declareWinner: 'no-difference',
        correctDecision: false,
        sampleSize: scenario.sampleSizePerVariant
      };
    }
    
    const effectEstimate = overallEffects.reduce((a: number, b: number) => a + b) / overallEffects.length;
    
    // Calculate credible interval
    const sorted = [...overallEffects].sort((a, b) => a - b);
    const ciLevel = scenario.analysisConfig.credibleInterval || 0.95;
    const alpha = (1 - ciLevel) / 2;
    const lowerIdx = Math.floor(sorted.length * alpha);
    const upperIdx = Math.floor(sorted.length * (1 - alpha));
    const credibleInterval: [number, number] = [
      sorted[lowerIdx] || 0,
      sorted[upperIdx] || 0
    ];
    
    // Debug first iteration
    if (debug) {
      console.log('  Effect samples:', overallEffects.length);
      console.log('  Effect estimate:', effectEstimate);
      console.log('  Credible interval:', credibleInterval);
      console.log('  ROPE threshold:', scenario.analysisConfig.ropeThreshold);
    }
    
    // Probability treatment is better
    const probTreatmentBetter = overallEffects.filter((e: number) => e > 0).length / overallEffects.length;
    
    // Make decision based on ROPE
    const rope = scenario.analysisConfig.ropeThreshold || 0;
    let declareWinner: SimulationResult['declareWinner'];
    
    if (credibleInterval[0] > rope) {
      declareWinner = 'treatment';
    } else if (credibleInterval[1] < -rope) {
      declareWinner = 'control';
    } else {
      declareWinner = 'no-difference';
    }
    
    if (debug) {
      console.log('  Decision:', declareWinner);
      console.log('  CI[0] > ROPE?', credibleInterval[0], '>', rope, '=', credibleInterval[0] > rope);
      console.log('  CI[1] < -ROPE?', credibleInterval[1], '<', -rope, '=', credibleInterval[1] < -rope);
    }
    
    // Evaluate correctness if true effect is known
    let correctDecision: boolean | undefined;
    if (scenario.trueEffect !== undefined) {
      if (scenario.trueEffect > rope && declareWinner === 'treatment') {
        correctDecision = true;
      } else if (scenario.trueEffect < -rope && declareWinner === 'control') {
        correctDecision = true;
      } else if (Math.abs(scenario.trueEffect) <= rope && declareWinner === 'no-difference') {
        correctDecision = true;
      } else {
        correctDecision = false;
      }
    }
    
    return {
      probTreatmentBetter,
      credibleInterval,
      effectEstimate,
      declareWinner,
      correctDecision,
      sampleSize: scenario.sampleSizePerVariant
    };
  }
  
  /**
   * Aggregate results across simulations
   */
  private aggregateResults(
    results: SimulationResult[],
    scenario: SimulationScenario
  ): PowerAnalysisResult {
    const n = results.length;
    
    // Calculate power and error rates
    const detectingTreatment = results.filter(r => r.declareWinner === 'treatment').length;
    const detectingControl = results.filter(r => r.declareWinner === 'control').length;
    const detectingNoDiff = results.filter(r => r.declareWinner === 'no-difference').length;
    
    const correctDecisions = results.filter(r => r.correctDecision === true).length;
    const hasTrueEffect = scenario.trueEffect !== undefined;
    
    // Calculate power based on true effect
    let power = 0;
    let typeIError = 0;
    
    if (hasTrueEffect && scenario.trueEffect !== undefined) {
      const rope = scenario.analysisConfig.ropeThreshold || 0;
      
      if (Math.abs(scenario.trueEffect) <= rope) {
        // No true effect case
        typeIError = (detectingTreatment + detectingControl) / n;
        power = detectingNoDiff / n;
      } else if (scenario.trueEffect > rope) {
        // True positive effect
        power = detectingTreatment / n;
        typeIError = 0; // Not applicable
      } else {
        // True negative effect
        power = detectingControl / n;
        typeIError = 0; // Not applicable
      }
    }
    
    // Calculate other metrics
    const effects = results.map(r => r.effectEstimate);
    const avgEffect = effects.reduce((a, b) => a + b, 0) / n;
    const bias = hasTrueEffect && scenario.trueEffect !== undefined
      ? avgEffect - scenario.trueEffect
      : 0;
    
    const ciWidths = results.map(r => r.credibleInterval[1] - r.credibleInterval[0]);
    const avgCIWidth = ciWidths.reduce((a, b) => a + b, 0) / n;
    
    // Coverage probability
    let coverage = 0;
    if (hasTrueEffect && scenario.trueEffect !== undefined) {
      coverage = results.filter(r => 
        r.credibleInterval[0] <= scenario.trueEffect! &&
        r.credibleInterval[1] >= scenario.trueEffect!
      ).length / n;
    }
    
    return {
      power,
      typeIError,
      correctDecisionRate: hasTrueEffect ? correctDecisions / n : NaN,
      averageEffectEstimate: avgEffect,
      effectEstimateBias: bias,
      averageCredibleIntervalWidth: avgCIWidth,
      coverageProbability: coverage,
      simulationResults: results,
      scenario
    };
  }
  
  /**
   * Find required sample size for target power
   */
  async findRequiredSampleSize(
    scenario: Omit<SimulationScenario, 'sampleSizePerVariant'>,
    targetPower: number = 0.8,
    minN: number = 100,
    maxN: number = 10000,
    simulations: number = 500
  ): Promise<{ sampleSize: number; achievedPower: number }> {
    // Binary search for required sample size
    let low = minN;
    let high = maxN;
    let bestN = maxN;
    let bestPower = 0;
    
    while (low <= high) {
      const midN = Math.floor((low + high) / 2);
      
      const result = await this.simulate(
        { ...scenario, sampleSizePerVariant: midN },
        simulations
      );
      
      if (result.power >= targetPower) {
        bestN = midN;
        bestPower = result.power;
        high = midN - 1;
      } else {
        low = midN + 1;
      }
    }
    
    return { sampleSize: bestN, achievedPower: bestPower };
  }
}

// Helper functions to create common distributions
export function createBinaryConversion(rate: number, rng?: RNG): Distribution {
  const dist = binomial(1, rate, rng);
  
  return {
    sample: () => dist.sample(),
    mean: () => rate
  };
}

export function createRevenueDistribution(
  conversionRate: number,
  valueMean: number,
  valueStd: number,
  distribution: 'normal' | 'gamma' | 'lognormal' = 'normal',
  rng?: RNG
): Distribution {
  // Create value distribution based on type
  let valueDist: RandomVariable;
  
  switch (distribution) {
    case 'gamma':
      // Method of moments for gamma
      const shape = (valueMean * valueMean) / (valueStd * valueStd);
      const scale = (valueStd * valueStd) / valueMean;
      valueDist = gamma(shape, scale, rng);
      break;
      
    case 'lognormal':
      // Convert mean/std to lognormal parameters
      const cv = valueStd / valueMean;
      const logSigma = Math.sqrt(Math.log(1 + cv * cv));
      const logMu = Math.log(valueMean) - 0.5 * logSigma * logSigma;
      valueDist = logNormal(logMu, logSigma, rng);
      break;
      
    default: // normal
      valueDist = normal(valueMean, valueStd, rng);
      break;
  }
  
  const convDist = binomial(1, conversionRate, rng);
  
  return {
    sample: () => {
      const converted = convDist.sample() > 0;
      return converted ? Math.max(0, valueDist.sample()) : 0;
    },
    mean: () => conversionRate * valueMean
  };
}

export function createMixtureRevenue(
  conversionRate: number,
  normalMean: number,
  normalStd: number,
  outlierProbability: number,
  outlierMean: number,
  rng?: RNG
): Distribution {
  const convDist = binomial(1, conversionRate, rng);
  const normalDist = normal(normalMean, normalStd, rng);
  const outlierDist = normal(outlierMean, outlierMean * 0.2, rng);
  const localRng = rng || new RNG();
  
  return {
    sample: () => {
      const converted = convDist.sample() > 0;
      if (!converted) return 0;
      
      // Sample from mixture
      const isOutlier = localRng.uniform() < outlierProbability;
      const value = isOutlier 
        ? outlierDist.sample()
        : normalDist.sample();
      
      return Math.max(0, value);
    },
    mean: () => conversionRate * (
      (1 - outlierProbability) * normalMean + 
      outlierProbability * outlierMean
    )
  };
}