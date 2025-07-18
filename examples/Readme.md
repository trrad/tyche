# Tyche Demo Applications

This directory contains demo applications showcasing Tyche's capabilities.

## Available Demos

### 1. A/B Test Demo (Classic)
- **File**: `ab-test-app.ts` → `ab-test-demo.html`
- **Description**: Original vanilla TypeScript demo showing basic A/B test analysis with interactive uplift visualization
- **Features**: 
  - Beta-Binomial posterior inference
  - Real-time probability calculations
  - Interactive uplift distribution graph

### 2. Combined Analysis Demo (React)
- **File**: `combined-demo.tsx` → `combined-demo.html`
- **Description**: New React-based demo showing both simple A/B tests and conversion+revenue analysis
- **Features**:
  - True Bayesian credible intervals from posterior samples
  - Revenue per user analysis with outlier detection
  - Data import and automatic distribution detection
  - Side-by-side comparison of approaches

## Running the Demos

```bash
# Run the default demo (Combined Analysis)
npm run dev

# Run specific demos
npm run dev:ab        # Classic A/B Test Demo
npm run dev:combined  # Combined Analysis Demo (default)

# Or with environment variable
DEMO=ab-test npm run dev
DEMO=combined npm run dev
```

## File Structure

```
examples/
├── ab-test-app.ts         # Classic A/B test implementation
├── ab-test-demo.html      # Entry point for classic demo
├── combined-demo.tsx      # React combined analysis component
├── combined-demo.html     # Entry point for React demo
└── README.md             # This file
```

## Adding New Demos

1. Create your demo file (`.ts` or `.tsx`)
2. Create a corresponding HTML entry point
3. Add it to `vite.config.ts`:
   ```typescript
   const demos = {
     'my-demo': {
       entry: '/examples/my-demo.html',
       name: 'My Demo Description'
     }
   };
   ```
4. Add a script in `package.json`:
   ```json
   "dev:my-demo": "DEMO=my-demo vite"
   ```