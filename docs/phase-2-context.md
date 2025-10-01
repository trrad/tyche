# docs/phase-2-context.md

# Phase 2: Domain Layer & Business Analysis Context

## Phase Goal

Build the business layer that orchestrates statistical engines to answer real questions. This is where statistics meets business value.

## Key Architectural Decisions

### Analyzer Framework (2.1)

- **Pattern**: Two types - ExperimentAnalyzer and DatasetAnalyzer
- **Why**: Clear separation of comparing vs. analyzing
- **Key insight**: Analyzers orchestrate engines, they don't do statistics
- **Examples**: ConversionAnalyzer, RevenueAnalyzer, PriorLearner

### Result Objects (2.2)

- **Pattern**: Runtime capability detection
- **Why**: Not all models support all features
- **Key methods**: `getDecomposition()` returns null if not compound
- **Important**: `getComponents()` is for mixture components, NOT user segments

### Business Decomposition (2.3)

- **Pattern**: revenue = conversion × value
- **Why**: Answers "is it more users or higher value?"
- **Flexibility**: Value distribution not limited to LogNormal
- **Output**: Percentage contribution from each factor

### Prior Elicitation (2.4)

- **Pattern**: Return Distribution objects directly
- **Why**: No separate Prior interface needed
- **Key helper**: `elicitBeta()` for non-statisticians
- **Confidence levels**: Translate to effective sample size

### Industry Presets (2.5)

- **Pattern**: Complete configuration packages
- **Why**: Get started quickly with sensible defaults
- **Examples**: E-commerce (10% conversion), SaaS (17.5% trial conversion)

### Worker Pool (2.6)

- **Pattern**: Generic task execution infrastructure
- **Why**: Needed for EM, bootstrap, power analysis
- **Key feature**: Progress reporting and cancellation
- **Blocks**: Power analysis in Phase 3

## Common Pitfalls

1. **Don't put statistics in analyzers** - They orchestrate engines
2. **Don't assume capabilities** - Check at runtime
3. **Don't hardcode distributions** - Use what routing selects
4. **Don't forget progress callbacks** - Long operations need feedback

## Testing Strategy

- Test analyzers with multiple engine types
- Verify decomposition math
- Test prior elicitation with edge cases
- Test worker pool with timeouts and cancellation

## Dependencies

- Depends on Phase 1: Uses engines and result base classes
- Provides to Phase 3: Worker pool for parallel computation

## Code Locations

- Existing analyzer logic scattered in various files
- Look for business logic mixed with statistics
- Worker infrastructure partially exists

## Success Metrics

- [ ] Clean separation of business and statistics
- [ ] Runtime capability detection working
- [ ] Effect decomposition for compound models
- [ ] Prior elicitation helpers
- [ ] Industry presets defined
- [ ] Worker pool handling parallel tasks

## ⚠️ Phase 2 Revised Structure

**Note**: Phase 2 has been restructured to prioritize the three-layer API architecture. See:
- `docs/phase-2-revised.md` - Complete revised plan
- `docs/API-layers.md` - Three-layer API specification

### Key Changes in Revision

#### Enhanced Scope (Phase 2A)
- **Result Objects (#108)**: Now includes full posterior comparisons
- **Business Decomposition (#82)**: Now propagates uncertainty throughout
- **Analyzer Framework (#81)**: Unchanged foundation

#### New API Layers (Phase 2B)
- **Layer 1**: Simple Opinionated API (incorporates #93 Natural Language)
- **Layer 2**: Statistical Operations API (merges #92 Fluent API)
- **Layer 3**: Visualization API Foundation

#### Moved to Phase 4
- **Worker Pool (#85)**: Moved to Phase 4 (performance optimization)
- **Power Analysis (#91)**: Moved to Phase 4 (depends on workers)

#### Why This Matters
The original Phase 2 architecture is still valid for business logic orchestration. The revision adds the critical user interface layer that makes the statistical capabilities accessible per CoreVision.md's "Excel user" goal.

**Implementation Strategy**: Complete the foundation work described in this document, then layer the new API architecture on top.
