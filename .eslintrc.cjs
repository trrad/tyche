module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules: {
    // Basic rules that work with our setup
    'no-unused-vars': 'off',                    // Allow unused variables
    '@typescript-eslint/no-unused-vars': 'off', // TypeScript version
    'no-console': 'off',                        // Allow console logs
    'no-undef': 'off',                         // TypeScript handles this
    '@typescript-eslint/no-explicit-any': 'off', // Allow any type
    // Mathematical/scientific code patterns
    'no-case-declarations': 'off',             // Allow declarations in switch cases
    'no-constant-condition': 'off',            // Allow while(true) loops in algorithms
    'no-loss-of-precision': 'off',             // Allow precise mathematical constants
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'src/archive/**/*',
    'examples/**/*',
    '**/*.test.ts',
    '**/*.spec.ts',
  ],
}; 