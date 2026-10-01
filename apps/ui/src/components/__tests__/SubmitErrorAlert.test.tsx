import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import SubmitErrorAlert from '../SubmitErrorAlert'

describe('SubmitErrorAlert', () => {
  it('renders nothing when there is no error', () => {
    const { container } = render(<SubmitErrorAlert error={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders just the message when there are no details', () => {
    render(
      <SubmitErrorAlert error={{ message: 'Queue unavailable', details: [] }} />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Queue unavailable')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists each detail under the message', () => {
    render(
      <SubmitErrorAlert
        error={{
          message: 'Validation failed',
          details: ['Too few SAXS points', 'Rg min is required']
        }}
      />
    )
    expect(screen.getByText('Validation failed')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Too few SAXS points',
      'Rg min is required'
    ])
  })
})
