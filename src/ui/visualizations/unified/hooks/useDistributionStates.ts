import { useState, useEffect, useRef, useMemo } from 'react';
import { Distribution, DistributionState } from '../types';
import { PosteriorProxy } from '../../../../workers/PosteriorProxy';
import { calculateKDE, calculateHistogram } from '../../utils/statistics';

interface UseDistributionStatesOptions {
  distributions: Distribution[];
  nSamples: number;
  cacheSamples?: boolean;
  adaptiveSampling?: boolean;
}

export function useDistributionStates({
  distributions,
  nSamples = 10000, // Default to 10k samples - it's fast!
  cacheSamples = true,
  adaptiveSampling = false, // Usually not needed with 10k default
}: UseDistributionStatesOptions): DistributionState[] {
  const [states, setStates] = useState<Map<string, DistributionState>>(new Map());
  const sampleCache = useRef<Map<string, number[]>>(new Map());
  const generationId = useRef(0);

  // Initialize states for all distributions
  useEffect(() => {
    const newStates = new Map<string, DistributionState>();

    distributions.forEach((dist) => {
      const existing = states.get(dist.id);
      newStates.set(dist.id, {
        ...dist,
        samples: dist.samples || existing?.samples || null,
        loading: !dist.samples && !!dist.posterior,
        error: null,
        progress: 0,
        stats: existing?.stats,
        kde: existing?.kde,
        histogram: existing?.histogram,
      });
    });

    setStates(newStates);
    generationId.current++;
  }, [distributions]);

  // Generate samples for distributions with posteriors
  useEffect(() => {
    const currentGenId = generationId.current;

    distributions.forEach(async (dist) => {
      if (dist.samples || !dist.posterior) return;

      // Check cache
      if (cacheSamples && sampleCache.current.has(dist.id)) {
        const cachedSamples = sampleCache.current.get(dist.id)!;
        updateDistState(dist.id, {
          samples: cachedSamples,
          loading: false,
          progress: 100,
        });
        return;
      }

      try {
        // Start loading
        updateDistState(dist.id, { loading: true, progress: 0 });

        // Determine sample size
        const effectiveNSamples = adaptiveSampling
          ? getAdaptiveSampleSize(dist, nSamples)
          : nSamples;

        // Generate samples
        let samples: number[];

        // Check if the posterior exists
        if (!dist.posterior) {
          throw new Error(`Distribution ${dist.id} does not have a posterior`);
        }

        // Check if it's a CompoundPosterior (has getDecomposition method)
        if (
          (dist.posterior as any).getDecomposition &&
          typeof (dist.posterior as any).getDecomposition === 'function'
        ) {
          // This is a CompoundPosterior - it has its own sample method that properly
          // handles the joint distribution (frequency × severity with zero-inflation)
          const result = dist.posterior.sample(effectiveNSamples);
          samples = result instanceof Promise ? await result : result;
        } else if ((dist.posterior as any).__isCompoundProxy) {
          // Legacy CompoundPosteriorProxy handling - to be removed after worker migration
          throw new Error('CompoundPosteriorProxy is deprecated. Use CompoundPosterior directly.');
        } else if (dist.posterior instanceof PosteriorProxy) {
          // Regular proxy posterior
          samples = await dist.posterior.sample(effectiveNSamples);
        } else {
          // Sync posterior
          if (typeof dist.posterior.sample !== 'function') {
            throw new Error(`Distribution ${dist.id} posterior does not have a sample method`);
          }
          // Sync posterior - generate in batches
          samples = [];
          const batchSize = 1000;

          for (let i = 0; i < effectiveNSamples; i += batchSize) {
            if (currentGenId !== generationId.current) return; // Cancelled

            const batch = Math.min(batchSize, effectiveNSamples - i);
            // Get samples in batch for efficiency
            const batchSamples = dist.posterior.sample(batch);

            // Handle both sync and async results
            const resolvedSamples =
              batchSamples instanceof Promise ? await batchSamples : batchSamples;

            // Add samples to array
            if (Array.isArray(resolvedSamples)) {
              samples.push(...resolvedSamples);
            } else {
              samples.push(resolvedSamples);
            }

            // Update progress
            const progress = Math.min(99, ((i + batch) / effectiveNSamples) * 100);
            updateDistState(dist.id, { progress });

            // Yield to UI
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }

        if (currentGenId !== generationId.current) return; // Cancelled

        // Cache samples
        if (cacheSamples) {
          sampleCache.current.set(dist.id, samples);
        }

        // Calculate statistics
        const stats = calculateStats(samples);

        // Update state
        updateDistState(dist.id, {
          samples,
          stats,
          loading: false,
          progress: 100,
          error: null,
        });
      } catch (err) {
        if (currentGenId !== generationId.current) return; // Cancelled

        updateDistState(dist.id, {
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }, [distributions, nSamples, cacheSamples, adaptiveSampling]);

  // Helper to update a distribution's state
  function updateDistState(id: string, updates: Partial<DistributionState>) {
    setStates((prev) => {
      const newStates = new Map(prev);
      const existing = newStates.get(id);
      if (existing) {
        newStates.set(id, { ...existing, ...updates });
      }
      return newStates;
    });
  }

  // Convert map to array in distribution order
  return useMemo(() => {
    return distributions
      .map((d) => states.get(d.id))
      .filter((s): s is DistributionState => s !== undefined);
  }, [distributions, states]);
}

// Calculate statistics for a set of samples
function calculateStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  const mean = samples.reduce((sum, x) => sum + x, 0) / n;
  const variance = samples.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1);
  const std = Math.sqrt(variance);

  // Calculate multiple quantiles for flexible uncertainty visualization
  const quantile = (q: number) => sorted[Math.floor(n * q)];

  return {
    mean,
    median: quantile(0.5),
    std,
    // Multiple uncertainty intervals
    ci95: [quantile(0.025), quantile(0.975)] as [number, number],
    ci80: [quantile(0.1), quantile(0.9)] as [number, number],
    ci50: [quantile(0.25), quantile(0.75)] as [number, number],
    // Additional quantiles for continuous reasoning
    quantiles: {
      q01: quantile(0.01),
      q05: quantile(0.05),
      q10: quantile(0.1),
      q25: quantile(0.25),
      q50: quantile(0.5),
      q75: quantile(0.75),
      q90: quantile(0.9),
      q95: quantile(0.95),
      q99: quantile(0.99),
    },
    min: sorted[0],
    max: sorted[n - 1],
  };
}

// Determine adaptive sample size based on distribution characteristics
function getAdaptiveSampleSize(dist: Distribution, baseSamples: number): number {
  // Simple heuristic - could be enhanced
  if (dist.metadata?.isObserved) {
    return Math.min(baseSamples, 2000); // Less samples for observed
  }
  return baseSamples;
}
