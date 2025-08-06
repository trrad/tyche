# docs/phase-4-context.md

# Phase 4: Application Layer & Polish Context

## Phase Goal

Make Tyche accessible and resilient. Create the API surface, handle errors gracefully, and showcase capabilities.

## Key Architectural Decisions

### Fluent API (4.1)

- **Pattern**: Progressive disclosure through method chaining
- **Why**: Simple things simple, complex things possible
- **Entry points**: `experiment()`, `analyze()`, `plan()`
- **Builder pattern**: Each method returns `this`

### Natural Language Insights (4.2)

- **Pattern**: Template-based generation
- **Why**: Non-statisticians need plain English
- **Key types**: findings, warnings, recommendations
- **Confidence levels**: Reflect uncertainty in language

### Error Recovery (4.3)

- **Pattern**: Fallback strategies using TycheError
- **Why**: Don't fail if simpler approach works
- **Strategies**: Simplify model, increase iterations, use conjugate
- **Uses**: TycheError from Phase 0 for error codes

### Embeddable Visualizations (4.4)

- **Pattern**: Standalone bundles
- **Why**: Share results without Tyche dependency
- **Formats**: React component or vanilla JS
- **Key constraint**: Minimal bundle size

### Demo Application (4.5)

- **Pattern**: Progressive journey through capabilities
- **Steps**: Simple A/B → Revenue → Segments → HTE
- **Why**: Show progressive disclosure principle
- **Each step**: Builds on previous learning

## Common Pitfalls

1. **Don't expose internals** - API should hide complexity
2. **Don't use technical jargon** - Natural language for insights
3. **Don't fail hard** - Try recovery strategies
4. **Don't bloat bundles** - Minimal dependencies
5. **Don't skip the demo** - It's the showcase

## Testing Strategy

- Test fluent API chains
- Verify insight text generation
- Test error recovery strategies
- Check bundle sizes
- User test the demo flow

## Dependencies

- Depends on all previous phases
- Uses TycheError from Phase 0 for recovery

## Implementation Notes

### Error Recovery

```typescript
// Order matters - try least invasive first
[
  new IncreaseIterations(),    // Just try harder
  new SimplifyModel(),          // Reduce components
  new FallbackToConjugate()     // Use simpler algorithm
]

Natural Language

Use confidence to choose words ("likely" vs "possibly")
Include caveats when assumptions questionable
Focus on actionable insights

Demo Flow

Start with conversion (everyone understands)
Add revenue (show decomposition)
Manual segments (hypothesis-driven)
Discovered segments (data-driven)
Full HTE (everything together)

Success Metrics

 Fluent API feels natural
 Insights understandable by non-statisticians
 Errors recover gracefully
 Visualizations embeddable
 Demo tells compelling story
```
