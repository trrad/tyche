# Sprint 0: Data Foundation (Week 1)

## Sprint Goal

Establish the core data model that everything in Tyche depends on. This sprint focuses on creating the foundational data structures and validation logic.

## Context

- Everything flows through `StandardData` - it's the common currency of the system
- Only 2 data types: `binomial` (aggregate) and `user-level` (everything else)
- Quality indicators computed once, used everywhere for routing decisions
- This MUST ship first as everything else depends on it

---

## Issue 27: Implement StandardData and quality indicators

**Priority**: P0: Critical  
**Labels**: `sprint-0`, `data-layer`, `foundation`  
**Size**: L (Large)  
**Blocks**: Everything

### Description

Create the core data structure that all of Tyche uses. This is the most important interface in the system as it defines how data flows through every layer.

### Acceptance Criteria

- [ ] Define StandardData interface with only 2 types: binomial and user-level
- [ ] Implement DataQuality computation:
  - `hasZeros`: Critical for compound model selection
  - `hasNegatives`: Determines distribution family
  - `hasOutliers`: Suggests mixture models
  - `missingData`: Count of null/undefined values
- [ ] Create parsers for common formats:
  - CSV with headers
  - JSON (various shapes)
  - Simple arrays of numbers
  - Binomial summary data
- [ ] Add validation with helpful error messages using TycheError
- [ ] Write comprehensive tests for edge cases

### Technical Implementation

```typescript
// Core interface (see InterfaceStandards.md)
type DataType = 'binomial' | 'user-level';

interface DataQuality {
  hasZeros: boolean; // Key for compound model selection
  hasNegatives: boolean; // Determines distribution family
  hasOutliers: boolean; // Suggests mixture models
  missingData: number; // Count of null/undefined values
}

interface StandardData {
  type: DataType;
  n: number; // Always required

  // Binomial: Just 2 numbers (aggregate)
  binomial?: {
    successes: number;
    trials: number;
  };

  // User-level: Everything else
  userLevel?: {
    users: UserLevelData[];
    empiricalStats?: EmpiricalStats; // Pre-computed for efficiency
  };

  // Quality indicators for routing
  quality: DataQuality;
}

interface UserLevelData {
  userId: string;
  converted: boolean;
  value: number; // 0 if not converted
}

// Key insight: "Continuous" data is just user-level where everyone converted.
// This simplifies everything.

// Quality computation example
function computeQuality(users: UserLevelData[]): DataQuality {
  const values = users.map((u) => u.value);
  return {
    hasZeros: users.some((u) => !u.converted || u.value === 0), // Includes non-converted users
    hasNegatives: values.some((v) => v < 0),
    hasOutliers: detectOutliers(values), // IQR method
    missingData: users.filter((u) => u.value == null).length,
  };
}
```

### Error Handling Pattern

```typescript
if (data.n < 30) {
  throw new TycheError(
    ErrorCode.INSUFFICIENT_DATA,
    'Need at least 30 samples for reliable inference',
    { sampleSize: data.n, minimum: 30 },
    true // recoverable - user can add more data
  );
}
```

### Files to Create/Modify

- `src/core/data/StandardData.ts` - Main interface and types
- `src/core/data/quality.ts` - Quality indicator computation
- `src/core/data/validation.ts`
- `src/tests/data/quality.test.ts`

---

## Issue 28: Create ExperimentData structure

**Priority**: P0: Critical  
**Labels**: `sprint-0`, `data-layer`, `foundation`  
**Size**: M (Medium)  
**Depends on**: Issue 1 (StandardData)  
**Blocks**: All analyzer work

### Description

Define the structure for experiments with control and treatment variants. This is the input format for all experiment analysis.

### Acceptance Criteria

- [ ] Define ExperimentData with control + treatments map
- [ ] Implement VariantData supporting both binary and user-level data
- [ ] Add metadata support:
  - Experiment name
  - Hypothesis
  - Start/end dates
  - Minimum practical effect sizes
- [ ] Support multiple treatments from the start
- [ ] Ensure proper TypeScript types throughout
- [ ] Create validation helpers for experiment structure

### Technical Implementation

```typescript
interface ExperimentData {
  id: string;
  name: string;

  variants: {
    control: VariantData;
    treatments: Map<string, VariantData>; // Multiple treatments
  };

  metadata: {
    startDate: Date;
    endDate?: Date;
    hypothesis: string;
    minimumPracticalEffect?: Record<string, number>;
  };
}

// Note: The fluent API will be designed in Sprint 3 (Phase 2.3)
// For now, experiments will be constructed directly:
const experimentData: ExperimentData = {
  id: 'checkout-flow-test',
  name: 'Checkout Flow Optimization',
  variants: {
    control: controlVariantData,
    treatments: new Map([['new-flow', treatmentVariantData]]),
  },
  metadata: {
    startDate: new Date(),
    hypothesis: 'New checkout flow increases conversion by 5%',
  },
};
```

