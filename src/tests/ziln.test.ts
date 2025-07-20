// src/tests/debug-zi-model.test.ts
import { describe, test, expect } from 'vitest';
import { ZeroInflatedLogNormalVI } from '../vi-engine';
import jStat from 'jstat';

describe.skip('Debug Zero-Inflated Model', () => {
  test('debug model selection data characteristics', async () => {
    // Inline data generation to avoid importing from test files
    function generateZeroInflatedLogNormal(zeroProb: number, logMean: number, logStd: number, n: number) {
      const data: number[] = [];
      const numZeros = Math.round(n * zeroProb);
      
      // Add zeros
      for (let i = 0; i < numZeros; i++) {
        data.push(0);
      }
      
      // Add non-zeros
      for (let i = numZeros; i < n; i++) {
        const z = jStat.normal.sample(0, 1);
        data.push(Math.exp(logMean + logStd * z));
      }
      
      // Shuffle
      for (let i = data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [data[i], data[j]] = [data[j], data[i]];
      }
      
      return data;
    }
    
    // Recreate the problematic data generation
    const normalSamples: number[] = [];
    while (normalSamples.length < 21) {
      const sample = jStat.normal.sample(0, 1);
      if (sample > 0) {
        normalSamples.push(sample);
      }
    }
    
    const ziData = [
      ...Array(9).fill(0),  // 9 zeros
      ...normalSamples.map(x => Math.exp(x))  // 21 non-zeros
    ];
    
    console.log('\n=== Data Analysis ===');
    console.log('Total points:', ziData.length);
    console.log('Zeros:', ziData.filter(x => x === 0).length);
    console.log('Non-zeros:', ziData.filter(x => x > 0).length);
    
    const nonZeros = ziData.filter(x => x > 0);
    console.log('\nNon-zero value distribution:');
    console.log('  Min:', Math.min(...nonZeros).toFixed(6));
    console.log('  Max:', Math.max(...nonZeros).toFixed(6));
    console.log('  Mean:', (nonZeros.reduce((a,b) => a+b) / nonZeros.length).toFixed(6));
    console.log('  First 5 values:', nonZeros.slice(0, 5).map(x => x.toFixed(4)));
    
    // Analyze on log scale
    const logNonZeros = nonZeros.map(x => Math.log(x));
    console.log('\nLog-scale analysis:');
    console.log('  Mean of logs:', jStat.mean(logNonZeros).toFixed(4));
    console.log('  Std of logs:', Math.sqrt(jStat.variance(logNonZeros, true)).toFixed(4));
    console.log('  Min log:', Math.min(...logNonZeros).toFixed(4));
    console.log('  Max log:', Math.max(...logNonZeros).toFixed(4));
    
    // Check for values close to zero
    const verySmall = nonZeros.filter(x => x < 0.01);
    console.log('\nValues < 0.01:', verySmall.length);
    if (verySmall.length > 0) {
      console.log('  Smallest values:', verySmall.sort((a,b) => a-b).slice(0, 5));
    }
    
    // Compare to standard generator
    console.log('\n=== Comparison to Standard Generator ===');
    const standardData = generateZeroInflatedLogNormal(0.3, 0, 0.5, 30);
    const standardNonZeros = standardData.filter(x => x > 0);
    const standardLogNonZeros = standardNonZeros.map(x => Math.log(x));
    console.log('Standard generator log-mean:', jStat.mean(standardLogNonZeros).toFixed(4));
    console.log('Standard generator log-std:', Math.sqrt(jStat.variance(standardLogNonZeros, true)).toFixed(4));
    
    // Now fit with debugging
    const vi = new ZeroInflatedLogNormalVI({ 
      debugMode: true, 
      maxIterations: 10  // Just a few iterations to see initialization
    });
    
    console.log('\n=== Starting Fit ===');
    const result = await vi.fit({ data: ziData });
    
    console.log('\n=== Final Result ===');
    console.log('Estimated zero prob:', result.posterior.mean()[0]);
    console.log('Final params:', (result.posterior as any).params);
  });
});