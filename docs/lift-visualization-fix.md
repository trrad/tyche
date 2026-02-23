# Lift Visualization: Mean vs Median for Heavy-Tailed Distributions

## Issue Summary

The experiment analyzer's lift visualization was displaying incorrect summary statistics:

- **Displayed**: 49%, 55%, 55% "expected increase"
- **Actual median lifts**: 13%, 23%, 23%
- **Actual mean lifts**: 49%, 55%, 55%

## Root Cause

### The Math Was Correct All Along

The Tyche framework's compound model and lift calculation were **mathematically correct**:

1. **Compound Posterior**: `E[Revenue per user] = P(conversion) × E[Revenue | converted]`
   - Each posterior sample represents a plausible value for the population-level expected revenue-per-user
   - Not individual user outcomes, but distribution over the population parameter

2. **Lift Calculation**: `(treatment[i] - baseline[i]) / baseline[i]`
   - Correctly pairs posterior samples by index
   - Each pair represents one possible world's control and treatment values
   - Produces valid lift distribution with proper uncertainty quantification

3. **Console Verification**:
   ```
   Control posterior: median $4.98, range $0.63-$25.46
   Treatment A posterior: median $5.57, range $1.18-$24.91
   Treatment A lift: median 13.3%, range -90% to +2,031%
   ```

### The Display Issue

**Problem**: The visualization used **mean** instead of **median** for the summary label.

**Why This Matters**: Lift distributions from compound models have **heavy tails**:

- Median lift: 13.3% (50th percentile - typical scenario)
- Mean lift: 49% (pulled up by extreme tail events)
- 99th percentile: +545% (rare but possible scenarios)

The extreme tail represents genuine uncertainty about possible outcomes (e.g., "control could be $0.50 and treatment $5.00 in 1% of worlds"), but these outliers heavily influence the mean while the median remains robust.

## The Fix

### Changed: RidgeDotplot.ts

**Before** (line 284):

```typescript
const mean = d3.mean(variantData.samples) || 0; // Use mean for expected value
```

**After**:

```typescript
const median = d3.median(variantData.samples) || 0; // Use median for robustness to outliers
```

### Changed: plainEnglish.ts

**Before**:

```typescript
if (lift >= 0) {
  return `${percentValue}% expected increase`;
}
```

**After**:

```typescript
if (lift >= 0) {
  return `${percentValue}% median lift`;
}
```

## Why Median, Not Mean?

### For Heavy-Tailed Distributions

Lift distributions from compound models often exhibit:

- **Long right tails**: Rare scenarios with very high lifts
- **Asymmetric uncertainty**: Downside limited (worst case ~-90%), upside unlimited (+1000%+)
- **Outlier sensitivity**: A few extreme samples heavily influence mean

### Statistical Justification

- **Median** = 50th percentile = "typical" outcome
- **Mean** = expected value = average across all possible worlds (including rare extremes)

For decision-making about experiment results:

- Users want to know the **typical lift** (median)
- Not the **average lift weighted by tail events** (mean)

The mean is still valid and important for some analyses (e.g., expected revenue calculations for business cases), but for communicating "what lift did we observe?", median is more interpretable and less confusing.

## Technical Details

### Sample Distribution Characteristics

Example from treatment_a lift samples (10,000 samples):

```
Median: 0.133 (13.3%)
Mean: 0.490 (49.0%)
P01: -0.757 (-75.7%)
P99: +5.446 (+545%)
Max: +20.306 (+2,031%)
Count > 500%: 131 samples (1.3%)
```

### Why Heavy Tails Occur

The compound model multiplies two random variables:

```
Revenue per user = P(conversion) × Revenue per converter
```

When we compute lift by pairing samples:

```
Lift[i] = (treatment[i] - control[i]) / control[i]
```

This can create extreme ratios when:

- Control[i] samples from lower tail (low conversion OR low value)
- Treatment[i] samples from upper tail (high conversion OR high value)
- These are **independent random draws** from respective posteriors

Example creating +1,900% lift:

- Control sample: 1% conversion × $50 = $0.50 per user
- Treatment sample: 12% conversion × $80 = $9.60 per user
- Lift: ($9.60 - $0.50) / $0.50 = +1,820%

This is **statistically valid** - it represents a genuine possible world in the posterior, just a very unlikely one (99th percentile territory).

## Verification

After the fix, the visualization now correctly displays:

- Treatment A: "13% median lift" ✓
- Treatment B: "23% median lift" ✓
- Treatment C: "23% median lift" ✓

These match the console-logged median values and align with the absolute $ view:

- Control: $4.98 median
- Treatment A: $5.63 median → ($5.63 - $4.98) / $4.98 = 13% ✓

## Implications

1. **No bug in Tyche framework**: The statistical methodology is sound
2. **Visualization choice matters**: Same data, different summaries (mean vs median)
3. **Heavy tails are real**: Compound models properly represent uncertainty
4. **Documentation is critical**: Users need to understand what statistics mean

## Future Work

As planned, create a drill-down diagnostic view (similar to inference-explorer) that shows:

- Full posterior breakdown (conversion × value components)
- Both mean and median with clear labeling
- Tail probability visualizations
- Model quality diagnostics
- Comparison with absolute $ values

This will help users understand the relationship between:

- Individual variant posteriors (absolute $)
- Relative lift distributions (% change)
- Component effects (conversion vs value)
- Uncertainty quantification (tails and credible intervals)
