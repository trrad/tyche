import { RandomVariable } from '../core/RandomVariable';
import { ComputationGraph } from '../core/ComputationGraph';
import { beta } from '../core/distributions/Beta';
import { gamma } from '../core/distributions/Gamma';

export interface UserData {
  converted: boolean;
  value: number;
}

export interface VariantData {
  name: string;
  users: UserData[];
}

interface VariantModel {
  conversionRate: RandomVariable;
  valueMean: RandomVariable;
}

export class ConversionRevenueModel {
  private variantModels: Map<string, VariantModel> = new Map();
  private graph: ComputationGraph;

  constructor(graph?: ComputationGraph) {
    this.graph = graph || ComputationGraph.current();
  }

  addVariant(data: VariantData) {
    const n = data.users.length;
    const conversions = data.users.filter(u => u.converted).length;
    const values = data.users.filter(u => u.converted).map(u => u.value);
    const totalValue = values.reduce((a, b) => a + b, 0);

    // Beta prior for conversion rate (uniform)
    const convPosterior = beta(1 + conversions, 1 + n - conversions);

    // Gamma prior for value mean (method of moments)
    let valuePosterior: RandomVariable;
    if (values.length > 1) {
      const mean = totalValue / values.length;
      const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (values.length - 1);
      const shape = mean * mean / variance;
      const scale = variance / mean;
      valuePosterior = gamma(Math.max(0.1, shape), Math.max(0.1, scale));
    } else {
      valuePosterior = gamma(1, 100); // Weak prior if not enough data
    }

    this.variantModels.set(data.name, {
      conversionRate: convPosterior,
      valueMean: valuePosterior
    });
  }

  getJointLogProb(data: VariantData[]): RandomVariable {
    // TODO: Compose joint log-probability from all nodes and data
    return RandomVariable.constant(0); // placeholder
  }

  getParameters(): RandomVariable[] {
    const params: RandomVariable[] = [];
    for (const model of this.variantModels.values()) {
      params.push(model.conversionRate, model.valueMean);
    }
    return params;
  }

  async fit(data: VariantData[], sampler: any, options: any) {
    // TODO: Run inference using joint log-prob and parameters
  }

  summarizePosterior(samples: any) {
    // TODO: Summarize posterior samples
  }
} 