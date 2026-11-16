import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs work both at / and at /math-analysis-workbench/.
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-zrender',
              test: /node_modules[\\/]zrender/,
              priority: 30,
            },
            {
              name: 'vendor-echarts',
              test: /node_modules[\\/]echarts/,
              priority: 25,
            },
            {
              name: 'vendor-katex',
              test: /node_modules[\\/]katex/,
              priority: 20,
            },
            {
              name: 'vendor-mathjs',
              test: /node_modules[\\/]mathjs/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
});
