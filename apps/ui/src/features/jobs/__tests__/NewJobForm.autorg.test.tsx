import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'

vi.mock('features/mwcheck/MwCheck', () => ({ default: () => null }))
vi.mock('./../SAXSGuinierPlot', () => ({ default: () => null }))

// AutoRg answers only when the test says so
const autoRg = vi.hoisted(() => ({
  resolve: (_: unknown) => {}
}))
vi.mock('../../../slices/jobsApiSlice', () => ({
  useAddNewJobMutation: () => [vi.fn(), { isSuccess: false }],
  useCalculateAutoRgMutation: () => [
    () => ({
      unwrap: () =>
        new Promise((resolve) => {
          autoRg.resolve = resolve
        })
    }),
    { isLoading: false }
  ]
}))
vi.mock('../../../slices/publicJobsApiSlice', () => ({
  useAddNewPublicJobMutation: () => [vi.fn(), { isSuccess: false }],
  useGetClassicExampleConstraintsQuery: () => ({ isLoading: true })
}))
vi.mock('../../../slices/configsApiSlice', () => ({
  useGetConfigsQuery: () => ({ data: { useNersc: 'false' }, isLoading: false })
}))
// The SAXS file is checked elsewhere; here it only has to pass
vi.mock('schemas/ValidationFunctions', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  analyzeSaxsFile: async () => ({
    valid: true,
    points: [{ q: 0.01, intensity: 1, error: 0.1 }],
    warnings: []
  })
}))
vi.mock('schemas/ExpdataSchema', () => ({
  expdataFileSchema: { isValid: async () => true }
}))

import NewJobForm from '../NewJobForm'

describe('NewJobForm AutoRg', () => {
  beforeEach(() => {
    autoRg.resolve = () => {}
  })

  it('keeps what was changed while AutoRg ran', async () => {
    const user = userEvent.setup()
    render(<NewJobForm />)
    const datInput = document.getElementById(
      'dat_file-file-upload'
    ) as HTMLInputElement
    await user.upload(datInput, new File(['0.01 1 0.1'], 'data.dat'))

    // Typed while AutoRg is still running
    await user.type(screen.getByLabelText('Title'), 'my-job')
    autoRg.resolve({ rg: 30, rg_min: 24, rg_max: 45, qmin: 0.01, qmax: 0.03 })

    await waitFor(() =>
      expect(screen.getByLabelText('Rg Min')).toHaveValue('24')
    )
    expect(screen.getByLabelText('Rg Max')).toHaveValue('45')
    expect(screen.getByLabelText('Title')).toHaveValue('my-job')
  })
})
