/**
 * Tests for RandomVariable and automatic differentiation
 * Simplified to work with pragmatic types
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { RandomVariable, sigmoid } from '../core/RandomVariable';
import { ComputationGraph } from '../core/ComputationGraph';

describe('RandomVariable', () => {
  let graph: ComputationGraph;
  
  beforeEach(() => {
    graph = new ComputationGraph();
    ComputationGraph.setCurrent(graph);
  });
  
  describe('Basic Operations', () => {
    test('constant creation', () => {
      const x = RandomVariable.constant(5);
      expect(x.forward()).toBe(5);
      expect(x.isScalar()).toBe(true);
    });
    
    test('parameter creation', () => {
      const theta = RandomVariable.parameter(0.5, 'theta');
      expect(theta.forward()).toBe(0.5);
    });
    
    test('addition', () => {
      const x = RandomVariable.constant(3);
      const y = RandomVariable.constant(4);
      const z = x.add(y);
      expect(z.forward()).toBe(7);
    });
    
    test('multiplication', () => {
      const x = RandomVariable.constant(3);
      const y = RandomVariable.constant(4);
      const z = x.multiply(y);
      expect(z.forward()).toBe(12);
    });
    
    test('chained operations', () => {
      const x = RandomVariable.constant(2);
      const y = RandomVariable.constant(3);
      const z = x.add(y).multiply(4);
      expect(z.forward()).toBe(20);
    });
  });
  
  describe('Automatic Differentiation', () => {
    test('gradient of addition', () => {
      const x = RandomVariable.parameter(3, 'x');
      const y = RandomVariable.parameter(4, 'y');
      const z = x.add(y);
      
      const gradients = z.backward();
      expect(gradients.get(x.getNode())).toBe(1);
      expect(gradients.get(y.getNode())).toBe(1);
    });
    
    test('gradient of multiplication', () => {
      const x = RandomVariable.parameter(3, 'x');
      const y = RandomVariable.parameter(4, 'y');
      const z = x.multiply(y);
      
      const gradients = z.backward();
      expect(gradients.get(x.getNode())).toBe(4); // dz/dx = y
      expect(gradients.get(y.getNode())).toBe(3); // dz/dy = x
    });
    
    test('gradient of composite function', () => {
      // f(x) = x² + 2x + 1
      const x = RandomVariable.parameter(3, 'x');
      const f = x.pow(2).add(x.multiply(2)).add(1);
      
      const gradients = f.backward();
      // df/dx = 2x + 2 = 2(3) + 2 = 8
      expect(gradients.get(x.getNode())).toBe(8);
    });
    
    test('gradient of log', () => {
      const x = RandomVariable.parameter(2, 'x');
      const y = x.log();
      
      const gradients = y.backward();
      // d/dx log(x) = 1/x = 1/2
      expect(gradients.get(x.getNode())).toBeCloseTo(0.5);
    });
    
    test('gradient of exp', () => {
      const x = RandomVariable.parameter(1, 'x');
      const y = x.exp();
      
      const gradients = y.backward();
      // d/dx exp(x) = exp(x) = e
      expect(gradients.get(x.getNode())).toBeCloseTo(Math.E);
    });
    
    test('gradient of sigmoid', () => {
      const x = RandomVariable.parameter(0, 'x');
      const y = sigmoid(x);
      
      const gradients = y.backward();
      // d/dx sigmoid(x) = sigmoid(x) * (1 - sigmoid(x))
      // At x=0, sigmoid(0) = 0.5, so gradient = 0.5 * 0.5 = 0.25
      expect(gradients.get(x.getNode())).toBeCloseTo(0.25);
    });
  });
  
  describe('Graph Operations', () => {
    test('parameter updates', () => {
      const x = RandomVariable.parameter(5, 'x');
      const loss = x.pow(2); // minimize x²
      
      // Gradient at x=5 is 2*5 = 10
      graph.gradientStep(loss.getNode(), 0.1); // learning rate = 0.1
      
      // New value should be 5 - 0.1 * 10 = 4
      expect(x.forward()).toBe(4);
    });
    
    test('multiple parameters', () => {
      const x = RandomVariable.parameter(3, 'x');
      const y = RandomVariable.parameter(4, 'y');
      const loss = x.pow(2).add(y.pow(2)); // minimize x² + y²
      
      graph.gradientStep(loss.getNode(), 0.1);
      
      // x should be updated: 3 - 0.1 * 2 * 3 = 2.4
      // y should be updated: 4 - 0.1 * 2 * 4 = 3.2
      expect(x.forward()).toBeCloseTo(2.4);
      expect(y.forward()).toBeCloseTo(3.2);
    });
  });
  
  describe('Numerical Stability', () => {
    test('log of zero returns -Infinity', () => {
      const x = RandomVariable.constant(0);
      const y = x.log();
      expect(y.forward()).toBe(-Infinity);
    });
    
    test('exp of large numbers', () => {
      const x = RandomVariable.constant(100);
      const y = x.exp();
      expect(y.forward()).toBeCloseTo(Math.exp(100));
    });
    
    test('sigmoid of extreme values', () => {
      const veryNegative = sigmoid(-50);
      const veryPositive = sigmoid(50);
      
      expect(veryNegative.forward()).toBeCloseTo(0, 10);
      expect(veryPositive.forward()).toBeCloseTo(1, 10);
    });
  });
});