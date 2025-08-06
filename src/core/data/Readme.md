# Data Model

The core data model for Tyche, implementing the standardized data interface with quality indicators for routing decisions.

## Overview

The StandardData model simplifies data handling by using only **two data types** throughout the system:

- **`binomial`** - Aggregate conversion data (successes/trials)
- **`user-level`** - Individual user records with conversion and value data

**Key insight**: "Continuous" data is just user-level where everyone converted.

## Core Interfaces

### StandardData

```typescript
interface StandardData {
  type: 'binomial' | 'user-level';
  n: number; // Total sample size

  // One of these will be present based on type
  binomial?: { successes: number; trials: number };
  userLevel?: {
    users: UserLevelData[];
    empiricalStats?: EmpiricalStats;
  };

  // Quality indicators computed once, used for routing
  quality: DataQuality;
}
```

### DataQuality

Quality indicators that drive model routing decisions:

```typescript
interface DataQuality {
  hasZeros: boolean; // → Suggests compound models
  hasNegatives: boolean; // → Affects distribution family choice
  hasOutliers: boolean; // → Suggests mixture models
  missingData: number; // → Count of null/undefined values
}
```

## Usage

### Creating StandardData

```typescript
import { StandardDataFactory } from '@tyche/core';

// From binomial data
const binomialData = StandardDataFactory.fromBinomial(75, 150);

// From user-level data
const users = [
  { userId: '1', converted: false, value: 0 },
  { userId: '2', converted: true, value: 25.5 },
];
const userLevelData = StandardDataFactory.fromUserLevel(users);

// From continuous values (everyone converted)
const continuousData = StandardDataFactory.fromContinuous([10.5, 25.0, 15.75]);
```

### Type Guards

```typescript
import { isBinomialData, isUserLevelData } from '@tyche/core';

if (isBinomialData(data)) {
  // TypeScript knows data.binomial is defined
  console.log(`${data.binomial.successes}/${data.binomial.trials}`);
}

if (isUserLevelData(data)) {
  // TypeScript knows data.userLevel is defined
  console.log(`${data.userLevel.users.length} users`);
}
```

### Quality Analysis

```typescript
import { DataQualityAnalyzer } from '@tyche/core';

// Quality indicators drive model routing
if (data.quality.hasZeros) {
  // Consider compound models (frequency × severity)
}

if (data.quality.hasOutliers) {
  // Consider mixture models (multiple populations)
}

// Compute empirical statistics
const stats = DataQualityAnalyzer.computeEmpiricalStats(values);
console.log(`Mean: ${stats.mean}, Median: ${stats.q50}`);
```

## Migration Strategy

The StandardData model is designed for **incremental migration**:

1. **New code**: Use StandardData from the start
2. **Existing code**: Update incrementally as you touch each file
3. **Tests**: Convert test data formats as needed, not big-bang

## Design Principles

- **Opinionated defaults**: Two types, not generic framework
- **Quality-driven routing**: Compute once, use everywhere
- **Progressive disclosure**: Simple cases simple, complex cases possible
- **Type safety**: Full TypeScript support with type guards
