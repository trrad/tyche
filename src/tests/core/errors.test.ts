import { describe, it, expect } from 'vitest';
import { TycheError, ErrorCode, isTycheError, wrapError } from '../../core/errors';

describe('TycheError', () => {
  describe('constructor', () => {
    it('should create error with code and message', () => {
      const error = new TycheError(ErrorCode.INVALID_DATA, 'Test message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TycheError);
      expect(error.name).toBe('TycheError');
      expect(error.code).toBe(ErrorCode.INVALID_DATA);
      expect(error.message).toBe('Test message');
      expect(error.context).toBeUndefined();
    });

    it('should create error with context', () => {
      const context = { actualCount: 5, minimumRequired: 10 };
      const error = new TycheError(ErrorCode.INSUFFICIENT_DATA, 'Not enough data', context);

      expect(error.code).toBe(ErrorCode.INSUFFICIENT_DATA);
      expect(error.message).toBe('Not enough data');
      expect(error.context).toEqual(context);
    });

    it('should preserve stack trace', () => {
      const error = new TycheError(ErrorCode.INTERNAL_ERROR, 'Test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TycheError');
    });
  });

  describe('toString', () => {
    it('should format error without context', () => {
      const error = new TycheError(ErrorCode.INVALID_INPUT, 'Bad input');
      expect(error.toString()).toBe('TycheError [INVALID_INPUT]: Bad input');
    });

    it('should format error with context', () => {
      const error = new TycheError(ErrorCode.DATA_QUALITY, 'Data quality issue', {
        field: 'revenue',
        issue: 'negative values',
      });

      const expected =
        'TycheError [DATA_QUALITY]: Data quality issue Context: {"field":"revenue","issue":"negative values"}';
      expect(error.toString()).toBe(expected);
    });
  });

  describe('is', () => {
    it('should return true for matching error code', () => {
      const error = new TycheError(ErrorCode.MODEL_MISMATCH, 'Test');
      expect(error.is(ErrorCode.MODEL_MISMATCH)).toBe(true);
    });

    it('should return false for non-matching error code', () => {
      const error = new TycheError(ErrorCode.MODEL_MISMATCH, 'Test');
      expect(error.is(ErrorCode.CONVERGENCE_FAILED)).toBe(false);
    });
  });

  describe('isOneOf', () => {
    it('should return true if error code is in list', () => {
      const error = new TycheError(ErrorCode.WORKER_TIMEOUT, 'Test');
      const codes = [ErrorCode.WORKER_TIMEOUT, ErrorCode.WORKER_ERROR];
      expect(error.isOneOf(codes)).toBe(true);
    });

    it('should return false if error code is not in list', () => {
      const error = new TycheError(ErrorCode.CANCELLED, 'Test');
      const codes = [ErrorCode.WORKER_TIMEOUT, ErrorCode.WORKER_ERROR];
      expect(error.isOneOf(codes)).toBe(false);
    });

    it('should return false for empty list', () => {
      const error = new TycheError(ErrorCode.CANCELLED, 'Test');
      expect(error.isOneOf([])).toBe(false);
    });
  });
});

describe('ErrorCode', () => {
  it('should have all required error codes', () => {
    // Data errors
    expect(ErrorCode.INVALID_DATA).toBe('INVALID_DATA');
    expect(ErrorCode.INSUFFICIENT_DATA).toBe('INSUFFICIENT_DATA');
    expect(ErrorCode.DATA_QUALITY).toBe('DATA_QUALITY');

    // Model errors
    expect(ErrorCode.MODEL_MISMATCH).toBe('MODEL_MISMATCH');
    expect(ErrorCode.CONVERGENCE_FAILED).toBe('CONVERGENCE_FAILED');
    expect(ErrorCode.INVALID_PRIOR).toBe('INVALID_PRIOR');

    // Worker errors
    expect(ErrorCode.WORKER_TIMEOUT).toBe('WORKER_TIMEOUT');
    expect(ErrorCode.WORKER_ERROR).toBe('WORKER_ERROR');

    // User errors
    expect(ErrorCode.INVALID_INPUT).toBe('INVALID_INPUT');
    expect(ErrorCode.CANCELLED).toBe('CANCELLED');

    // System errors
    expect(ErrorCode.NOT_IMPLEMENTED).toBe('NOT_IMPLEMENTED');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
  });
});

describe('isTycheError', () => {
  it('should return true for TycheError instances', () => {
    const error = new TycheError(ErrorCode.INTERNAL_ERROR, 'Test');
    expect(isTycheError(error)).toBe(true);
  });

  it('should return false for regular Error instances', () => {
    const error = new Error('Regular error');
    expect(isTycheError(error)).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isTycheError('string')).toBe(false);
    expect(isTycheError(42)).toBe(false);
    expect(isTycheError(null)).toBe(false);
    expect(isTycheError(undefined)).toBe(false);
    expect(isTycheError({})).toBe(false);
  });
});

