/**
 * Computation Graph for Automatic Differentiation
 * 
 * This implements a reverse-mode automatic differentiation (backpropagation)
 * system optimized for probabilistic models. It tracks all operations and
 * can compute gradients efficiently.
 */

export type ForwardFn = (inputs: number[]) => number;
export type BackwardFn = (gradient: number, inputs: number[], cache?: any) => number[];

/**
 * Node in the computation graph
 */
export class ComputationNode {
  private static nextId = 0;
  
  readonly id: number;
  readonly name: string;
  readonly inputs: ComputationNode[];
  private forwardFn: ForwardFn;
  private backwardFn: BackwardFn;
  private cachedValue?: number;
  private isStale: boolean = true;
  
  constructor(
    name: string,
    inputs: ComputationNode[],
    forwardFn: ForwardFn,
    backwardFn: BackwardFn
  ) {
    this.id = ComputationNode.nextId++;
    this.name = name;
    this.inputs = inputs;
    this.forwardFn = forwardFn;
    this.backwardFn = backwardFn;
    
    // Register this node as dependent on its inputs
    inputs.forEach(input => input.addDependent(this));
  }
  
  private dependents: Set<ComputationNode> = new Set();
  
  addDependent(node: ComputationNode): void {
    this.dependents.add(node);
  }
  
  /**
   * Mark this node and all dependents as needing recomputation
   */
  invalidate(): void {
    if (!this.isStale) {
      this.isStale = true;
      this.dependents.forEach(dep => dep.invalidate());
    }
  }
  
  /**
   * Forward pass - compute the value of this node
   */
  forward(): number {
    if (!this.isStale && this.cachedValue !== undefined) {
      return this.cachedValue;
    }
    
    const inputValues = this.inputs.map(input => input.forward());
    this.cachedValue = this.forwardFn(inputValues);
    this.isStale = false;
    return this.cachedValue;
  }
  
  /**
   * Backward pass - accumulate gradients
   */
  backward(gradient: number, tape: GradientTape): void {
    // Accumulate gradient for this node
    tape.accumulate(this, gradient);
    
    // Only propagate if we have inputs
    if (this.inputs.length === 0) return;
    
    // Compute gradients for inputs
    const inputValues = this.inputs.map(input => input.forward());
    const inputGradients = this.backwardFn(gradient, inputValues, this.cachedValue);
    
    // Propagate gradients to inputs
    this.inputs.forEach((input, i) => {
      if (inputGradients[i] !== 0) {
        input.backward(inputGradients[i], tape);
      }
    });
  }
}

/**
 * Parameter node - a trainable variable in the graph
 */
export class ParameterNode extends ComputationNode {
  private value: number;
  
  constructor(initialValue: number, name?: string) {
    super(
      name || 'parameter',
      [],
      () => this.value,
      () => []
    );
    this.value = initialValue;
  }
  
  getValue(): number {
    return this.value;
  }
  
  setValue(value: number): void {
    this.value = value;
    this.invalidate();
  }
  
  /**
   * Update parameter using gradient
   */
  updateWithGradient(gradient: number, learningRate: number): void {
    this.setValue(this.value - learningRate * gradient);
  }
}

/**
 * Gradient tape for accumulating gradients during backward pass
 */
export class GradientTape {
  readonly gradients: Map<ComputationNode, number> = new Map();
  
  accumulate(node: ComputationNode, gradient: number): void {
    const current = this.gradients.get(node) || 0;
    this.gradients.set(node, current + gradient);
  }
  
  getGradient(node: ComputationNode): number {
    return this.gradients.get(node) || 0;
  }
}

/**
 * Computation graph manages all nodes and operations
 */
export class ComputationGraph {
  private static current_graph: ComputationGraph = new ComputationGraph();
  
  private nodes: Set<ComputationNode> = new Set();
  private parameters: Map<string, ParameterNode> = new Map();
  
  /**
   * Get the current default graph
   */
  static current(): ComputationGraph {
    return ComputationGraph.current_graph;
  }
  
  /**
   * Set the current default graph
   */
  static setCurrent(graph: ComputationGraph): void {
    ComputationGraph.current_graph = graph;
  }
  
  /**
   * Create a new computation node
   */
  createNode(
    name: string,
    inputs: ComputationNode[],
    forwardFn: ForwardFn,
    backwardFn: BackwardFn
  ): ComputationNode {
    const node = new ComputationNode(name, inputs, forwardFn, backwardFn);
    this.nodes.add(node);
    return node;
  }
  
  /**
   * Create or retrieve a parameter node
   */
  createParameter(initialValue: number, name?: string): ParameterNode {
    const paramName = name || `param_${this.parameters.size}`;
    
    if (this.parameters.has(paramName)) {
      return this.parameters.get(paramName)!;
    }
    
    const param = new ParameterNode(initialValue, paramName);
    this.parameters.set(paramName, param);
    this.nodes.add(param);
    return param;
  }
  
  /**
   * Get all parameters in this graph
   */
  getParameters(): Map<string, ParameterNode> {
    return new Map(this.parameters);
  }
  
  /**
   * Reset all cached values in the graph
   */
  reset(): void {
    this.nodes.forEach(node => node.invalidate());
  }
  
  /**
   * Compute gradients for all parameters with respect to a loss node
   */
  computeGradients(lossNode: ComputationNode): Map<string, number> {
    const tape = new GradientTape();
    lossNode.backward(1, tape);
    
    const paramGradients = new Map<string, number>();
    this.parameters.forEach((param, name) => {
      paramGradients.set(name, tape.getGradient(param));
    });
    
    return paramGradients;
  }
  
  /**
   * Perform a gradient descent step on all parameters
   */
  gradientStep(lossNode: ComputationNode, learningRate: number): void {
    const gradients = this.computeGradients(lossNode);
    
    this.parameters.forEach((param, name) => {
      const grad = gradients.get(name) || 0;
      param.updateWithGradient(grad, learningRate);
    });
  }
}

/**
 * Context manager for computation graphs
 */
export class GraphContext {
  private previousGraph: ComputationGraph;
  
  constructor(private graph: ComputationGraph) {
    this.previousGraph = ComputationGraph.current();
    ComputationGraph.setCurrent(graph);
  }
  
  dispose(): void {
    ComputationGraph.setCurrent(this.previousGraph);
  }
}

/**
 * Helper function to create a new graph context
 */
export function withGraph<T>(graph: ComputationGraph, fn: () => T): T {
  const context = new GraphContext(graph);
  try {
    return fn();
  } finally {
    context.dispose();
  }
}