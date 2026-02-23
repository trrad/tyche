/**
 * Editable label utility for D3 visualizations
 *
 * Provides click-to-edit functionality for text labels, allowing users to
 * enter exact values and have the visualization update accordingly.
 */

import * as d3 from 'd3';

export interface EditableLabelConfig {
  // Initial value to display
  initialValue: number;

  // Format function for display (e.g., d => `${d}%` or d => `$${d.toFixed(2)}`)
  displayFormat: (value: number) => string;

  // Parse function to convert user input string back to number
  // Should return null if input is invalid
  parseInput: (input: string) => number | null;

  // Validation function (optional) - return error message or null if valid
  validate?: (value: number) => string | null;

  // Callback when value changes
  onChange: (newValue: number) => void;

  // Placeholder text for input (optional)
  placeholder?: string;

  // CSS class for the label (optional)
  className?: string;

  // Additional styling (optional)
  fontSize?: string;
  fontWeight?: string;
  fill?: string;
  cursor?: string;
}

/**
 * Make a D3 text selection editable
 *
 * Converts a text element to an editable label that can be clicked to enter a new value.
 * The label will switch to an input field on click, and switch back on blur or Enter key.
 *
 * @param selection - D3 selection of SVG text element(s)
 * @param config - Configuration object
 *
 * @example
 * ```ts
 * const label = svg.append('text')
 *   .attr('x', 100)
 *   .attr('y', 50);
 *
 * makeEditable(label, {
 *   initialValue: 0.10,
 *   displayFormat: d => `${(d * 100).toFixed(0)}%`,
 *   parseInput: s => {
 *     const num = parseFloat(s.replace('%', ''));
 *     return isNaN(num) ? null : num / 100;
 *   },
 *   onChange: newValue => {
 *     console.log('New threshold:', newValue);
 *     updateVisualization(newValue);
 *   }
 * });
 * ```
 */
export function makeEditable(
  selection: d3.Selection<SVGTextElement, any, any, any>,
  config: EditableLabelConfig
): void {
  const {
    initialValue,
    displayFormat,
    parseInput,
    validate,
    onChange,
    placeholder = 'Enter value',
    className = 'editable-label',
    fontSize = '11px',
    fontWeight = '600',
    fill = '#374151',
    cursor = 'pointer',
  } = config;

  let currentValue = initialValue;

  // Style the text element
  selection
    .attr('class', className)
    .style('cursor', cursor)
    .style('font-size', fontSize)
    .style('font-weight', fontWeight)
    .style('fill', fill)
    .text(displayFormat(currentValue));

  // Add click handler to enter edit mode
  selection.on('click', function (event) {
    event.stopPropagation(); // Prevent event from bubbling

    const textElement = d3.select(this);
    const parent = d3.select(this.parentNode);

    // Get position and dimensions
    const bbox = (this as SVGTextElement).getBBox();
    const x = parseFloat(textElement.attr('x') || '0');
    const y = parseFloat(textElement.attr('y') || '0');
    const textAnchor = textElement.attr('text-anchor') || 'start';

    // Hide the text element
    textElement.style('display', 'none');

    // Create foreignObject to hold HTML input
    const foreignObject = parent
      .append('foreignObject')
      .attr('class', 'editable-label-input-container')
      .attr('width', Math.max(80, bbox.width + 20))
      .attr('height', 30);

    // Position based on text anchor
    if (textAnchor === 'middle') {
      foreignObject.attr('x', x - Math.max(80, bbox.width + 20) / 2);
    } else if (textAnchor === 'end') {
      foreignObject.attr('x', x - Math.max(80, bbox.width + 20));
    } else {
      foreignObject.attr('x', x);
    }
    foreignObject.attr('y', y - 20); // Center vertically around text baseline

    // Create HTML input inside foreignObject
    const input = foreignObject
      .append('xhtml:div')
      .style('width', '100%')
      .style('height', '100%')
      .style('display', 'flex')
      .style('align-items', 'center')
      .append('xhtml:input')
      .attr('type', 'text')
      .attr('placeholder', placeholder)
      .attr('value', displayFormat(currentValue))
      .style('width', '100%')
      .style('padding', '4px 6px')
      .style('font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif')
      .style('font-size', fontSize)
      .style('font-weight', fontWeight)
      .style('border', '2px solid #374151')
      .style('border-radius', '3px')
      .style('background', '#ffffff')
      .style('outline', 'none')
      .style('text-align', 'center');

    // Focus and select all text
    const inputNode = input.node() as HTMLInputElement;
    if (inputNode) {
      inputNode.focus();
      inputNode.select();
    }

    // Handler to commit the edit
    const commitEdit = () => {
      const inputValue = inputNode?.value || '';
      const parsedValue = parseInput(inputValue);

      if (parsedValue !== null) {
        // Validate if validator provided
        if (validate) {
          const error = validate(parsedValue);
          if (error) {
            alert(error);
            return; // Keep input open
          }
        }

        // Update value
        currentValue = parsedValue;
        onChange(parsedValue);

        // Update display
        textElement.text(displayFormat(currentValue));
      }

      // Remove input and show text again
      foreignObject.remove();
      textElement.style('display', null);
    };

    // Handler to cancel the edit
    const cancelEdit = () => {
      foreignObject.remove();
      textElement.style('display', null);
    };

    // Commit on Enter, cancel on Escape
    input.on('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancelEdit();
      }
    });

    // Commit on blur (clicking outside)
    input.on('blur', () => {
      // Small delay to allow click events to process
      setTimeout(commitEdit, 100);
    });
  });

  // Expose method to update value programmatically
  (selection as any).updateValue = (newValue: number) => {
    currentValue = newValue;
    selection.text(displayFormat(currentValue));
  };
}

/**
 * Parse percentage input (handles "10%", "10", "-5%", etc.)
 *
 * @param input - User input string
 * @returns Decimal value (0.10 for "10%") or null if invalid
 */
export function parsePercentInput(input: string): number | null {
  const trimmed = input.trim().replace('%', '').replace(/,/g, '');
  const num = parseFloat(trimmed);

  if (isNaN(num)) {
    return null;
  }

  // Convert to decimal (10 -> 0.10)
  return num / 100;
}

/**
 * Parse dollar input (handles "$1.50", "1.5", "-$2.00", etc.)
 *
 * @param input - User input string
 * @returns Dollar value or null if invalid
 */
export function parseDollarInput(input: string): number | null {
  const trimmed = input.trim().replace('$', '').replace(/,/g, '');
  const num = parseFloat(trimmed);

  if (isNaN(num)) {
    return null;
  }

  return num;
}

/**
 * Create validator that ensures value is within range
 *
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param unit - Unit name for error message (e.g., "%", "$")
 * @returns Validation function
 */
export function rangeValidator(
  min: number,
  max: number,
  unit: string = ''
): (value: number) => string | null {
  return (value: number) => {
    if (value < min || value > max) {
      return `Value must be between ${min}${unit} and ${max}${unit}`;
    }
    return null;
  };
}
