module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ['react-hooks', 'react-refresh'],
  extends: ['eslint:recommended', 'plugin:react-hooks/recommended'],
  settings: {
    react: {
      version: 'detect'
    }
  },
  rules: {
    'no-console': 'warn',
    'react-refresh/only-export-components': 'off'
  },
  overrides: [
    {
      files: ['tests/**/*.{js,jsx,ts,tsx}', 'frontend/tests/**/*.{js,jsx,ts,tsx}', '**/*.test.{js,jsx,ts,tsx}', '**/*.spec.{js,jsx,ts,tsx}'],
      env: {
        jest: true,
        node: true,
        browser: true
      },
      globals: {
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        jest: 'readonly'
      }
    },
    {
      // Config files run in Node
      files: ['tailwind.config.*', 'postcss.config.*', 'vite.config.*', 'cypress.*', 'playwright.config.*', 'e2e/**', 'frontend/tailwind.config.*', 'tailwind.config.js'],
      env: {
        node: true
      }
    }
  ]
};
