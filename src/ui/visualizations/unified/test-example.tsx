import React from 'react';
import { UnifiedDistributionViz } from './UnifiedDistributionViz';

/**
 * Simple test example for UnifiedDistributionViz
 */
export const TestUnifiedViz: React.FC = () => {
  // Mock data for testing
  const mockPosterior = {
    sample: () => [Math.random() * 10 + 5], // Random samples between 5-15
    mean: () => [10],
    variance: () => [4],
    credibleInterval: (level: number) => [[8, 12]]
  } as any;
  
  const mockObservedData = Array.from({ length: 100 }, () => Math.random() * 10 + 5);
  
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">UnifiedDistributionViz Test</h2>
      
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">Single Distribution</h3>
        <UnifiedDistributionViz
          distributions={[{
            id: 'test',
            label: 'Test Distribution',
            posterior: mockPosterior
          }]}
          width={600}
          height={400}
          title="Test Single Distribution"
        />
      </div>
      
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">PPC Example</h3>
        <UnifiedDistributionViz
          distributions={[
            {
              id: 'observed',
              label: 'Observed Data',
              samples: mockObservedData,
              color: '#6b7280',
              metadata: { isObserved: true, variantIndex: 0 }
            },
            {
              id: 'predictive',
              label: 'Posterior Predictive',
              posterior: mockPosterior,
              color: '#3b82f6'
            }
          ]}
          display={{
            mode: 'density',
            showCI: true,
            ciLevels: [0.8, 0.5]
          }}
          title="Posterior Predictive Check"
          subtitle="Model fit assessment"
          width={600}
          height={400}
        />
      </div>
      
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-2">A/B Test Example</h3>
        <UnifiedDistributionViz
          distributions={[
            {
              id: 'control',
              label: 'Control',
              posterior: mockPosterior,
              metadata: { isBaseline: true }
            },
            {
              id: 'treatment',
              label: 'Treatment',
              posterior: mockPosterior,
              metadata: { variantIndex: 1 }
            }
          ]}
          comparison={{
            mode: 'difference',
            baseline: 'control',
            showProbabilityOfImprovement: true
          }}
          display={{
            mode: 'density',
            showMean: true,
            showCI: true,
            ciLevels: [0.8, 0.5]
          }}
          title="A/B Test Example"
          subtitle="Treatment effect distribution"
          width={600}
          height={400}
        />
      </div>
    </div>
  );
}; 