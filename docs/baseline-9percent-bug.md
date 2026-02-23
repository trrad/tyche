# CRITICAL BUG: Control Baseline Showing ~9% Mean Instead of ~0%

## Summary

When visualizing the control baseline (self-comparison) in RidgeDotplot, the posterior distribution has a mean of approximately **9%** instead of the expected **~0%**. This is far outside normal sampling variation and indicates a fundamental issue with either the data, the model, or the prior.

## Symptoms

1. **Control variant displays incorrect lift values:**
   - Dollar lift: `+$0.00/user` ✓ (correct)
   - Percent lift: `▲9% lift` ✗ (should be ~0%)

2. **Blue reference line (mean) is misaligned:**
   - Positioned at ~9% on the axis instead of 0%
   - Does not align with the 0% tick mark

3. **Raw posterior statistics:**
   - `d3.mean(controlVariant.samples)` ≈ 0.09 (9%)
   - Expected for self-comparison: ≈ 0.00 (within 0.1-0.5% sampling noise)

## Why This Is NOT Normal

For a self-comparison with **10,000 posterior samples**, the expected sampling error is:

- **Typical range**: 0.1% - 0.5%
- **Observed**: 9%
- **Magnitude of error**: **18x - 90x too high**

This strongly suggests the issue is NOT random noise, but a systematic problem.

## Possible Root Causes

### 1. **Informative Prior Pulling Posterior Away from 0**

- If the prior is centered at a non-zero value (e.g., Normal(0.09, σ))
- Or if prior has too much influence relative to data
- **Check**: Review Tyche's prior specification for baseline comparisons

### 2. **Not Actually a Self-Comparison**

- The "control" variant might be compared to a different baseline
- Data processing error: wrong samples assigned to control
- **Check**: Verify that `isBaseline` flag is correctly set
- **Check**: Trace back where `controlVariant.samples` comes from

### 3. **Beta-Binomial / Gamma-Gamma Modeling Artifact**

- Conjugate prior structure may introduce bias
- Hierarchical model shrinkage toward a group mean
- **Check**: Review Tyche's `RevenueLift` model implementation
- **Check**: Examine how baseline posteriors are generated

### 4. **Data Processing Bug**

- Samples computed incorrectly during posterior generation
- Off-by-one error in sample indexing
- Conversion error between internal representation and output
- **Check**: Add logging in Tyche's sample generation
- **Check**: Verify `samples` array directly from Tyche output

## Investigation Steps

### Step 1: Inspect Raw Sample Values

```typescript
// In demo/test code:
console.log('Control samples (first 20):', controlVariant.samples.slice(0, 20));
console.log('Mean:', d3.mean(controlVariant.samples));
console.log('Median:', d3.median(controlVariant.samples));
console.log('Min:', d3.min(controlVariant.samples));
console.log('Max:', d3.max(controlVariant.samples));
```

### Step 2: Verify Baseline Flag

```typescript
// In RidgeDotplot rendering:
console.log('Variant:', variantData.name);
console.log('isBaseline:', variantData.isBaseline);
console.log('Mean of samples:', d3.mean(variantData.samples));
```

### Step 3: Check Tyche's Posterior Generation

- Review `src/analysis/RevenueLift.ts` (or equivalent)
- Look for prior specifications
- Check how baseline (control vs control) posteriors are computed
- Verify no hard-coded offsets or bias terms

### Step 4: Compare to Raw Experiment Data

```typescript
// If you have access to raw experiment observations:
const controlRevenue = [...]; // Raw revenue values
const controlRevenue2 = [...]; // Same control group (self-comparison)
// Run Tyche comparison and check posterior
```

## Files Involved

- **[src/visualizations/core/RidgeDotplot.ts](../src/visualizations/core/RidgeDotplot.ts)**: Visualization (symptoms visible here)
  - Lines 304-321: Mean calculation and display
  - Lines 397-411: Mean reference line positioning
  - Lines 419-484: Label rendering

- **Tyche core library** (location TBD):
  - Prior specification
  - Posterior sampling logic
  - Baseline comparison handling

## Previous Hacky Fix (REVERTED)

The following code was temporarily added but has been **REVERTED** because it masks the root cause:

```typescript
// REMOVED - DO NOT RE-ADD:
const displayMean = variantData.isBaseline ? 0 : mean;
const displayEffect = variantData.isBaseline ? 0 : effectMean;
```

This forced the visualization to display 0 for baselines, but the underlying posterior still had mean ~9%. Masking the symptom prevents proper debugging.

## Expected Outcome

After fixing the root cause:

- Control baseline should have `mean(samples) ≈ 0.00` (within ±0.5% max)
- Blue reference line should align with 0% axis tick
- Label should display `▲0% lift` (or `±0% lift` to indicate baseline)

## Notes

- This issue was discovered during dual-scale ($ and %) visualization development
- Ghost label cleanup and typography fixes are independent and working correctly
- The 9% offset appears consistent across different demo data (not a one-off fluke)

---

**Status**: OPEN - Root cause not yet identified
**Priority**: HIGH - Affects core statistical validity of results display
**Last Updated**: 2025-11-27
