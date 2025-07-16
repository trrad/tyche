/**
 * Core RandomVariable abstraction for probabilistic programming with automatic differentiation
 * 
 * This class represents both random variables and deterministic computations in our
 * probabilistic models. It tracks the computational graph for automatic differentiation
 * and provides operator overloading for natural mathematical syntax.
 */

import { ComputationGraph, ComputationNode, GradientTape } from './ComputationGraph';

export type Shape = number[];
export type Tensor = number | number[] | number[][];

/**
 * Base class for all random variables and computations in the probabilistic model
 */
export class RandomVariable<T extends Tensor = number> {
  private readonly node: ComputationNode;
  private readonly shape: Shape;
  private readonly graph: ComputationGraph;

  constructor(
    node: ComputationNode,
    shape: Shape = [],
    graph: ComputationGraph = ComputationGraph.current()
  ) {
    this.node = node;
    this.shape = shape;
    this.graph = graph;
  }

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
  forward(): T {
    return this.node.forward() as T;
  }

  /**
   * Backward pass - compute gradients
   */
  backward(gradient: T = 1 as T): Map<ComputationNode, number> {
    const tape = new GradientTape();
    this.node.backward(gradient as number, tape);
    return tape.gradients;
  }

  /**
   * Sample from this random variable
   * @param rng Random number generator
   * @param shape Optional shape for multiple samples
   */
  sample(rng: () => number, shape?: Shape): T {
    // Default implementation - should be overridden by distributions
    return this.forward();
  }

  /**
   * Compute log probability of a value
   * @param value The value to compute probability for
   */
  logProb(value: T): RandomVariable<number> {
    // Default implementation - should be overridden by distributions
    throw new Error('logProb not implemented for this variable');
  }

  // Operator overloading for natural syntax

  /**
   * Addition: a + b
   */
  add(other: RandomVariable<T> | T): RandomVariable<T> {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'add',
      [this.node, otherVar.node],
      (inputs) => (inputs[0] + inputs[1]) as T,
      (grad, inputs, cache) => [grad, grad]
    );
    return new RandomVariable<T>(node, this.shape, this.graph);
  }

  /**
   * Subtraction: a - b
   */
  subtract(other: RandomVariable<T> | T): RandomVariable<T> {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'subtract',
      [this.node, otherVar.node],
      (inputs) => (inputs[0] - inputs[1]) as T,
      (grad, inputs, cache) => [grad, -grad]
    );
    return new RandomVariable<T>(node, this.shape, this.graph);
  }

  /**
   * Multiplication: a * b
   */
  multiply(other: RandomVariable<T> | T): RandomVariable<T> {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'multiply',
      [this.node, otherVar.node],
      (inputs) => (inputs[0] * inputs[1]) as T,
      (grad, inputs, cache) => [grad * inputs[1], grad * inputs[0]]
    );
    return new RandomVariable<T>(node, this.shape, this.graph);
  }

  /**
   * Division: a / b
   */
  divide(other: RandomVariable<T> | T): RandomVariable<T> {
    const otherVar = RandomVariable.constant(other);
    const node = this.graph.createNode(
      'divide',
      [this.node, otherVar.node],
      (inputs) => (inputs[0] / inputs[1]) as T,
      (grad, inputs, cache) => [
        grad / inputs[1],
        -grad * inputs[0] / (inputs[1] * inputs[1])
      ]
    );
    return new RandomVariable<T>(node, this.shape, this.graph);
  }

  /**
   * Power: a ** b
   */
  pow(exponent: number): RandomVariable<T> {
    const node = this.graph.createNode(
      'pow',
      [this.node],
      (inputs) => Math.pow(inputs[0], exponent) as T,
      (grad, inputs, cache) => [
        grad * exponent * Math.pow(inputs[0], exponent - 1)
      ]
    );
    return new RandomVariable<T>(node, this.shape, this.graph);
  }

  /**
   * Natural logarithm
   */
  log(): RandomVariable<T> {
    const node = this.graph.createNode(
      'log',
      [this.node],
      (inputs) => Math.log(inputs[0]) as T,
      (grad, inputs, cache) => [grad / inputs[0]]
    );
    return new RandomVariable<T>(node, this.shape, this.graph);
  }

  /**
   * Exponential
   */
  exp(): RandomVariable<T> {
    const node = this.graph.createNode(
      'exp',
      [this.node],
      (inputs) => Math.exp(inputs[0]) as T,
      (grad, inputs, cache) => {
        const expVal = cache || Math.exp(inputs[0]);
        return [grad * expVal];
      }
    );
    return new RandomVariable<T>(node, this.shape, this.graph);
  }

  /**
   * Negation: -a
   */
  neg(): RandomVariable<T> {
    return this.multiply(-1 as T);
  }

  // Static factory methods

  /**
   * Create a constant random variable
   */
  static constant<T extends Tensor>(value: T | RandomVariable<T>): RandomVariable<T> {
    if (value instanceof RandomVariable) {
      return value;
    }
    
    const graph = ComputationGraph.current();
    const shape = Array.isArray(value) ? [value.length] : [];
    const node = graph.createNode(
      'constant',
      [],
      () => value,
      () => []
    );
    return new RandomVariable<T>(node, shape, graph);
  }

  /**
   * Create a parameter (trainable variable)
   */
  static parameter<T extends Tensor>(
    initialValue: T,
    name?: string
  ): RandomVariable<T> {
    const graph = ComputationGraph.current();
    const shape = Array.isArray(initialValue) ? [initialValue.length] : [];
    const node = graph.createParameter(initialValue as number, name);
    return new RandomVariable<T>(node, shape, graph);
  }
}

// Common mathematical functions as free functions

export function add<T extends Tensor>(a: RandomVariable<T> | T, b: RandomVariable<T> | T): RandomVariable<T> {
  return RandomVariable.constant(a).add(b);
}

export function subtract<T extends Tensor>(a: RandomVariable<T> | T, b: RandomVariable<T> | T): RandomVariable<T> {
  return RandomVariable.constant(a).subtract(b);
}

export function multiply<T extends Tensor>(a: RandomVariable<T> | T, b: RandomVariable<T> | T): RandomVariable<T> {
  return RandomVariable.constant(a).multiply(b);
}

export function divide<T extends Tensor>(a: RandomVariable<T> | T, b: RandomVariable<T> | T): RandomVariable<T> {
  return RandomVariable.constant(a).divide(b);
}

export function pow<T extends Tensor>(base: RandomVariable<T> | T, exponent: number): RandomVariable<T> {
  return RandomVariable.constant(base).pow(exponent);
}

export function log<T extends Tensor>(x: RandomVariable<T> | T): RandomVariable<T> {
  return RandomVariable.constant(x).log();
}

export function exp<T extends Tensor>(x: RandomVariable<T> | T): RandomVariable<T> {
  return RandomVariable.constant(x).exp();
}

/**
 * Sigmoid function: 1 / (1 + exp(-x))
 */
export function sigmoid(x: RandomVariable<number> | number): RandomVariable<number> {
  const xVar = RandomVariable.constant(x);
  return RandomVariable.constant(1).divide(
    RandomVariable.constant(1).add(xVar.neg().exp())
  );
}

/**
 * Logit function: log(p / (1 - p))
 */
export function logit(p: RandomVariable<number> | number): RandomVariable<number> {
  const pVar = RandomVariable.constant(p);
  return pVar.divide(RandomVariable.constant(1).subtract(pVar)).log();
}