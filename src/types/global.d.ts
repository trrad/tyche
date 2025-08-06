/**
 * Global type augmentations for Tyche
 *
 * This file extends built-in TypeScript types to include
 * environment-specific features that aren't in the standard lib.
 */

/**
 * Augment the global Error interface to include V8's captureStackTrace
 * This is available in Node.js and Chrome but not in the TypeScript lib
 */
declare global {
  interface ErrorConstructor {
    /**
     * V8's stack trace capture function
     * Available in Node.js and Chrome, but not in all JavaScript engines
     */
    captureStackTrace?(targetObject: object, constructorOpt?: Function): void;
  }
}

// This makes the file a module (required for declare global to work)
export {};
