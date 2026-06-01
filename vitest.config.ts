import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // Covers files exercised by the test suite (not every file in the repo).
      // Floors sit just below current numbers to catch regressions without churn.
      thresholds: {
        statements: 80,
        branches: 68,
        functions: 80,
        lines: 80,
      },
    },
  },
})
