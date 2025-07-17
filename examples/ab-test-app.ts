// examples/ab-test-app.ts
import { 
  beta, 
  ComputationGraph,
  RandomVariable 
} from '../src/index';

interface ABTestData {
  control: { conversions: number; total: number };
  treatment: { conversions: number; total: number };
}

interface ABTestResults {
  controlRate: number;
  treatmentRate: number;
  probabilityTreatmentBetter: number;
  expectedUplift: number;
  upliftInterval: [number, number];
  controlPosterior: { alpha: number; beta: number };
  treatmentPosterior: { alpha: number; beta: number };
}

export class ABTestAnalyzer {
  constructor(
    private priorAlpha: number = 1,
    private priorBeta: number = 1
  ) {}

  analyze(data: ABTestData, numSamples: number = 10000): ABTestResults {
    // Create computation graph context
    const graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);

    // Calculate posterior parameters using conjugacy
    const controlPosterior = {
      alpha: this.priorAlpha + data.control.conversions,
      beta: this.priorBeta + data.control.total - data.control.conversions
    };

    const treatmentPosterior = {
      alpha: this.priorAlpha + data.treatment.conversions,
      beta: this.priorBeta + data.treatment.total - data.treatment.conversions
    };

    // Create Beta distributions
    const controlDist = beta(controlPosterior.alpha, controlPosterior.beta);
    const treatmentDist = beta(treatmentPosterior.alpha, treatmentPosterior.beta);

    // Monte Carlo simulation
    const rng = () => Math.random();
    let treatmentWins = 0;
    const upliftSamples: number[] = [];

    for (let i = 0; i < numSamples; i++) {
      const controlSample = controlDist.sample(rng);
      const treatmentSample = treatmentDist.sample(rng);

      if (treatmentSample > controlSample) {
        treatmentWins++;
      }

      const uplift = (treatmentSample - controlSample) / controlSample;
      upliftSamples.push(uplift);
    }

    // Calculate statistics
    upliftSamples.sort((a, b) => a - b);
    const medianUplift = upliftSamples[Math.floor(numSamples / 2)];
    const lowerUplift = upliftSamples[Math.floor(numSamples * 0.025)];
    const upperUplift = upliftSamples[Math.floor(numSamples * 0.975)];

    return {
      controlRate: data.control.conversions / data.control.total,
      treatmentRate: data.treatment.conversions / data.treatment.total,
      probabilityTreatmentBetter: treatmentWins / numSamples,
      expectedUplift: medianUplift,
      upliftInterval: [lowerUplift, upperUplift],
      controlPosterior,
      treatmentPosterior
    };
  }

  // Get posterior samples for visualization
  getPosteriorSamples(
    posterior: { alpha: number; beta: number }, 
    numSamples: number = 1000
  ): number[] {
    const dist = beta(posterior.alpha, posterior.beta);
    const rng = () => Math.random();
    const samples: number[] = [];
    
    for (let i = 0; i < numSamples; i++) {
      samples.push(dist.sample(rng));
    }
    
    return samples;
  }
}

// Export functions for the UI
export function runAnalysis(): void {
  const analyzer = new ABTestAnalyzer();
  
  // Get input values
  const controlConversions = parseInt(
    (document.getElementById('control-conversions') as HTMLInputElement).value
  );
  const controlTotal = parseInt(
    (document.getElementById('control-total') as HTMLInputElement).value
  );
  const treatmentConversions = parseInt(
    (document.getElementById('treatment-conversions') as HTMLInputElement).value
  );
  const treatmentTotal = parseInt(
    (document.getElementById('treatment-total') as HTMLInputElement).value
  );

  // Validate
  if (controlConversions > controlTotal || treatmentConversions > treatmentTotal) {
    showError('Conversions cannot exceed total visitors');
    return;
  }

  // Run analysis
  const results = analyzer.analyze({
    control: { conversions: controlConversions, total: controlTotal },
    treatment: { conversions: treatmentConversions, total: treatmentTotal }
  });

  // Display results
  displayResults(results);
  
  // Draw visualizations
  drawPosteriorChart(analyzer, results);
  drawUpliftChart(results);
}

