# UI Components and Visualizations

React components for user interfaces and data visualization.

## Current Structure

```
ui/
├── components/
│   └── RevenueDataGenerator.tsx  # Data generation UI (may be unused)
└── visualizations/              # Complete visualization system
    ├── unified/                 # Main visualization framework
    ├── base/                   # Shared utilities and hooks
    └── README.md               # Detailed visualization docs
```

## Visualizations

The `/visualizations/` subdirectory contains a complete system for plotting distributions and results. See the [visualizations README](visualizations/README.md) for details.

Key features:
- Unified API for all distribution plots
- Async posterior support (WebWorker integration)
- Multiple display modes (density, histogram, ridge, etc.)
- Comparison visualizations
- Posterior predictive checks

## Components

Currently minimal - most UI logic lives directly in the example apps.

### RevenueDataGenerator

A React component for generating synthetic revenue data with configurable:
- Sample sizes
- Conversion rates  
- Revenue distributions (normal, lognormal, uniform, mixed)
- Outlier injection

Status: May not be actively used - check example apps.

## TODO: Component Extraction

Much of the UI logic currently lives in `/examples/inference-explorer.tsx` and should be refactored into reusable components:

- Model selection UI
- Data source picker
- Progress indicators
- Results display panels
- Prior configuration forms

This would make it easier to build new analysis tools without recreating common UI patterns.

## Mobile Considerations

The visualization components are desktop-first but viewable on mobile. For future component development:
- **Viewing**: Optimize for mobile viewing of results
- **Editing**: Keep complex interactions desktop-focused
- **Sharing**: Ensure shareable links work on all devices