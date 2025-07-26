import { describe, test, expect } from 'vitest';
import { RandomVariable } from '../../core/RandomVariable';
import { ComputationGraph } from '../../core/ComputationGraph';

describe('Trace backward pass inputs', () => {
  test('Check what inputs[0] contains during backward', () => {
    // Create a simple computation with known values
    const x = RandomVariable.parameter(3, 'x');
    
    // Create a custom pow that logs what it sees
    const graph = ComputationGraph.current();
    const customPowNode = graph.createNode(
      'custom_pow',
      [x.getNode()],
      (inputs) => {
        const result = Math.pow(inputs[0], 2);
        console.log(`Forward: pow(${inputs[0]}, 2) = ${result}`);
        return result;
      },
      (grad, inputs, cache) => {
        console.log('\n=== In backward function ===');
        console.log('grad:', grad);
        console.log('inputs:', inputs);
        console.log('inputs[0]:', inputs[0]);
        console.log('cache:', cache);
        
        const derivative = 2 * Math.pow(inputs[0], 1);
        const result = grad * derivative;
        
        console.log(`Derivative: 2 * ${inputs[0]}^1 = ${derivative}`);
        console.log(`Result: ${grad} * ${derivative} = ${result}`);
        
        return [result];
      }
    );
    
    const y = new RandomVariable(customPowNode, [], graph);
    
    console.log('=== Forward pass ===');
    const forwardValue = y.forward();
    console.log('Forward value:', forwardValue);
    
    console.log('\n=== Backward pass ===');
    const gradients = y.backward();
    const xGrad = gradients.get(x.getNode());
    
    console.log('\nFinal gradient w.r.t. x:', xGrad);
    console.log('Expected: 2 * 3 = 6');
    
    expect(xGrad).toBe(6);
  });
  
  test('Chain with custom nodes to trace values', () => {
    const mu = RandomVariable.parameter(0, 'mu');
    const graph = ComputationGraph.current();
    
    // Create x - mu with logging
    const subtractNode = graph.createNode(
      'subtract_debug',
      [RandomVariable.constant(1).getNode(), mu.getNode()],
      (inputs) => {
        const result = inputs[0] - inputs[1];
        console.log(`Subtract forward: ${inputs[0]} - ${inputs[1]} = ${result}`);
        return result;
      },
      (grad, inputs) => {
        console.log(`\nSubtract backward: grad=${grad}, inputs=[${inputs[0]}, ${inputs[1]}]`);
        return [grad * 1, grad * (-1)];
      }
    );
    
    const diff = new RandomVariable(subtractNode, [], graph);
    
    // Create diff^2 with logging
    const squareNode = graph.createNode(
      'square_debug', 
      [diff.getNode()],
      (inputs) => {
        const result = inputs[0] * inputs[0];
        console.log(`Square forward: ${inputs[0]}^2 = ${result}`);
        return result;
      },
      (grad, inputs) => {
        console.log(`\nSquare backward: grad=${grad}, inputs=[${inputs[0]}]`);
        const derivative = 2 * inputs[0];
        const result = grad * derivative;
        console.log(`  Derivative: 2 * ${inputs[0]} = ${derivative}`);
        console.log(`  Result: ${grad} * ${derivative} = ${result}`);
        return [result];
      }
    );
    
    const squared = new RandomVariable(squareNode, [], graph);
    
    console.log('=== Forward pass ===');
    squared.forward();
    
    console.log('\n=== Backward pass ===');
    const gradients = squared.backward();
    
    console.log('\nFinal gradient w.r.t. mu:', gradients.get(mu.getNode()));
    console.log('Expected: -2');
  });
});