/**
 * Core RandomVariable abstraction for probabilistic programming with automatic differentiation
 * 
 * Simplified version without complex generics - focuses on practical use cases
 */

import { ComputationGraph, ComputationNode, GradientTape } from './ComputationGraph';

export type Shape = number[];
export type Tensor = number | number[] | number[][];

/**
 * Random variable representing both probabilistic and deterministic values
 * Simplified to always work with scalar values internally, with shape tracking for future tensor support
 */
export class RandomVariable {
  constructor(
    private readonly node: ComputationNode,
    private readonly shape: Shape = [],
    private readonly graph: ComputationGraph = ComputationGraph.current()
  ) {}

  /**
   * Get the computation node for AD
   */
  getNode(): ComputationNode {
    return this.node;
  }

  /**
   * Get the shape of this variable
   */
  getShape(): Shape {
    return [...this.shape];
  }

  /**
   * Check if this is a scalar (shape [])
   */
  isScalar(): boolean {
    return this.shape.length === 0;
  }

  /**
   * Forward pass - compute the value
   */
  forward(): number {
    return this.node.forward();
  }

  /**
   * Backward pass - compute gradients
   */
  backward(gradient: number = 1): Map<ComputationNode, number> {
    const tape = new GradientTape();
    this.node.backward(gradient, tape);
    return tape.gradients;
  }

  /**
   * Sample from this random variable
   * Default implementation - should be overridden by distributions
   */
  sample(_rng: () => number): number {
    return this.forward();
  }

  /**
   * Compute log probability of a value
   * Default implementation - should be overridden by distributions
   */
  logProb(_value: number | RandomVariable): RandomVariable {
    throw new Error('logProb not implemented for this variable');
  }

  // Arithmetic operations - all return RandomVariable for chaining

  /**
   * Addition: a + b
   */
  add(other: RandomVariable | number): RandomVariable {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'add',
      [this.node, otherVar.node],
      (inputs) => inputs[0] + inputs[1],
      () => [1, 1]  // Both inputs get gradient 1
    );
    return new RandomVariable(node, this.shape, this.graph);
  }

  /**
   * Subtraction: a - b
   */
  subtract(other: RandomVariable | number): RandomVariable {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'subtract',
      [this.node, otherVar.node],
      (inputs) => inputs[0] - inputs[1],
      () => [1, -1]  // Gradient is 1 for first input, -1 for second
    );
    return new RandomVariable(node, this.shape, this.graph);
  }

  /**
   * Multiplication: a * b
   */
  multiply(other: RandomVariable | number): RandomVariable {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'multiply',
      [this.node, otherVar.node],
      (inputs) => inputs[0] * inputs[1],
      (grad, inputs) => [grad * inputs[1], grad * inputs[0]]
    );
    return new RandomVariable(node, this.shape, this.graph);
  }

  /**
   * Division: a / b
   */
  divide(other: RandomVariable | number): RandomVariable {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'divide',
      [this.node, otherVar.node],
      (inputs) => inputs[0] / inputs[1],
      (grad, inputs) => [
        grad / inputs[1],
        -grad * inputs[0] / (inputs[1] * inputs[1])
      ]
    );
    return new RandomVariable(node, this.shape, this.graph);
  }

  /**
   * Power: a ** b
   */
  pow(exponent: number): RandomVariable {
    const node = this.graph.createNode(
      'pow',
      [this.node],
      (inputs) => Math.pow(inputs[0], exponent),
      (grad, inputs) => [
        grad * exponent * Math.pow(inputs[0], exponent - 1)
      ]
    );
    return new RandomVariable(node, this.shape, this.graph);
  }

  /**
   * Natural logarithm
   */
  log(): RandomVariable {
    const node = this.graph.createNode(
      'log',
      [this.node],
      (inputs) => Math.log(inputs[0]),
      (grad, inputs) => [grad / inputs[0]]
    );
    return new RandomVariable(node, this.shape, this.graph);
  }

  /**
   * Exponential
   */
  exp(): RandomVariable {
    const node = this.graph.createNode(
      'exp',
      [this.node],
      (inputs) => Math.exp(inputs[0]),
      (grad, inputs, cache) => {
        const expVal = cache ?? Math.exp(inputs[0]);
        return [grad * expVal];
      }
    );
    return new RandomVariable(node, this.shape, this.graph);
  }

  /**
   * Negation: -a
   */
  neg(): RandomVariable {
    return this.multiply(-1);
  }

  // Static factory methods

  /**
   * Create a constant random variable
   */
  static constant(value: number | RandomVariable): RandomVariable {
    if (value instanceof RandomVariable) {
      return value;
    }
    
    const graph = ComputationGraph.current();
    const node = graph.createNode(
      'constant',
      [],
      () => value,
      () => []
    );
    return new RandomVariable(node, [], graph);
  }

  /**
   * Create a parameter (trainable variable)
   */
  static parameter(initialValue: number, name?: string): RandomVariable {
    const graph = ComputationGraph.current();
    const node = graph.createParameter(initialValue, name);
    return new RandomVariable(node, [], graph);
  }
}

// Common mathematical functions as free functions for convenience

export function add(a: RandomVariable | number, b: RandomVariable | number): RandomVariable {
  return RandomVariable.constant(a).add(b);
}

export function subtract(a: RandomVariable | number, b: RandomVariable | number): RandomVariable {
  return RandomVariable.constant(a).subtract(b);
}

export function multiply(a: RandomVariable | number, b: RandomVariable | number): RandomVariable {
  return RandomVariable.constant(a).multiply(b);
}

export function divide(a: RandomVariable | number, b: RandomVariable | number): RandomVariable {
  return RandomVariable.constant(a).divide(b);
}

export function pow(base: RandomVariable | number, exponent: number): RandomVariable {
  return RandomVariable.constant(base).pow(exponent);
}

export function log(x: RandomVariable | number): RandomVariable {
  return RandomVariable.constant(x).log();
}

export function exp(x: RandomVariable | number): RandomVariable {
  return RandomVariable.constant(x).exp();
}

/**
 * Sigmoid function: 1 / (1 + exp(-x))
 */
export function sigmoid(x: RandomVariable | number): RandomVariable {
  const xVar = RandomVariable.constant(x);
  const graph = ComputationGraph.current();
  
  const node = graph.createNode(
    'sigmoid',
    [xVar.getNode()],
    (inputs) => 1 / (1 + Math.exp(-inputs[0])),
    (grad, inputs) => {
      const sig = 1 / (1 + Math.exp(-inputs[0]));
      return [grad * sig * (1 - sig)];
    }
  );
  
  return new RandomVariable(node, [], graph);
}

/**
 * Logit function: log(p / (1 - p))
 */
export function logit(p: RandomVariable | number): RandomVariable {
  const pVar = RandomVariable.constant(p);
  return pVar.divide(RandomVariable.constant(1).subtract(pVar)).log();
}