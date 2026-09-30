import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from 'test/rendersWithProviders'
import JobInputsSection from '../JobInputsSection'
import type { JobSource } from '../jobSource'
import type { JobView } from '../jobView'
import { makeView } from './fixtures'

const triggerGetFile = vi.fn()
vi.mock('slices/jobsApiSlice', () => ({
  useLazyGetFileByIdAndNameQuery: () => [
    triggerGetFile,
    { data: 'constraint file text', isLoading: false, error: undefined }
  ]
}))

const charmmView = makeView({
  md_engine: 'CHARMM',
  inputs: {
    data_file: 'saxs.dat',
    pdb_file: 'model.pdb',
    const_inp_file: 'const.inp'
  }
})

const renderSection = (source: JobSource, view: JobView) => {
  renderWithProviders(
    <JobInputsSection
      source={source}
      view={view}
    />
  )
  fireEvent.click(screen.getByText('Inputs & parameters'))
}

describe('JobInputsSection', () => {
  it('starts collapsed', () => {
    renderWithProviders(
      <JobInputsSection
        source={{ kind: 'owner', id: 'job-1' }}
        view={makeView()}
      />
    )
    expect(
      screen.getByRole('button', { name: /inputs & parameters/i })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('lists the input files and the UUID, but not the Mongo id', () => {
    renderSection({ kind: 'public', token: 'tok' }, makeView())
    expect(screen.getByText('saxs.dat')).toBeInTheDocument()
    expect(screen.getByText('model.pdb')).toBeInTheDocument()
    expect(screen.getByText('UUID:')).toBeInTheDocument()
    expect(screen.queryByText('MongoDB ID:')).not.toBeInTheDocument()
    expect(screen.queryByText('job-1')).not.toBeInTheDocument()
  })

  it('shows the constraint file name as plain text on public pages', () => {
    renderSection({ kind: 'public', token: 'tok' }, charmmView)
    expect(screen.getByText('const.inp')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /open const.inp/i })
    ).not.toBeInTheDocument()
  })

  it('lets owners open the constraint file', async () => {
    renderSection({ kind: 'owner', id: 'job-1' }, charmmView)
    fireEvent.click(screen.getByRole('button', { name: /open const.inp/i }))
    expect(triggerGetFile).toHaveBeenCalledWith({
      id: 'job-1',
      filename: 'const.inp'
    })
    expect(await screen.findByText('constraint file text')).toBeInTheDocument()
  })

  it('lists the jobs a multi job combines', () => {
    renderSection(
      { kind: 'owner', id: 'job-1' },
      makeView({
        jobType: 'multi',
        inputs: { bilbomd_uuids: ['uuid-a', 'uuid-b'] }
      })
    )
    expect(screen.getByText('Combined:')).toBeInTheDocument()
    expect(screen.getByText('uuid-a')).toBeInTheDocument()
    expect(screen.getByText('uuid-b')).toBeInTheDocument()
  })

  it('links an anonymous job to its public page for owners', () => {
    renderSection(
      { kind: 'owner', id: 'job-1' },
      makeView({ accessMode: 'anonymous', publicId: 'pub-1' })
    )
    expect(screen.getByText('Public link:')).toBeInTheDocument()
    expect(screen.getByText('pub-1')).toBeInTheDocument()
  })
})
