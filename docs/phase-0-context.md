# docs/phase-0-context.md

# Phase 0: Foundation Context

## Phase Goal

Establish the foundational patterns and abstractions that all subsequent work builds upon. This phase is about getting the architecture right, not adding new features.

## Key Architectural Decisions

### Error Handling (0.1)

- **Pattern**: Use TycheError everywhere with error codes
- **Why**: Enables error recovery strategies in Phase 4
- **Migration**: Replace `throw new Error()` with `throw new TycheError()` as you touch files

### Data Model (0.2)

- **Pattern**: Only two data types - `binomial` and `user-level`
- **Why**: Simplifies routing logic and reduces complexity
- **Migration**: Update tests incrementally, don't do a big-bang migration
- **Key insight**: DataQuality indicators computed once, used everywhere

### Distributions (0.3a, 0.3b)

- **Pattern**: Pure mathematical objects with NO inference logic
- **Why**: Reusability across different inference engines
- **Preserve**: The math is correct - extract it, don't rewrite it
- **Watch for**: `fit()` methods - these belong in engines, not distributions

### Routing (0.4)

- **Pattern**: Capability-based selection using data quality indicators
- **Why**: Replaces brittle if/else chains scattered everywhere
- **Key files**: Look for hardcoded model selection in analyzers

## Common Pitfalls

1. **Don't add features** - This phase is refactoring only
2. **Don't break tests** - Keep suite green during migration
3. **Don't rewrite math** - Extract and consolidate existing implementations
4. **Don't over-engineer** - Simple, clear patterns over clever abstractions

## Testing Strategy

- Unit tests for each new pattern (TycheError, StandardData, etc.)
- Keep existing integration tests passing
- Add migration tests that verify old→new data format conversion
- Test error context preservation

## Dependencies

- No external dependencies on later phases
- This is the foundation - everything depends on Phase 0

## Code Locations to Audit

- `/inference/` - Mixed distribution/inference logic
- `/core/distributions/` - Existing distribution implementations
- `vi-engine.ts` - VI implementation with embedded distributions
- Various analyzers - Hardcoded model selection logic

## Success Metrics

- [ ] All errors use TycheError with proper codes
- [ ] StandardData used everywhere (no other data formats)
- [ ] Pure distribution objects extracted
- [ ] Model routing centralized in ModelRouter
- [ ] Zero test failures during migration
