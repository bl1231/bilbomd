import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../../../test/test-utils'
import { AccessModeSplit } from '../AccessModeSplit'

vi.mock('../../../../slices/analyticsApiSlice', () => ({
  useGetUsageAccessModeSplitQuery: vi.fn(() => ({
    isLoading: false,
    data: [
      { pipeline: 'pdb', access_mode: 'user', count: 3 },
      { pipeline: 'pdb', access_mode: 'anonymous', count: 2 },
      { pipeline: 'crd', access_mode: 'user', count: 5 }
    ]
  }))
}))
import { useGetUsageAccessModeSplitQuery } from '../../../../slices/analyticsApiSlice'

describe('AccessModeSplit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders heading and aggregated totals', () => {
    renderWithProviders(<AccessModeSplit />)
    expect(screen.getByText(/Access Mode Split/i)).toBeInTheDocument()
    // Aggregated row for pdb: user 3, anon 2, total 5
    const pdbRow = screen.getByText('pdb').closest('tr')!
    const cells = pdbRow.querySelectorAll('td')
    expect(cells[1].textContent).toBe('3')
    expect(cells[2].textContent).toBe('2')
    expect(cells[3].textContent).toBe('5')
    // crd row: user 5, anon 0, total 5
    const crdRow = screen.getByText('crd').closest('tr')!
    const crdCells = crdRow.querySelectorAll('td')
    expect(crdCells[1].textContent).toBe('5')
    expect(crdCells[2].textContent).toBe('0')
    expect(crdCells[3].textContent).toBe('5')
  })

  it('shows skeleton when loading', () => {
    vi.mocked(useGetUsageAccessModeSplitQuery).mockReturnValueOnce({
      isLoading: true,
      data: []
    } as any)
    renderWithProviders(<AccessModeSplit />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
