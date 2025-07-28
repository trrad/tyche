import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface MixtureComponent {
  mean: number;
  variance: number;
  weight: number;
}

interface MixtureComponentVizProps {
  components: MixtureComponent[];
  title?: string;
  formatValue?: (value: number) => string;
}

const COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981']; // Purple, Pink, Amber, Green

/**
 * Visualize mixture model components with weights and parameters
 */
export const MixtureComponentViz: React.FC<MixtureComponentVizProps> = ({
  components,
  title = 'Mixture Components',
  formatValue = (v) => v.toFixed(2)
}) => {
  // Prepare data for pie chart
  const pieData = components.map((comp, idx) => ({
    name: `Comp ${idx + 1}`,
    value: comp.weight * 100, // Convert to percentage
    mean: comp.mean,
    std: Math.sqrt(comp.variance)
  }));

  // Custom label function
  const renderLabel = (entry: any) => {
    return `${entry.value.toFixed(1)}%`;
  };

  return (
    <div className="mixture-component-viz bg-white p-4 rounded-lg shadow-sm">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie Chart for Weights */}
        <div>
          <h5 className="text-xs text-gray-600 mb-2 text-center">Component Weights</h5>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderLabel}
                outerRadius={50}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => `${value.toFixed(1)}%`}
                contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Component Parameters */}
        <div>
          <h5 className="text-xs text-gray-600 mb-2">Parameters</h5>
          <div className="space-y-1">
            {components.map((comp, idx) => (
              <div 
                key={idx} 
                className="flex items-center space-x-2 p-1.5 rounded text-xs"
                style={{ backgroundColor: `${COLORS[idx % COLORS.length]}10` }}
              >
                <div 
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <div className="flex-1">
                  <span className="font-medium">C{idx + 1}:</span>
                  <span className="ml-1">μ={formatValue(comp.mean)}, σ={formatValue(Math.sqrt(comp.variance))}</span>
                </div>
                <div className="font-medium">
                  {(comp.weight * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Calculate a simple measure of component separation
 */
function calculateSeparation(components: MixtureComponent[]): string {
  if (components.length < 2) return 'N/A';
  
  // Sort by mean
  const sorted = [...components].sort((a, b) => a.mean - b.mean);
  
  // Calculate minimum separation in standard deviations
  let minSeparation = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].mean - sorted[i-1].mean;
    const avgStd = Math.sqrt((sorted[i].variance + sorted[i-1].variance) / 2);
    const separation = gap / avgStd;
    minSeparation = Math.min(minSeparation, separation);
  }
  
  if (minSeparation < 1) return 'Poor';
  if (minSeparation < 2) return 'Moderate';
  if (minSeparation < 3) return 'Good';
  return 'Excellent';
} 