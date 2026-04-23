/* global vi, describe, test, expect */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmModal from '../src/components/ConfirmModal'

describe('ConfirmModal', () => {
  test('does not render when open is false', () => {
    const { container } = render(
      <ConfirmModal open={false} title="Delete" message="Sure?" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  test('renders title and message when open', () => {
    render(
      <ConfirmModal open={true} title="Delete Item" message="Are you sure?" onConfirm={() => {}} onCancel={() => {}} />
    )
    expect(screen.getByText('Delete Item')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  test('has proper ARIA attributes', () => {
    render(
      <ConfirmModal open={true} title="Delete" message="Sure?" onConfirm={() => {}} onCancel={() => {}} />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-modal-title')
  })

  test('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmModal open={true} title="Delete" message="Sure?" onConfirm={onConfirm} onCancel={() => {}} />
    )
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmModal open={true} title="Delete" message="Sure?" onConfirm={() => {}} onCancel={onCancel} />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmModal open={true} title="Delete" message="Sure?" onConfirm={() => {}} onCancel={onCancel} />
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
