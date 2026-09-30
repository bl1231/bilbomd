import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ResubmitAutoJobForm from '../ResubmitAutoJobForm'

const { addNewAutoJob, navigate } = vi.hoisted(() => ({
  addNewAutoJob: vi.fn(),
  navigate: vi.fn()
}))

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useParams: () => ({ id: 'orig-job-1' }),
    useNavigate: () => navigate
  }
})

vi.mock('../../../slices/jobsApiSlice', () => ({
  useAddNewAutoJobMutation: () => [addNewAutoJob, { isSuccess: false }],
  useGetJobByIdQuery: () => ({
    data: {
      mongo: {
        id: 'orig-job-1',
        jobType: 'auto',
        title: 'my job',
        pdb_file: 'model.pdb',
        pae_file: 'pae.json',
        data_file: 'saxs.dat'
      }
    },
    isLoading: false,
    isError: false
  }),
  useCheckJobFilesQuery: () => ({
    data: { pdb_file: true, pae_file: true, dat_file: true }
  })
}))

vi.mock('slices/configsApiSlice', () => ({
  useGetConfigsQuery: () => ({ data: { useNersc: 'false' }, isLoading: false })
}))

const renderForm = () =>
  render(
    <MemoryRouter>
      <ResubmitAutoJobForm />
    </MemoryRouter>
  )

const submit = async () => {
  const button = screen.getByRole('button', { name: /submit/i })
  await waitFor(() => expect(button).toBeEnabled())
  await userEvent.click(button)
}

describe('ResubmitAutoJobForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses the original files and opens the new job page', async () => {
    addNewAutoJob.mockReturnValue({
      unwrap: () => Promise.resolve({ jobid: 'new-job-9' })
    })
    renderForm()

    await submit()

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/dashboard/jobs/new-job-9')
    )
    const form = addNewAutoJob.mock.lastCall?.[0] as FormData
    expect(form.get('resubmit')).toBe('true')
    expect(form.get('original_job_id')).toBe('orig-job-1')
    expect(form.get('reuse_pdb_file')).toBe('true')
    expect(form.get('reuse_pae_file')).toBe('true')
    expect(form.get('reuse_dat_file')).toBe('true')
  })

  it('shows the backend error when resubmission fails', async () => {
    addNewAutoJob.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 410,
          data: {
            message:
              'The original saxs.dat is no longer available. Please upload it again.'
          }
        })
    })
    renderForm()

    await submit()

    expect(
      await screen.findByText(/saxs\.dat is no longer available/)
    ).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })
})
