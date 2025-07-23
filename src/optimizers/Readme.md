# Optimization Algorithms

Gradient-based optimizers for variational inference.

## Current State

**What exists:**
- `adam-optimizer.ts` - Complete Adam implementation
- Used by ZeroInflatedLogNormalVI (to be removed)
- No base optimizer interface

**Problems:**
- Missing base interface for extensibility
- Only one optimizer implemented
- Not clear when to use what optimizer

## Desired State

**Single optimizer implementation:**
```
optimizers/
├── base/
│   └── Optimizer.ts            # Base interface
└── AdamOptimizer.ts           # Current implementation (keep)
```

Adam is sufficient for all our VI needs - no need for plain gradient descent.

## Design Principles

### Base Interface

```typescript
export interface OptimizerState {
  iteration: number;
  [key: string]: any;  // Algorithm-specific state
}

export abstract class Optimizer {
  abstract initialize(dimension: number): OptimizerState;
  
  abstract step(
    currentParams: number[],
    gradient: number[],
    state: OptimizerState
  ): number[];
  
  // Optional: adaptive learning rate
  adaptLearningRate?(state: OptimizerState): void;
}
```

### When to Use Adam

Adam is our single optimizer choice because it:
- Handles different parameter scales well
- Works for non-convex objectives
- Has proven stability in our VI implementation
- Default parameters work well: lr=0.001, β₁=0.9, β₂=0.999

## Current Adam Implementation

**Good aspects to keep**:
- Bias correction
- Gradient clipping
- Clean state management
- No external dependencies

**Potential improvements**:
- Add learning rate scheduling
- Better TypeScript types
- Configurable clipping

## Integration with VI

```typescript
class VariationalInference {
  constructor(
    private optimizer: Optimizer = new AdamOptimizer()
  ) {}
  
  async optimize(
    objective: (params: number[]) => number,
    gradient: (params: number[]) => number[],
    initialParams: number[]
  ): Promise<OptimizationResult> {
    let state = this.optimizer.initialize(initialParams.length);
    let params = [...initialParams];
    
    for (let iter = 0; iter < maxIterations; iter++) {
      const grad = gradient(params);
      params = this.optimizer.step(params, grad, state);
      
      if (this.hasConverged(params, grad)) break;
    }
    
    return { params, iterations: state.iteration };
  }
}
```

## Not Implementing

- Gradient Descent (Adam handles all our cases better)
- L-BFGS (needs line search, complex)
- Natural gradient (needs Fisher information)
- SGD variants (we have full batch)
- Second-order methods (Hessian too expensive)

## Performance Considerations

- Keep state minimal (memory efficiency)
- Use typed arrays for large problems
- Avoid allocations in hot loop
- Gradient clipping prevents instability

## Testing Requirements

1. **Convergence on convex problems**: Quadratic, etc.
2. **Handling of scales**: Different parameter magnitudes
3. **Numerical stability**: No NaN/Inf
4. **State management**: Restart capability