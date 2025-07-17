// src/ab-test-app.ts
import { beta } from '../src/core/distributions/Beta';
import { InteractiveUpliftGraph as UpliftGraph} from '../src/components/InteractiveUpliftGraph';

/**
 * Complete A/B Test Analysis Application with Uplift Visualization
 * Shows how all the pieces come together in a real browser app
 */
export class ABTestApp {
  private controlTotal = 1000;
  private controlConversions = 87;
  private treatmentTotal = 1000;
  private treatmentConversions = 113;
  private upliftGraph: UpliftGraph;
  
  constructor() {
    this.setupUI();
    this.upliftGraph = new UpliftGraph('uplift-graph-container');
    this.updateResults();

    
  }
  
  private setupUI() {
    document.body.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto; padding: 20px; font-family: system-ui, -apple-system, sans-serif;">
        <h1 style="color: #1f2937; margin-bottom: 30px;">Bayesian A/B Test Calculator</h1>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
          <!-- Control Group -->
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
            <h2 style="color: #374151; margin-bottom: 15px;">Control Group</h2>
            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 5px; color: #4b5563;">
                Total Visitors:
                <input type="number" id="control-total" value="${this.controlTotal}" 
                       style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
              </label>
            </div>
            <div>
              <label style="display: block; margin-bottom: 5px; color: #4b5563;">
                Conversions:
                <input type="number" id="control-conversions" value="${this.controlConversions}"
                       style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
              </label>
            </div>
            <div style="margin-top: 15px; padding: 10px; background: white; border-radius: 4px;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Conversion Rate: <span id="control-rate" style="font-weight: bold; color: #1f2937;">8.7%</span>
              </p>
            </div>
          </div>
          
          <!-- Treatment Group -->
          <div style="background: #e0e7ff; padding: 20px; border-radius: 8px;">
            <h2 style="color: #4338ca; margin-bottom: 15px;">Treatment Group</h2>
            <div style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 5px; color: #4b5563;">
                Total Visitors:
                <input type="number" id="treatment-total" value="${this.treatmentTotal}"
                       style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
              </label>
            </div>
            <div>
              <label style="display: block; margin-bottom: 5px; color: #4b5563;">
                Conversions:
                <input type="number" id="treatment-conversions" value="${this.treatmentConversions}"
                       style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #d1d5db; border-radius: 4px;">
              </label>
            </div>
            <div style="margin-top: 15px; padding: 10px; background: white; border-radius: 4px;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                Conversion Rate: <span id="treatment-rate" style="font-weight: bold; color: #4338ca;">11.3%</span>
              </p>
            </div>
          </div>
        </div>
        
        <!-- Results Section -->
        <div style="background: white; border: 1px solid #e5e7eb; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
          <h2 style="color: #1f2937; margin-bottom: 20px;">Results</h2>
          
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px;">
            <div style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Probability of Improvement</p>
              <p id="prob-improvement" style="margin: 0; font-size: 36px; font-weight: bold; color: #10b981;">92.3%</p>
            </div>
            
            <div style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Expected Relative Uplift</p>
              <p id="expected-uplift" style="margin: 0; font-size: 36px; font-weight: bold; color: #3b82f6;">+29.9%</p>
            </div>
            
            <div style="text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">95% Credible Interval</p>
              <p id="credible-interval" style="margin: 0; font-size: 24px; font-weight: bold; color: #6366f1;">[+5.4%, +60.1%]</p>
            </div>
          </div>
          
          <div id="recommendation" style="padding: 20px; background: #d1fae5; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #065f46; font-weight: bold;">
              ✓ Treatment is likely better. Consider implementing the change.
            </p>
          </div>
        </div>
        
        <!-- Uplift Distribution Graph -->
        <div style="background: white; border: 1px solid #e5e7eb; padding: 30px; border-radius: 8px;">
          <div id="uplift-graph-container"></div>
        </div>
        
        <!-- Advanced Settings (collapsed by default) -->
        <details style="margin-top: 30px;">
          <summary style="cursor: pointer; padding: 15px; background: #f9fafb; border-radius: 8px; outline: none;">
            Advanced Settings
          </summary>
          <div style="padding: 20px; background: #f9fafb; border-radius: 0 0 8px 8px; margin-top: -8px;">
            <p style="margin: 0 0 15px 0; color: #6b7280;">
              Prior Distribution: Beta(1, 1) - Uniform prior (Jeffrey's prior)
            </p>
            <p style="margin: 0; color: #6b7280;">
              Monte Carlo Samples: 10,000
            </p>
          </div>
        </details>
      </div>
    `;
    
    // Add event listeners
    ['control-total', 'control-conversions', 'treatment-total', 'treatment-conversions'].forEach(id => {
      const element = document.getElementById(id) as HTMLInputElement;
      element.addEventListener('input', () => this.handleInputChange());
    });
  }
  
  private handleInputChange() {
    // Update values from inputs
    this.controlTotal = parseInt((document.getElementById('control-total') as HTMLInputElement).value) || 0;
    this.controlConversions = parseInt((document.getElementById('control-conversions') as HTMLInputElement).value) || 0;
    this.treatmentTotal = parseInt((document.getElementById('treatment-total') as HTMLInputElement).value) || 0;
    this.treatmentConversions = parseInt((document.getElementById('treatment-conversions') as HTMLInputElement).value) || 0;
    
    // Validate inputs
    this.controlConversions = Math.min(this.controlConversions, this.controlTotal);
    this.treatmentConversions = Math.min(this.treatmentConversions, this.treatmentTotal);
    
    // Update UI with validated values
    (document.getElementById('control-conversions') as HTMLInputElement).value = this.controlConversions.toString();
    (document.getElementById('treatment-conversions') as HTMLInputElement).value = this.treatmentConversions.toString();
    
    this.updateResults();
  }
  
  private updateResults() {
    // Update conversion rates
    const controlRate = this.controlTotal > 0 ? (this.controlConversions / this.controlTotal * 100) : 0;
    const treatmentRate = this.treatmentTotal > 0 ? (this.treatmentConversions / this.treatmentTotal * 100) : 0;
    
    document.getElementById('control-rate')!.textContent = `${controlRate.toFixed(1)}%`;
    document.getElementById('treatment-rate')!.textContent = `${treatmentRate.toFixed(1)}%`;
    
    // Calculate Bayesian results
    const results = this.calculateBayesianResults();
    
    // Update UI
    document.getElementById('prob-improvement')!.textContent = `${(results.probabilityOfImprovement * 100).toFixed(1)}%`;
    document.getElementById('expected-uplift')!.textContent = 
      results.expectedUplift >= 0 ? `+${results.expectedUplift.toFixed(1)}%` : `${results.expectedUplift.toFixed(1)}%`;
    document.getElementById('credible-interval')!.textContent = 
      `[${results.credibleInterval[0] >= 0 ? '+' : ''}${results.credibleInterval[0].toFixed(1)}%, ${results.credibleInterval[1] >= 0 ? '+' : ''}${results.credibleInterval[1].toFixed(1)}%]`;
    
    // Update recommendation
    const recommendationEl = document.getElementById('recommendation')!;
    if (results.probabilityOfImprovement > 0.95) {
      recommendationEl.style.background = '#d1fae5';
      recommendationEl.innerHTML = `
        <p style="margin: 0; color: #065f46; font-weight: bold;">
          ✓ Treatment is significantly better. Implement the change with confidence.
        </p>
      `;
    } else if (results.probabilityOfImprovement > 0.8) {
      recommendationEl.style.background = '#fef3c7';
      recommendationEl.innerHTML = `
        <p style="margin: 0; color: #92400e; font-weight: bold;">
          ⚠ Treatment shows promise but needs more data for confidence.
        </p>
      `;
    } else if (results.probabilityOfImprovement < 0.2) {
      recommendationEl.style.background = '#fee2e2';
      recommendationEl.innerHTML = `
        <p style="margin: 0; color: #991b1b; font-weight: bold;">
          ✗ Control is likely better. Consider keeping the original.
        </p>
      `;
    } else {
      recommendationEl.style.background = '#f3f4f6';
      recommendationEl.innerHTML = `
        <p style="margin: 0; color: #374151; font-weight: bold;">
          ↔ No clear winner yet. Continue testing.
        </p>
      `;
    }
    
    // Update the uplift graph
    this.upliftGraph.update(
      this.controlConversions,
      this.controlTotal,
      this.treatmentConversions,
      this.treatmentTotal
    );
  }
  
  private calculateBayesianResults() {
    // Create posterior distributions
    const controlDist = beta(1 + this.controlConversions, 1 + this.controlTotal - this.controlConversions);
    const treatmentDist = beta(1 + this.treatmentConversions, 1 + this.treatmentTotal - this.treatmentConversions);
    
    // Monte Carlo simulation
    const nSamples = 10000;
    let treatmentWins = 0;
    const uplifts: number[] = [];
    const rng = () => Math.random();
    
    for (let i = 0; i < nSamples; i++) {
      const controlSample = controlDist.sample(rng);
      const treatmentSample = treatmentDist.sample(rng);
      
      if (treatmentSample > controlSample) {
        treatmentWins++;
      }
      
      if (controlSample > 0) {
        const uplift = (treatmentSample - controlSample) / controlSample * 100;
        uplifts.push(uplift);
      }
    }
    
    // Sort for percentiles
    uplifts.sort((a, b) => a - b);
    
    return {
      probabilityOfImprovement: treatmentWins / nSamples,
      expectedUplift: uplifts[Math.floor(uplifts.length * 0.5)],
      credibleInterval: [
        uplifts[Math.floor(uplifts.length * 0.025)],
        uplifts[Math.floor(uplifts.length * 0.975)]
      ] as [number, number]
    };
  }
}

// Initialize the app when the DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    new ABTestApp();
  });
}