function showError(message: string): void {
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

function displayResults(results: ABTestResults): void {
  const resultsDiv = document.getElementById('results');
  if (resultsDiv) {
    resultsDiv.style.display = 'block';
  }

  // Update metric cards
  updateMetric('control-rate', `${(results.controlRate * 100).toFixed(1)}%`);
  updateMetric('treatment-rate', `${(results.treatmentRate * 100).toFixed(1)}%`);
  updateMetric('prob-improvement', `${(results.probabilityTreatmentBetter * 100).toFixed(1)}%`);
  updateMetric('expected-uplift', `${(results.expectedUplift * 100).toFixed(1)}%`);
  updateMetric(
    'uplift-interval', 
    `[${(results.upliftInterval[0] * 100).toFixed(1)}%, ${(results.upliftInterval[1] * 100).toFixed(1)}%]`
  );

  // Add visual indicator for significance
  const probDiv = document.getElementById('prob-improvement-card');
  if (probDiv) {
    probDiv.classList.remove('winner', 'no-difference');
    if (results.probabilityTreatmentBetter > 0.95) {
      probDiv.classList.add('winner');
    } else if (results.probabilityTreatmentBetter < 0.05) {
      probDiv.classList.add('no-difference');
    }
  }
}

function updateMetric(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function drawPosteriorChart(analyzer: ABTestAnalyzer, results: ABTestResults): void {
  const canvas = document.getElementById('posterior-chart') as HTMLCanvasElement;
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Get samples for KDE
  const controlSamples = analyzer.getPosteriorSamples(results.controlPosterior, 2000);
  const treatmentSamples = analyzer.getPosteriorSamples(results.treatmentPosterior, 2000);

  // Simple KDE visualization
  const width = canvas.width;
  const height = canvas.height;
  const margin = 40;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Calculate density estimates
  const xMin = 0;
  const xMax = Math.max(...controlSamples, ...treatmentSamples) * 1.1;
  const numPoints = 200;
  const bandwidth = 0.02;

  function kde(samples: number[], x: number): number {
    let sum = 0;
    for (const sample of samples) {
      const diff = (x - sample) / bandwidth;
      sum += Math.exp(-0.5 * diff * diff) / Math.sqrt(2 * Math.PI);
    }
    return sum / (samples.length * bandwidth);
  }

  // Draw axes
  ctx.strokeStyle = '#718096';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, height - margin);
  ctx.lineTo(width - margin, height - margin);
  ctx.moveTo(margin, margin);
  ctx.lineTo(margin, height - margin);
  ctx.stroke();

  // Draw distributions
  const drawDist = (samples: number[], color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();

    let maxDensity = 0;
    const densities: number[] = [];

    // Calculate densities
    for (let i = 0; i < numPoints; i++) {
      const x = xMin + (i / numPoints) * (xMax - xMin);
      const density = kde(samples, x);
      densities.push(density);
      maxDensity = Math.max(maxDensity, density);
    }

    // Draw curve
    for (let i = 0; i < numPoints; i++) {
      const x = margin + (i / numPoints) * (width - 2 * margin);
      const y = height - margin - (densities[i] / maxDensity) * (height - 2 * margin);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };

  drawDist(controlSamples, '#e53e3e');
  drawDist(treatmentSamples, '#38a169');

  // Legend
  ctx.fillStyle = '#e53e3e';
  ctx.fillRect(width - 150, 20, 15, 15);
  ctx.fillStyle = '#2d3748';
  ctx.font = '14px sans-serif';
  ctx.fillText('Control', width - 130, 32);

  ctx.fillStyle = '#38a169';
  ctx.fillRect(width - 150, 45, 15, 15);
  ctx.fillText('Treatment', width - 130, 57);
}

function drawUpliftChart(results: ABTestResults): void {
  // Similar implementation for uplift distribution
  // This would show a histogram of the uplift samples
}

// Make functions available globally for HTML
(window as any).runAnalysis = runAnalysis;