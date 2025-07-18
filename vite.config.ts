// vite.config.ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

// Define available demos - simple and clear
const demos = {
  'ab-test': {
    entry: '/examples/ab-test-demo.html',
    name: 'A/B Test Demo (Classic)'
  },
  'combined': {
    entry: '/examples/combined-demo.html',
    name: 'Combined Analysis Demo (React)'
  }
};

// Get the demo target from environment variable or default to 'combined'
const demoTarget = process.env.DEMO || 'combined';
const selectedDemo = demos[demoTarget];

if (!selectedDemo) {
  console.error(`❌ Unknown demo: '${demoTarget}'`);
  console.log('📋 Available demos:', Object.keys(demos).join(', '));
  process.exit(1);
}

console.log(`🚀 Starting ${selectedDemo.name}`);
console.log(`📂 Entry: ${selectedDemo.entry}`);

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    open: selectedDemo.entry,
    host: true // Enable network access for mobile testing
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Tyche',
      fileName: 'tyche',
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom'] // Pre-bundle React for better dev performance
  }
});