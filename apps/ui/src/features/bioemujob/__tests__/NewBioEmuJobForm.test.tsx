import React from 'react'
import { describe, it, beforeEach, vi, Mock, expect } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import NewBioEmuJob from '../NewBioEmuJobForm'
import { useAddNewBioEmuJobMutation } from 'slices/jobsApiSlice'
import { useGetConfigsQuery } from 'slices/configsApiSlice'
import useAuth from 'hooks/useAuth'

// The pre-submission mass check has its own tests
vi.mock('features/mwcheck/MwCheck', () => ({ default: () => null }))
vi.mock('slices/jobsApiSlice', () => ({
  useAddNewBioEmuJobMutation: vi.fn()
}))
vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: vi.fn()
}))
vi.mock('hooks/useAuth', () => ({ __esModule: true, default: vi.fn() }))
vi.mock('hooks/useTitle', () => ({ __esModule: true, default: () => {} }))
vi.mock('react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useNavigate: () => vi.fn()
}))
vi.mock('features/jobs/FileSelect', () => ({
  __esModule: true,
  default: () => <div data-testid="file-select" />
}))
vi.mock('features/jobs/SaxsDataOptions', () => ({
  __esModule: true,
  default: () => <div data-testid="saxs-options" />
}))
vi.mock('../BioEmuPipelineSchematic', () => ({
  __esModule: true,
  default: () => <div data-testid="schematic" />
}))
vi.mock('components/TitleField', () => ({
  __esModule: true,
  default: () => <div data-testid="title-field" />
}))

const setup = (config: Record<string, string>, isAdmin: boolean) => {
  ;(useGetConfigsQuery as Mock).mockReturnValue({
    data: config,
    isLoading: false
  })
  ;(useAuth as Mock).mockReturnValue({ isAdmin })
  render(<NewBioEmuJob />)
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(useAddNewBioEmuJobMutation as Mock).mockReturnValue([
    vi.fn(),
    { isSuccess: false }
  ])
})

describe('NewBioEmuJobForm', () => {
  it('says so when the pipeline is not enabled', () => {
    setup({ enableBilboMdBioEmu: 'false' }, true)
    expect(screen.getByText(/is not enabled on this deployment/)).toBeVisible()
    expect(screen.queryByTestId('file-select')).not.toBeInTheDocument()
  })

  it('is closed to non-admins while in testing', () => {
    setup({ enableBilboMdBioEmu: 'true' }, false)
    expect(
      screen.getByText(/is being tested and is open to administrators/)
    ).toBeVisible()
    expect(screen.queryByTestId('file-select')).not.toBeInTheDocument()
  })

  it("shows the form to admins, with the deployment's size limit", () => {
    setup({ enableBilboMdBioEmu: 'true', bioemuMaxTokens: '1200' }, true)
    expect(screen.getByTestId('file-select')).toBeInTheDocument()
    expect(
      screen.getByText(/Limit for BioEmu2 jobs: 1200 residues/)
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled()
  })

  it('falls back to the default limit when the server sends none', () => {
    setup({ enableBilboMdBioEmu: 'true' }, true)
    expect(
      screen.getByText(/Limit for BioEmu2 jobs: 1000 residues/)
    ).toBeVisible()
  })
})
