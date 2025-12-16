import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiCards } from '../components/KpiCards'

const mockData = {
  users: 5,
  jobs: 42,
  multijobs: 7,
  jobsCompleted: 30,
  jobsFailed: 3,
  usagePerPipeline: [
    { pipeline: 'pdb', count: 10 },
    { pipeline: 'crd', count: 8 },
    { pipeline: 'auto', count: 12 },
    { pipeline: 'sans', count: 6 },
    { pipeline: 'multi', count: 6 }
  ]
}

vi.mock('../../../slices/analyticsApiSlice', () => ({
  useGetSummaryQuery: () => ({
    data: mockData,
    isLoading: false,
    isError: false
  })
}))

describe('KpiCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders KPI values and usage chips', () => {
    render(<KpiCards />)

    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Jobs')).toBeInTheDocument()
    expect(screen.getByText('MultiJobs')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    expect(screen.getByText('pdb: 10')).toBeInTheDocument()
    expect(screen.getByText('crd: 8')).toBeInTheDocument()
    expect(screen.getByText('auto: 12')).toBeInTheDocument()
  })
})
