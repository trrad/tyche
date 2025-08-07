/**
 * Inference Worker - handles computationally intensive inference algorithms
 *
 * Following the worker contract from InterfaceStandards.md:
 * - Workers operate only on primitive types and plain objects
 * - No class instances cross worker boundaries
 * - All posterior construction happens in main thread
 *
 * Used for:
 * - EM algorithms (when data is large)
 * - Future VBEM implementation
 * - Future MCMC/HMC samplers
 * - Bootstrap operations
 * - Power analysis simulations
 */

// Worker message types following the spec
interface WorkerMessage<T = any> {
  id: string;
  type: 'execute' | 'result' | 'error' | 'progress';
  operation?: string;
  payload: T;
}

interface WorkerProgress {
  operation: string;
  current: number;
  total: number;
  message?: string;
}

// Parameter types for different algorithms
interface EMParameters {
  data: number[];
  components: number;
  initialMeans: number[];
  initialStds: number[];
  initialWeights: number[];
  maxIterations: number;
  tolerance: number;
  modelType?: 'normal' | 'lognormal';
}

interface EMResult {
  components: Array<{
    mu: number;
    sigma: number;
    weight: number;
  }>;
  converged: boolean;
  iterations: number;
  logLikelihood: number;
}

// Future VBEM parameters (placeholder)
interface VBEMParameters {
  data: number[];
  priorAlpha?: number;
  priorBeta?: number;
  maxIterations: number;
  tolerance: number;
}

interface VBEMResult {
  // Variational parameters
  alpha: number;
  beta: number;
  converged: boolean;
  iterations: number;
  elbo: number; // Evidence lower bound
}

// Bootstrap parameters
interface BootstrapParameters {
  data: number[];
  statistic: 'mean' | 'median' | 'quantile';
  nBootstrap: number;
  confidenceLevel: number;
  quantile?: number;
}

interface BootstrapResult {
  estimate: number;
  confidenceInterval: [number, number];
  bootstrapSamples: number[];
}

// EM Algorithm implementation for Normal mixture
async function runNormalEM(params: EMParameters): Promise<EMResult> {
  const { data, components, initialMeans, initialStds, initialWeights, maxIterations, tolerance } =
    params;

  // Initialize parameters
  let means = [...initialMeans];
  let stds = [...initialStds];
  let weights = [...initialWeights];

  let converged = false;
  let iterations = 0;
  let logLikelihood = -Infinity;
  let prevLogLikelihood = -Infinity;

  // Main EM loop
  while (iterations < maxIterations && !converged) {
    // E-step: Calculate responsibilities
    const responsibilities: number[][] = [];
    let newLogLikelihood = 0;

    for (let i = 0; i < data.length; i++) {
      const resp: number[] = [];
      let totalDensity = 0;

      // Calculate densities for each component
      for (let k = 0; k < components; k++) {
        const density = weights[k] * normalPdf(data[i], means[k], stds[k]);
        resp[k] = density;
        totalDensity += density;
      }

      // Normalize responsibilities
      for (let k = 0; k < components; k++) {
        resp[k] /= totalDensity;
      }

      responsibilities.push(resp);
      newLogLikelihood += Math.log(totalDensity);
    }

    // M-step: Update parameters
    for (let k = 0; k < components; k++) {
      let weightSum = 0;
      let meanSum = 0;
      let varSum = 0;

      for (let i = 0; i < data.length; i++) {
        const r = responsibilities[i][k];
        weightSum += r;
        meanSum += r * data[i];
      }

      means[k] = meanSum / weightSum;

      for (let i = 0; i < data.length; i++) {
        const r = responsibilities[i][k];
        varSum += r * Math.pow(data[i] - means[k], 2);
      }

      stds[k] = Math.sqrt(varSum / weightSum);
      weights[k] = weightSum / data.length;
    }

    // Check convergence
    if (Math.abs(newLogLikelihood - prevLogLikelihood) < tolerance) {
      converged = true;
    }

    prevLogLikelihood = newLogLikelihood;
    logLikelihood = newLogLikelihood;
    iterations++;

    // Report progress every 10 iterations
    if (iterations % 10 === 0) {
      self.postMessage({
        id: 'progress',
        type: 'progress',
        payload: {
          operation: 'em',
          current: iterations,
          total: maxIterations,
          message: `EM iteration ${iterations}, log-likelihood: ${logLikelihood.toFixed(2)}`,
        },
      } as WorkerMessage<WorkerProgress>);
    }
  }

  return {
    components: means.map((mu, k) => ({
      mu: means[k],
      sigma: stds[k],
      weight: weights[k],
    })),
    converged,
    iterations,
    logLikelihood,
  };
}