### Files to Create/Modify

- `src/domain/types/ExperimentData.ts`
- `src/domain/types/VariantData.ts`
- `src/domain/validation/experimentValidation.ts`
- `src/tests/types/experiment.test.ts`

---

## Issue 29: Add UserLevelData feature support

**Priority**: P1: High  
**Labels**: `sprint-0`, `data-layer`, `hte-prep`  
**Size**: S (Small)  
**Depends on**: Issue 1 (StandardData)

### Description

Add feature support to UserLevelData for future HTE (Heterogeneous Treatment Effect) analysis. This enables segment discovery based on user characteristics.

### Acceptance Criteria

- [ ] Define FeatureSet interface with standard features:
  - `device`: mobile | desktop | tablet
  - `browser`: string
  - `dayOfWeek`: string
  - `hour`: number (0-23)
- [ ] Allow custom features via index signature
- [ ] Add feature extraction utilities
- [ ] Create helpers for common patterns
- [ ] Document feature usage patterns

### Technical Implementation

```typescript
interface FeatureSet {
  // Standard features
  device?: 'mobile' | 'desktop' | 'tablet';
  browser?: string;
  dayOfWeek?: string;
  hour?: number;

  // Custom features
  [key: string]: any;
}

// Usage in UserLevelData
interface UserLevelData {
  userId: string;
  converted: boolean;
  value: number;
  features?: FeatureSet; // Optional for now
  timestamp?: Date;
}
```

### Files to Create/Modify

- `src/core/data/features/FeatureSet.ts`

---

## Issue 30: Implement core error handling

**Priority**: P0: Critical  
**Labels**: `sprint-0`, `errors`, `foundation`  
**Size**: M (Medium)  
**Blocks**: All error handling in other sprints

### Description

Create the TycheError class and error code system that provides consistent, helpful error messages throughout the application.

### Acceptance Criteria

- [ ] Implement TycheError class extending Error
- [ ] Define ErrorCode enum with all error types
- [ ] Support error context for debugging
- [ ] Mark errors as recoverable/non-recoverable
- [ ] Provide recovery suggestions
- [ ] Consistent error message format
- [ ] Stack trace preservation

### Technical Implementation

```typescript
// From InterfaceStandards.md
enum ErrorCode {
  // Data errors
  INVALID_DATA = 'INVALID_DATA',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  DATA_QUALITY = 'DATA_QUALITY',

  // Model errors
  MODEL_MISMATCH = 'MODEL_MISMATCH',
  CONVERGENCE_FAILED = 'CONVERGENCE_FAILED',
  INVALID_PRIOR = 'INVALID_PRIOR',

  // Worker errors
  WORKER_TIMEOUT = 'WORKER_TIMEOUT',
  WORKER_ERROR = 'WORKER_ERROR',

  // User errors
  INVALID_INPUT = 'INVALID_INPUT',
  CANCELLED = 'CANCELLED',

  // System errors
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

class TycheError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: Record<string, any>,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'TycheError';

    // Ensure stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TycheError);
    }
  }

  // Helper for creating common errors
  static insufficientData(actual: number, required: number, context?: string): TycheError {
    return new TycheError(
      ErrorCode.INSUFFICIENT_DATA,
      `Need at least ${required} samples, but only have ${actual}${context ? ` for ${context}` : ''}`,
      { actual, required, context },
      true // recoverable - user can add more data
    );
  }

  static invalidData(reason: string, details?: Record<string, any>): TycheError {
    return new TycheError(ErrorCode.INVALID_DATA, reason, details, false);
  }

  static convergenceFailed(algorithm: string, iterations: number, metric?: number): TycheError {
    return new TycheError(
      ErrorCode.CONVERGENCE_FAILED,
      `${algorithm} failed to converge after ${iterations} iterations`,
      { algorithm, iterations, metric },
      true // can retry with different settings
    );
  }
}

// Usage example
function validateData(data: StandardData): void {
  if (data.n < 30) {
    throw TycheError.insufficientData(data.n, 30, 'reliable inference');
  }

  if (data.type === 'binomial' && !data.binomial) {
    throw TycheError.invalidData('Binomial data type requires binomial field', {
      type: data.type,
      hasBinomial: false,
    });
  }
}
```

### Files to Create

