import * as d3 from 'd3';

/**
 * Common value formatters
 */
export const Formatters = {
  percentage: (decimals: number = 1) => (d: number) => `${(d * 100).toFixed(decimals)}%`,
  
  currency: (decimals: number = 0) => (d: number) => `$${d.toFixed(decimals)}`,
  
  siPrefix: (decimals: number = 1) => {
    const format = d3.format(`.${decimals}s`);
    return (d: number) => format(d).replace('G', 'B'); // Use B for billion
  },
  
  number: (decimals: number = 0) => (d: number) => d.toFixed(decimals),
  
  // Smart formatter based on value type
  auto: (value: number, type?: string) => {
    if (type === 'percentage' || (value >= 0 && value <= 1)) {
      return Formatters.percentage(1)(value);
    }
    if (type === 'currency' || type?.includes('revenue') || type?.includes('value')) {
      return Formatters.currency(0)(value);
    }
    if (Math.abs(value) >= 1000) {
      return Formatters.siPrefix(1)(value);
    }
    return Formatters.number(2)(value);
  }
}; 