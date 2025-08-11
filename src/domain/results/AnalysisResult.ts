/**
 * Base class for all analysis results in Tyche
 * Based on InterfaceStandards.md specification
 */

import { ResultMetadata } from './ResultMetadata';

/**
 * Abstract base class that all analysis results extend
 * Provides common functionality for serialization and export
 */
export abstract class AnalysisResult {
  /**
   * Create a new analysis result
   * @param metadata - Metadata about the analysis
   */
  constructor(protected metadata: ResultMetadata) {}

  /**
   * Get the metadata for this result
   */
  getMetadata(): ResultMetadata {
    return this.metadata;
  }

  /**
   * Convert the result to a JSON-serializable object
   * Must be implemented by all concrete result classes
   */
  abstract toJSON(): object;

  /**
   * Export the result in the specified format
   * @param format - Export format ('json' or 'csv')
   * @returns A Blob containing the exported data
   */
  async export(format: 'json' | 'csv'): Promise<Blob> {
    if (format === 'json') {
      return this.exportJSON();
    } else {
      return this.exportCSV();
    }
  }

  /**
   * Export as JSON
   */
  private async exportJSON(): Promise<Blob> {
    const data = this.toJSON();
    const jsonString = JSON.stringify(data, null, 2);
    return new Blob([jsonString], { type: 'application/json' });
  }

  /**
   * Export as CSV
   * Default implementation - subclasses can override for custom CSV format
   */
  protected async exportCSV(): Promise<Blob> {
    // Basic CSV export - flatten the JSON structure
    const data = this.toJSON();
    const csv = this.flattenToCSV(data);
    return new Blob([csv], { type: 'text/csv' });
  }

  /**
   * Helper to flatten a nested object to CSV format
   * Can be overridden by subclasses for custom formatting
   */
  protected flattenToCSV(data: any): string {
    const rows: string[] = [];

    // Simple flattening - subclasses should override for better formatting
    const flatten = (obj: any, prefix = ''): Record<string, any> => {
      const result: Record<string, any> = {};

      for (const key in obj) {
        if (obj[key] === null || obj[key] === undefined) {
          result[prefix + key] = '';
        } else if (
          typeof obj[key] === 'object' &&
          !Array.isArray(obj[key]) &&
          !(obj[key] instanceof Date)
        ) {
          Object.assign(result, flatten(obj[key], prefix + key + '.'));
        } else if (Array.isArray(obj[key])) {
          result[prefix + key] = obj[key].join(';');
        } else {
          result[prefix + key] = obj[key];
        }
      }

      return result;
    };

    const flattened = flatten(data);
    const headers = Object.keys(flattened);
    const values = Object.values(flattened).map((v) =>
      typeof v === 'string' && v.includes(',') ? `"${v}"` : String(v)
    );

    rows.push(headers.join(','));
    rows.push(values.join(','));

    return rows.join('\n');
  }
}