- `src/core/errors/TycheError.ts`
- `src/core/errors/ErrorCode.ts`
- `src/core/errors/recovery.ts`
- `src/tests/errors/error-handling.test.ts`

---

## Issue 31: Create data parser interfaces

**Priority**: P1: High  
**Labels**: `sprint-0`, `data-layer`, `parsing`  
**Size**: M (Medium)  
**Depends on**: Issue 1, Issue 4

### Description

Create high-level interfaces for parsing common data formats into StandardData. Implementation details can be fleshed out later.

### Acceptance Criteria

- [ ] Define DataParser interface
- [ ] CSV parser interface with options
- [ ] JSON parser with format detection
- [ ] Array parser for simple numeric data
- [ ] Auto-detection of format
- [ ] Clear parsing errors using TycheError
- [ ] Extensible for future formats

### Technical Implementation

```typescript
interface DataParser<T = any> {
  canParse(input: unknown): boolean;
  parse(input: T, options?: ParseOptions): StandardData;
  validate(input: T): ValidationResult;
}

interface ParseOptions {
  // Common options
  treatAsUserLevel?: boolean;
  valueColumn?: string;
  convertedColumn?: string;
  userIdColumn?: string;

  // CSV specific
  delimiter?: string;
  hasHeaders?: boolean;

  // JSON specific
  dataPath?: string; // JSONPath to data array
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}

// High-level parser implementations
class CSVParser implements DataParser<string> {
  canParse(input: unknown): boolean {
    return typeof input === 'string' && (input.includes(',') || input.includes('\t'));
  }

  parse(input: string, options?: ParseOptions): StandardData {
    // High-level logic:
    // 1. Detect delimiter and headers
    // 2. Parse rows
    // 3. Detect if binomial or user-level
    // 4. Extract appropriate columns
    // 5. Compute quality indicators
    // 6. Return StandardData

    // Implementation details TBD
    throw new TycheError(ErrorCode.NOT_IMPLEMENTED, 'CSV parsing implementation pending');
  }

  validate(input: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!input.trim()) {
      errors.push('Empty CSV data');
    }

    // More validation logic...

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

class JSONParser implements DataParser<object> {
  canParse(input: unknown): boolean {
    return typeof input === 'object' && input !== null;
  }

  parse(input: object, options?: ParseOptions): StandardData {
    // Detect format:
    // - { successes: n, trials: m } → binomial
    // - [{ userId, value, converted }, ...] → user-level
    // - { data: [...] } → extract and recurse
    // - etc.

    throw new TycheError(ErrorCode.NOT_IMPLEMENTED, 'JSON parsing implementation pending');
  }

  validate(input: object): ValidationResult {
    // Validate JSON structure
    return {
      valid: true,
      errors: [],
      warnings: [],
    };
  }
}

// Auto-detection
class DataParserFactory {
  private static parsers: DataParser[] = [new CSVParser(), new JSONParser(), new ArrayParser()];

  static parse(input: unknown, options?: ParseOptions): StandardData {
    const parser = this.parsers.find((p) => p.canParse(input));

    if (!parser) {
      throw TycheError.invalidData('Unrecognized data format', { inputType: typeof input });
    }

    const validation = parser.validate(input);
    if (!validation.valid) {
      throw TycheError.invalidData(
        `Invalid ${parser.constructor.name} data: ${validation.errors.join(', ')}`,
        { errors: validation.errors }
      );
    }

    return parser.parse(input, options);
  }
}
```

### Files to Create

- `src/core/data/parsers/DataParser.ts` (interface)
- `src/core/data/parsers/CSVParser.ts`
- `src/core/data/parsers/JSONParser.ts`
- `src/core/data/parsers/ArrayParser.ts`
- `src/core/data/parsers/DataParserFactory.ts`
- `src/tests/parsers/*.test.ts`

---

## Sprint Success Criteria

- [ ] All tests passing
- [ ] StandardData used consistently throughout codebase
- [ ] Data validation catches common errors with helpful messages
- [ ] Feature support ready for future HTE work
- [ ] TycheError provides clear, actionable error messages
- [ ] Parser interfaces defined for future implementation
- [ ] Documentation updated with examples

## Next Sprint Preview

Sprint 1 will build on this foundation with:

- Pure mathematical distributions (parallel work)
- Basic A/B test analysis using the data structures
- First working end-to-end analyzer

## What's NOT in This Sprint

- Fluent API (comes in Sprint 3/Phase 2.3)
- Inference engines (Sprint 1)
- Model routing (Sprint 2)
- Any analysis capabilities (Sprint 1+)
