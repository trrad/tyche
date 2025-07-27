export interface PosteriorSummary {
  type: 'simple' | 'compound';
  mean?: number[];
  variance?: number[] | null;
  ci95?: Array<[number, number]>;
  ci90?: Array<[number, number]>;
  ci80?: Array<[number, number]>;
  // For compound posteriors
  frequency?: PosteriorSummary;
  severity?: PosteriorSummary;
  expectedValuePerUser?: number;
}

export class PosteriorProxy {
  private disposed = false;
  
  constructor(
    private worker: Worker,
    private posteriorId: string,
    private summary: PosteriorSummary
  ) {}
  
  private async request<T>(type: string, payload?: any): Promise<T> {
    if (this.disposed) {
      throw new Error('Posterior proxy has been disposed');
    }
    
    const id = `${Date.now()}-${Math.random()}`;
    
    return new Promise((resolve, reject) => {
      let timeoutId: number;
      
      const handler = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        
        clearTimeout(timeoutId);
        this.worker.removeEventListener('message', handler);
        
        if (event.data.type === 'error') {
          reject(new Error(event.data.payload.message));
        } else {
          resolve(event.data.payload);
        }
      };
      
      this.worker.addEventListener('message', handler);
      
      this.worker.postMessage({ 
        id, 
        type, 
        payload: { posteriorId: this.posteriorId, ...payload } 
      });
      
      // Timeout based on operation
      const timeout = type === 'sample' && payload?.n > 10000 ? 60000 : 30000;
      timeoutId = window.setTimeout(() => {
        this.worker.removeEventListener('message', handler);
        reject(new Error(`Request timeout: ${type}`));
      }, timeout);
    });
  }
  
  // Async sampling with progress support
  async sample(n: number = 1): Promise<number[]> {
    return this.request<number[]>('sample', { n });
  }
  
  // Batch sampling for very large requests
  async *sampleBatched(n: number, batchSize: number = 10000): AsyncGenerator<number[], void, unknown> {
    for (let i = 0; i < n; i += batchSize) {
      const currentBatch = Math.min(batchSize, n - i);
      yield await this.sample(currentBatch);
    }
  }
  
  // Sync methods using cached summary
  mean(): number[] {
    if (!this.summary.mean) {
      throw new Error('Mean not available in summary');
    }
    return this.summary.mean;
  }
  
  variance(): number[] {
    if (this.summary.variance === null) {
      console.warn('Variance not available, returning [0]');
      return [0];
    }
    return this.summary.variance || [0];
  }
  
  credibleInterval(level: number): Array<[number, number]> {
    // Check cached values first
    if (level === 0.95 && this.summary.ci95) return this.summary.ci95;
    if (level === 0.90 && this.summary.ci90) return this.summary.ci90;
    if (level === 0.80 && this.summary.ci80) return this.summary.ci80;
    
    // For sync compatibility, return closest cached value
    console.warn(`Credible interval for level ${level} not cached, using 95% CI`);
    return this.summary.ci95 || [[0, 1]];
  }
  
  // Async methods for non-cached operations
  async meanAsync(): Promise<number[]> {
    return this.request<number[]>('mean');
  }
  
  async varianceAsync(): Promise<number[]> {
    return this.request<number[]>('variance');
  }
  
  async credibleIntervalAsync(level: number): Promise<Array<[number, number]>> {
    return this.request<Array<[number, number]>>('credibleInterval', { level });
  }
  
  // Refresh cached statistics
  async refreshStats(): Promise<void> {
    this.summary = await this.request<PosteriorSummary>('getStats');
  }
  
  // Clean up
  async dispose(): Promise<void> {
    if (this.disposed) return;
    
    try {
      await this.request('clear');
    } finally {
      this.disposed = true;
    }
  }
  
  isDisposed(): boolean {
    return this.disposed;
  }
}

// Compound posterior proxy
export class CompoundPosteriorProxy {
  constructor(
    public readonly frequency: PosteriorProxy,
    public readonly severity: PosteriorProxy,
    private summary: PosteriorSummary
  ) {}
  
  expectedValuePerUser(): number {
    return this.summary.expectedValuePerUser || 
           (this.frequency.mean()[0] * this.severity.mean()[0]);
  }
  
  async dispose(): Promise<void> {
    await Promise.all([
      this.frequency.dispose(),
      this.severity.dispose()
    ]);
  }
} 