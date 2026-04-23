/* global vi, describe, test, expect, beforeEach */
import React from 'react'
import { render, screen } from '@testing-library/react'

// A component that deliberately throws during render
const CrashingChild = () => {
  throw new Error('Test crash')
}

// Suppress console.error noise from React error boundary
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

import ErrorBoundary from '../src/components/ErrorBoundary'

describe('ErrorBoundary', () => {
  test('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <p>OK content</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('OK content')).toBeInTheDocument()
  })

  test('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <CrashingChild />
      </ErrorBoundary>
    )
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/Try Again/i)).toBeInTheDocument()
    expect(screen.getByText(/Go to Dashboard/i)).toBeInTheDocument()
  })
})