describe('wrapError', () => {
  it('should return TycheError as-is', () => {
    const original = new TycheError(ErrorCode.INVALID_DATA, 'Original');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('should wrap regular Error with default code', () => {
    const original = new Error('Regular error');
    const wrapped = wrapError(original);

    expect(wrapped).toBeInstanceOf(TycheError);
    expect(wrapped.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(wrapped.message).toBe('Regular error');
    expect(wrapped.context).toEqual({ originalStack: original.stack });
  });

  it('should wrap regular Error with custom code', () => {
    const original = new Error('Bad input');
    const wrapped = wrapError(original, ErrorCode.INVALID_INPUT);

    expect(wrapped.code).toBe(ErrorCode.INVALID_INPUT);
    expect(wrapped.message).toBe('Bad input');
  });

  it('should wrap string error', () => {
    const wrapped = wrapError('String error');

    expect(wrapped).toBeInstanceOf(TycheError);
    expect(wrapped.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(wrapped.message).toBe('String error');
    expect(wrapped.context).toEqual({ originalError: 'String error' });
  });

  it('should wrap non-string, non-Error values', () => {
    const wrapped = wrapError(42);

    expect(wrapped).toBeInstanceOf(TycheError);
    expect(wrapped.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(wrapped.message).toBe('42');
    expect(wrapped.context).toEqual({ originalError: 42 });
  });

  it('should wrap null and undefined', () => {
    const wrappedNull = wrapError(null);
    expect(wrappedNull.message).toBe('null');
    expect(wrappedNull.context).toEqual({ originalError: null });

    const wrappedUndefined = wrapError(undefined);
    expect(wrappedUndefined.message).toBe('undefined');
    expect(wrappedUndefined.context).toEqual({ originalError: undefined });
  });
});

describe('Error scenarios', () => {
  it('should handle typical usage patterns', () => {
    // Typical data validation error
    const dataError = new TycheError(
      ErrorCode.INVALID_DATA,
      'Data must contain at least 10 observations',
      { actualCount: 5, minimumRequired: 10 }
    );

    expect(dataError.is(ErrorCode.INVALID_DATA)).toBe(true);
    expect(
      dataError.isOneOf([
        ErrorCode.INVALID_DATA,
        ErrorCode.INSUFFICIENT_DATA,
        ErrorCode.DATA_QUALITY,
      ])
    ).toBe(true);

    // Typical model error
    const modelError = new TycheError(
      ErrorCode.CONVERGENCE_FAILED,
      'Model failed to converge after 1000 iterations',
      { iterations: 1000, tolerance: 1e-6, finalError: 0.1 }
    );

    expect(modelError.is(ErrorCode.CONVERGENCE_FAILED)).toBe(true);

    // Worker timeout
    const workerError = new TycheError(ErrorCode.WORKER_TIMEOUT, 'Inference worker timed out', {
      timeoutMs: 30000,
      operation: 'posterior_sampling',
    });

    expect(workerError.isOneOf([ErrorCode.WORKER_TIMEOUT, ErrorCode.WORKER_ERROR])).toBe(true);
  });
});
