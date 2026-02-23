# Understanding Revenue Lift Results

## What You're Looking At

When you run an experiment, we measure how each treatment affects revenue per customer. The visualization shows this in two complementary ways:

- **Percent lift**: How much better (or worse) compared to your baseline
- **Dollar lift**: The actual revenue difference per customer

Both views show the same experimental results, just in units that matter for different decisions. The bottom axis shows percentages, the top shows dollars—they're perfectly aligned because they represent the same outcomes.

## Reading the Distribution

Each ridge shows the range of plausible outcomes for that treatment variant. The visualization isn't showing you one number—it's showing you all the possibilities that fit your data.

**The dots and shaded areas** represent quantiles of the distribution. More dots in an area means that outcome is more likely. The spread shows your uncertainty: narrow distributions mean you have a precise estimate, wide distributions mean there's more uncertainty about the true effect.

**Example interpretation**:

- Bottom axis: "Treatment A is likely 10-25% better than Control"
- Top axis: "That typically means $0.80-$2.10 more revenue per customer"
- Together: "I'm fairly confident about a meaningful lift, but the exact magnitude varies"

## How Dollar and Percent Relate

The dollar lift you see depends on two things:

1. The percent improvement (how much relatively better)
2. Your baseline revenue (what you're improving from)

**Examples**:

- Control earns $10/customer, Treatment is 20% better → **$2.00 lift**
- Control earns $100/customer, Treatment is 20% better → **$20.00 lift**

Same percent, different dollars. That's why we show both.

We translate between these views using your Control group's typical revenue (the median across possible scenarios). This means the top axis shows "what $ lift typically goes with each % lift, given our uncertainty about the baseline."

## Using Thresholds for Decisions

The threshold line lets you ask business-relevant questions:

**Set a threshold to ask**: "What's the probability this beats my target?"

**Examples**:

- Drag the threshold to $1.50
- The visualization shows: "74% probability revenue lift exceeds $1.50"
- Equivalently: "74% probability percent lift exceeds 8.3%"

You can edit thresholds by clicking the labels at the bottom (percent) or top (dollar) of the chart. When you edit one, the other updates automatically because they represent the same question in different units.

## What "X% Probability" Means

When we say "78% probability above $1.00," we mean:

> In 78 out of 100 plausible scenarios that fit your data, the revenue lift exceeds $1.00 per customer.

This is not the same as a p-value or confidence level. It's a direct statement about outcomes:

- **Higher probability** = more confidence in exceeding your threshold
- **Lower probability** = more uncertainty, higher risk of missing target

The probability accounts for uncertainty in:

- Whether customers convert (frequency)
- How much they spend when they convert (intensity)
- Your baseline Control group's performance

## Making Better Decisions

Traditional A/B testing asks "is this statistically significant?" That's often the wrong question.

**Better questions**:

- "Is this improvement worth the engineering cost to ship?"
- "What's the expected value compared to implementation cost?"
- "What's the downside risk if we're in the bottom 20% of scenarios?"
- "How does this compare to other experiments we could run?"

**Use dollar lift for**: ROI calculations, budget decisions, prioritizing implementations

**Use percent lift for**: Comparing across experiments, understanding relative improvements, benchmarking

**Example decision framework**:

1. Implementation costs $5,000
2. Expected lift: $1.20/customer (median)
3. You have 10,000 customers/month
4. Expected monthly gain: $12,000
5. Payback in <1 month even in pessimistic scenarios
6. **Ship it**

Compare to:

1. Implementation costs $50,000
2. Expected lift: $1.20/customer (median)
3. Probability of >$0.50 lift: 82%
4. Probability of <$0.00 lift: 12%
5. Risk of negative outcome uncomfortably high given cost
6. **Run longer or test refinements first**

## Credible Intervals

The shaded regions and bound markers show credible intervals—ranges where the true effect is likely to be.

**By default**, we show an 80% credible interval (10th to 90th percentile):

- 80% probability the true lift is in this range
- 10% probability it's lower
- 10% probability it's higher

You can adjust these bounds by dragging them or using the controls. Narrower intervals give you more precision but less coverage. Wider intervals cover more possibilities but tell you less.

**Why 80% default?** It's a practical choice: narrow enough to be informative, wide enough to capture most plausible outcomes. You can always widen to 95% for more conservative decisions.

## What About Baseline Uncertainty?

Your Control group itself has uncertainty. If you ran the same experiment again with different Control customers, you'd get a slightly different baseline revenue.

This uncertainty **propagates through** to both the percent and dollar lifts. When we say "$1.50 typical lift," we're accounting for:

- Uncertainty in Treatment performance
- Uncertainty in Control performance
- Uncertainty in the revenue-per-converter for both

The visualization shows all of this together. You don't need to think about these components separately—just interpret the final distribution as "plausible outcomes given what we observed."

## Practical Tips

**When comparing multiple treatments**:

- Look for separation in distributions. Overlapping means uncertainty about which is better
- Use probability statements: "87% chance Treatment A > Treatment B"
- Consider expected value (median), not just probability of being best

**When results are uncertain** (wide distributions):

- Run longer to collect more data
- Consider testing a stronger treatment
- Lower your threshold if the current one isn't realistic

**When results are conclusive** (narrow distributions with high probability):

- Make the decision and move on
- Document expected value for post-implementation validation
- Share learnings with team

---

## Summary

This visualization helps you make informed decisions under uncertainty. It doesn't hide the uncertainty—it shows it clearly so you can account for it in your decisions.

- **Two views, same results**: Percent for relative comparisons, dollars for business value
- **Distributions, not points**: See the full range of plausible outcomes
- **Probability statements**: Direct answers to "how confident are we?"
- **Threshold-based decisions**: "Is this likely to beat our target?"
- **Business context first**: Focus on expected value and risk, not significance tests

If you're still asking "is it significant?", you're asking the wrong question. Ask instead: "Should we ship this?"
