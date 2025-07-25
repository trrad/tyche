# Compound Models

Models that decompose business metrics into interpretable components, enabling separate analysis of different aspects of customer behavior.

## Core Concept

Compound models separate "whether" from "how much":
- **State Model**: Currently Beta for binary outcomes (did event occur?)
- **Value Model**: Flexible continuous distributions (given occurrence, what was the magnitude?)

This decomposition aligns with business thinking and enables more targeted interventions.

## Model Architecture

### State Model
Currently always **Beta-Binomial** for conversion probability. Future versions may support other state models (categorical, ordinal) but binary covers most use cases.

### Value Models
Flexible based on data characteristics:

#### LogNormal Mixture (Default for E-commerce)
- **Use Case**: Revenue data with natural customer segments
- **Components**: 2-3 LogNormal distributions
- **Why**: Most customer bases have distinct purchasing patterns (e.g., small basket vs bulk buyers)
- **Inference**: EM algorithm with conjugate updates

#### LogNormal  
- **Use Case**: Heavy-tailed positive data when unimodal
- **When**: Fallback if mixture model not needed
- **Inference**: Conjugate via Normal-Inverse-Gamma prior

#### Gamma
- **Use Case**: Positive metrics with lighter tails
- **Examples**: Session duration, bounded positive values
- **Inference**: Conjugate updates (planned)

#### Normal
- **Use Case**: Symmetric continuous metrics  
- **Examples**: Rating changes, NPS differences
- **Inference**: Conjugate updates

## Example Configurations

### E-commerce Revenue (Recommended Default)
```javascript
const revenueModel = {
  state: new BetaBinomial(),
  value: new LogNormalMixture(k=2)  // Captures typical segment structure
};
```

### User Engagement Time
```javascript
const engagementModel = {
  state: new BetaBinomial(),  
  value: new Gamma()  // Bounded positive distribution
};
```

### NPS or Rating Changes
```javascript
const ratingModel = {
  state: new BetaBinomial(),  // Did they change rating?
  value: new Normal()         // How much did it change?
};
```

Compound models are designed to work within causal tree nodes:

```javascript
class CausalTreeNode {
  // Segmentation handled by tree structure
  fitModel(data) {
    const model = new CompoundModel();
    
    // Conversion component
    model.conversion = new BetaBinomial();
    
    // Revenue component - can be mixture if multimodal
    if (detectMultimodality(data)) {
      model.amount = new LogNormalMixture(k=2);
    } else {
      model.amount = new LogNormalBayesian();
    }
    
    return model.fit(data);
  }
}
```

The causal tree handles population segmentation (mobile vs desktop, weekend vs weekday), while compound models handle the revenue decomposition within each segment.

## Posterior Computations

### Expected Value
For compound model with conversion rate p and amount distribution A:
```
E[Revenue] = E[p] × E[A]  (first-order approximation)
```

For full uncertainty propagation, use Monte Carlo:
```javascript
samples = [];
for (i = 0; i < N; i++) {
  p_i = conversionPosterior.sample();
  a_i = amountPosterior.sample();
  samples.push(p_i * a_i);
}
```

### Heterogeneous Treatment Effects

Compound models enable richer effect discovery in causal trees:
- Some tree nodes may show conversion lift only
- Others may show amount lift only  
- Trees can identify these patterns separately and attribute them to specific segments

## Implementation Notes

- Models are fit independently, maintaining conjugacy
- No information sharing between components (unlike zero-inflated models)
- Interpretation remains straightforward for business users
- Segmentation is handled by causal trees, not mixture modeling
- Within each tree node, the amount component can itself be a mixture if the revenue distribution is multimodal