// EM Algorithm implementation for LogNormal mixture
async function runLogNormalEM(params: EMParameters): Promise<EMResult> {
  // Transform to log space and run normal EM
  const logData = params.data.map((x) => Math.log(x));
  const result = await runNormalEM({
    ...params,
    data: logData,
  });

  // Results are already in log-space (mu, sigma for LogNormal)
  return result;
}

// Helper: Normal PDF
function normalPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

// Bootstrap implementation
async function runBootstrap(params: BootstrapParameters): Promise<BootstrapResult> {
  const { data, statistic, nBootstrap, confidenceLevel, quantile } = params;
  const n = data.length;
  const bootstrapSamples: number[] = [];

  // Calculate statistic function
  const calculateStat = (sample: number[]): number => {
    switch (statistic) {
      case 'mean':
        return sample.reduce((a, b) => a + b, 0) / sample.length;
      case 'median':
        const sorted = [...sample].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      case 'quantile':
        const sorted2 = [...sample].sort((a, b) => a - b);
        const idx = Math.floor(sorted2.length * (quantile || 0.5));
        return sorted2[idx];
      default:
        throw new Error(`Unknown statistic: ${statistic}`);
    }
  };

  // Original estimate
  const estimate = calculateStat(data);

  // Bootstrap samples
  for (let b = 0; b < nBootstrap; b++) {
    const sample: number[] = [];

    // Resample with replacement
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      sample.push(data[idx]);
    }

    bootstrapSamples.push(calculateStat(sample));

    // Report progress
    if (b % 100 === 0) {
      self.postMessage({
        id: 'progress',
        type: 'progress',
        payload: {
          operation: 'bootstrap',
          current: b,
          total: nBootstrap,
          message: `Bootstrap sample ${b}/${nBootstrap}`,
        },
      } as WorkerMessage<WorkerProgress>);
    }
  }

  // Calculate confidence interval
  bootstrapSamples.sort((a, b) => a - b);
  const alpha = (1 - confidenceLevel) / 2;
  const lowerIdx = Math.floor(nBootstrap * alpha);
  const upperIdx = Math.floor(nBootstrap * (1 - alpha));

  return {
    estimate,
    confidenceInterval: [bootstrapSamples[lowerIdx], bootstrapSamples[upperIdx]],
    bootstrapSamples,
  };
}

// Placeholder for future VBEM implementation
async function runVBEM(params: VBEMParameters): Promise<VBEMResult> {
  // TODO: Implement variational Bayes EM
  throw new Error('VBEM not yet implemented');
}

// Message handler
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, operation, payload } = event.data;

  if (type !== 'execute') {
    self.postMessage({
      id,
      type: 'error',
      payload: { message: 'Invalid message type' },
    } as WorkerMessage);
    return;
  }

  try {
    let result: any;

    switch (operation) {
      case 'em-normal':
        result = await runNormalEM(payload as EMParameters);
        break;

      case 'em-lognormal':
        result = await runLogNormalEM(payload as EMParameters);
        break;

      case 'bootstrap':
        result = await runBootstrap(payload as BootstrapParameters);
        break;

      case 'vbem':
        result = await runVBEM(payload as VBEMParameters);
        break;

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    self.postMessage({
      id,
      type: 'result',
      payload: result,
    } as WorkerMessage);
  } catch (error) {
    self.postMessage({
      id,
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
    } as WorkerMessage);
  }
});

export {}; // Make this a module
