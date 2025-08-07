/**
 * Core error handling system for Tyche
 *
 * Provides consistent error handling across the entire codebase with:
 * - Structured error codes for different error categories
 * - Context preservation for debugging
 * - Proper stack trace handling
 */

/**
 * Comprehensive error codes covering all error categories in Tyche
 */
export enum ErrorCode {
  // Data errors
  INVALID_DATA = 'INVALID_DATA',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  DATA_QUALITY = 'DATA_QUALITY',

  // Model errors
  MODEL_MISMATCH = 'MODEL_MISMATCH',
  CONVERGENCE_FAILED = 'CONVERGENCE_FAILED',
  INVALID_PRIOR = 'INVALID_PRIOR',
  INVALID_CONFIG = 'INVALID_CONFIG',

  // Worker errors
  WORKER_TIMEOUT = 'WORKER_TIMEOUT',
  WORKER_ERROR = 'WORKER_ERROR',

  // User errors
  INVALID_INPUT = 'INVALID_INPUT',
  CANCELLED = 'CANCELLED',

  // System errors
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Custom error class for Tyche with structured error codes and context
 *
 * @example
 * ```typescript
 * throw new TycheError(
 *   ErrorCode.INVALID_DATA,
 *   'Data must contain at least 10 observations',
 *   { actualCount: 5, minimumRequired: 10 }
 * );
 * ```
 */
export class TycheError extends Error {
  /**
   * Create a new TycheError
   *
   * @param code - Structured error code for categorization
   * @param message - Human-readable error message
   * @param context - Optional context object for debugging
   */
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'TycheError';

    // Ensure proper stack trace in V8 engines (Node.js/Chrome)
    // Type is now properly declared in src/types/global.d.ts
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TycheError);
    }
  }

  /**
   * Create a formatted string representation of the error
   * Includes code, message, and context for debugging
   */
  toString(): string {
    const contextStr = this.context ? ` Context: ${JSON.stringify(this.context)}` : '';
    return `${this.name} [${this.code}]: ${this.message}${contextStr}`;
  }

  /**
   * Check if this error matches a specific error code
   */
  is(code: ErrorCode): boolean {
    return this.code === code;
  }

  /**
   * Check if this error is in a category of error codes
   */
  isOneOf(codes: ErrorCode[]): boolean {
    return codes.includes(this.code);
  }
}

/**
 * Type guard to check if an error is a TycheError
 */
export function isTycheError(error: unknown): error is TycheError {
  return error instanceof TycheError;
}

/**
 * Helper function to wrap unknown errors as TycheError
 * Useful for catch blocks where the error type is unknown
 */
export function wrapError(error: unknown, code: ErrorCode = ErrorCode.INTERNAL_ERROR): TycheError {
  if (isTycheError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const context =
    error instanceof Error ? { originalStack: error.stack } : { originalError: error };

  return new TycheError(code, message, context);
}
