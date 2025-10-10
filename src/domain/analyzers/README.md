# Analyzer Framework

Business-focused analysis patterns that orchestrate statistical engines. Analyzers separate business logic from statistical machinery.

## Core Analyzers

- **ConversionAnalyzer**: Binary conversion experiments
- **RevenueAnalyzer**: Revenue/value experiments with compound modeling
- **PriorLearner**: Learn priors from historical data

## Usage

### ConversionAnalyzer

```typescript
import { ConversionAnalyzer } from '../domain/analyzers';
import { StandardDataFactory } from '../core/data/StandardData';
import { BetaDistribution } from '../core/distributions/BetaDistribution';

// Create experiment data
const controlData = StandardDataFactory.fromBinomial(500, 1000);
const treatmentData = StandardDataFactory.fromBinomial(600, 1000);

const experimentData = {
  id: 'button-test',
  name: 'Button Color Test',
  variants: {
    control: { name: 'control', data: controlData },
    treatments: new Map([['red', { name: 'red', data: treatmentData }]]),
  },
  metadata: {
    startDate: new Date(),
    hypothesis: 'Red button increases conversions',
  },
};

// Analyze
const analyzer = new ConversionAnalyzer();

// Optional: Configure with priors
analyzer.configure({
  priors: new Map([
    ['conversion', new BetaDistribution(1, 1)], // Uniform prior
  ]),
});

const result = await analyzer.analyze(experimentData);

// Get results
console.log(`Control: ${result.getVariantResult('control').mean()[0]}`);
console.log(`Treatment: ${result.getVariantResult('red').mean()[0]}`);
```

### RevenueAnalyzer

```typescript
import { RevenueAnalyzer } from '../domain/analyzers';
import { BetaDistribution } from '../core/distributions/BetaDistribution';
import { NormalInverseGammaDistribution } from '../core/distributions/NormalInverseGammaDistribution';

// Revenue experiments typically use user-level data
const controlData = StandardDataFactory.fromUserLevel([
  { userId: 'u1', converted: true, value: 25.99 },
  { userId: 'u2', converted: false, value: 0 },
  // ... more users
]);

const analyzer = new RevenueAnalyzer();

// Configure with compound model priors (separate for frequency/severity)
analyzer.configure({
  priors: new Map([
    ['frequency', new BetaDistribution(2, 8)], // ~20% conversion rate
    ['severity', new NormalInverseGammaDistribution(3, 1, 2, 1)], // ~$20 AOV
  ]),
  minimumPracticalEffect: 5.0, // $5 minimum difference
});

const result = await analyzer.analyze(revenueExperiment);
```

### PriorLearner

```typescript
import { PriorLearner } from '../domain/analyzers';

// Learn from historical data
const historicalData = StandardDataFactory.fromUserLevel(historicalUsers);

const learner = new PriorLearner();
const result = await learner.analyze(historicalData);

// Extract priors for future use
const overallPrior = learner.extractPrior(result);
const frequencyPrior = learner.extractFrequencyPrior(result); // For compound models
const severityPrior = learner.extractSeverityPrior(result); // For compound models
```

## Interfaces

```typescript
interface ExperimentAnalyzer {
  analyze(data: ExperimentData): Promise<ExperimentResult>;
  configure?(options: AnalyzerOptions): void;
}

interface DatasetAnalyzer {
  analyze(data: StandardData): Promise<VariantResult>;
  configure?(options: AnalyzerOptions): void;
}

interface AnalyzerOptions {
  priors?: Map<string, Distribution>;
  minimumPracticalEffect?: number;
  progressCallback?: (progress: number) => void;
}
```

## Factory Functions

```typescript
import { createAnalyzer, createPriorLearner } from '../domain/analyzers';

const conversionAnalyzer = createAnalyzer('conversion');
const revenueAnalyzer = createAnalyzer('revenue');
const priorLearner = createPriorLearner();
```
