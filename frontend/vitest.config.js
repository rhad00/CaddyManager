import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{js,jsx,ts,tsx}', 'tests/**/*.spec.{js,jsx,ts,tsx}', 'frontend/tests/**/*.test.{js,jsx,ts,tsx}', 'frontend/tests/**/*.spec.{js,jsx,ts,tsx}'],
    exclude: ['**/e2e/**'],
    setupFiles: ['./tests/setupTests.js'],
  },
})
