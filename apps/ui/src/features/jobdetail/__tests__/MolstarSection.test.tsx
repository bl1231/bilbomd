import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from 'test/server'
import { renderWithProviders } from 'test/rendersWithProviders'
import MolstarSection from '../MolstarSection'
import { AUTO_LOAD_KEY } from '../molstarAutoLoad'
import type { JobSource } from '../jobSource'
import { makeView } from './fixtures'

const viewerProps = vi.fn()
vi.mock('features/molstar/Viewer', () => ({
  default: (props: Record<string, unknown>) => {
    viewerProps(props)
    return <div data-testid="molstar" />
  }
}))

const API = 'http://localhost:3003/api/v1'
const owner: JobSource = { kind: 'owner', id: 'job-1' }
const anon: JobSource = { kind: 'public', token: 'tok' }
const view = makeView({
  results: { classic: { total_num_ensembles: 3 } } as never
})

beforeEach(() => {
  localStorage.clear()
  viewerProps.mockReset()
})

describe('MolstarSection', () => {
  it('does not mount the viewer until asked', async () => {
    renderWithProviders(
      <MolstarSection
        source={owner}
        view={view}
      />
    )
    expect(screen.queryByTestId('molstar')).not.toBeInTheDocument()
    expect(viewerProps).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('button', { name: /load 3d viewer/i })
    )
    expect(await screen.findByTestId('molstar')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /load 3d viewer/i })
    ).not.toBeInTheDocument()
  })

  it('is no longer labelled experimental', () => {
    renderWithProviders(
      <MolstarSection
        source={owner}
        view={view}
      />
    )
    expect(screen.getByText('Molstar Viewer')).toBeInTheDocument()
    expect(screen.queryByText(/experimental/i)).not.toBeInTheDocument()
  })

  it('colors an MD job by its constraints, without asking for an alignment', async () => {
    const requested: string[] = []
    server.use(
      http.get(`${API}/jobs/:id/results/alignment.json`, ({ request }) => {
        requested.push(request.url)
        return HttpResponse.json({})
      })
    )
    const constraints = {
      fixed_bodies: [
        {
          name: 'FB1',
          segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }]
        }
      ]
    }
    renderWithProviders(
      <MolstarSection
        source={owner}
        view={makeView({ ...view, md_constraints: constraints })}
      />
    )
    await userEvent.click(
      screen.getByRole('button', { name: /load 3d viewer/i })
    )
    await screen.findByTestId('molstar')
    // In the shared constraint palette: fixed segments are blue
    expect(viewerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        constraints: {
          fixed_bodies: [{ ...constraints.fixed_bodies[0], color: 0x2f54eb }],
          rigid_bodies: []
        }
      })
    )
    expect(requested).toEqual([])
  })

  it('colors a BioEmu2 job by the rigid domains of its alignment', async () => {
    server.use(
      http.get(`${API}/jobs/:id/results/alignment.json`, () =>
        HttpResponse.json({
          method: 'rigid-domain',
          domains: [
            { id: 1, size: 12, residues: ['A:2-13'] },
            { id: 2, size: 9, residues: ['B:69-77'] }
          ]
        })
      )
    )
    renderWithProviders(
      <MolstarSection
        source={owner}
        view={makeView({
          jobType: 'bioemu',
          results: { bioemu: { total_num_ensembles: 3 } } as never
        })}
      />
    )
    await userEvent.click(
      screen.getByRole('button', { name: /load 3d viewer/i })
    )
    await screen.findByTestId('molstar')
    await vi.waitFor(() =>
      expect(viewerProps).toHaveBeenLastCalledWith(
        expect.objectContaining({
          constraints: {
            fixed_bodies: [
              {
                name: 'domain-1',
                color: 0x2a78d6,
                segments: [{ chain_id: 'A', residues: { start: 2, stop: 13 } }]
              }
            ],
            rigid_bodies: [
              {
                name: 'domain-2',
                color: 0xeb6834,
                segments: [{ chain_id: 'B', residues: { start: 69, stop: 77 } }]
              }
            ]
          }
        })
      )
    )
  })

  it('offers no domain coloring when a BioEmu2 job has no rigid domain', async () => {
    server.use(
      http.get(`${API}/jobs/:id/results/alignment.json`, () =>
        HttpResponse.json({ method: 'all-residues', domains: [] })
      )
    )
    renderWithProviders(
      <MolstarSection
        source={owner}
        view={makeView({
          jobType: 'bioemu',
          results: { bioemu: { total_num_ensembles: 3 } } as never
        })}
      />
    )
    await userEvent.click(
      screen.getByRole('button', { name: /load 3d viewer/i })
    )
    await screen.findByTestId('molstar')
    expect(viewerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ constraints: undefined })
    )
  })

  it('passes the public token through to the viewer', async () => {
    renderWithProviders(
      <MolstarSection
        source={anon}
        view={view}
      />
    )
    await userEvent.click(
      screen.getByRole('button', { name: /load 3d viewer/i })
    )
    await screen.findByTestId('molstar')
    expect(viewerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: view.id,
        results: view.results,
        publicId: 'tok'
      })
    )
  })

  it('keeps the viewer mounted when the job view refreshes', async () => {
    // Stands in for the page re-rendering on each poll with a new view object
    const Polling = () => {
      const [polled, setPolled] = useState(view)
      return (
        <>
          <button onClick={() => setPolled({ ...polled })}>poll</button>
          <MolstarSection
            source={owner}
            view={polled}
          />
        </>
      )
    }
    renderWithProviders(<Polling />)
    await userEvent.click(
      screen.getByRole('button', { name: /load 3d viewer/i })
    )
    const viewer = await screen.findByTestId('molstar')
    await userEvent.click(screen.getByRole('button', { name: 'poll' }))
    expect(screen.getByTestId('molstar')).toBe(viewer)
  })

  it('loads straight away when the viewer chose auto-load', async () => {
    localStorage.setItem(AUTO_LOAD_KEY, 'true')
    renderWithProviders(
      <MolstarSection
        source={owner}
        view={view}
      />
    )
    expect(await screen.findByTestId('molstar')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /always load/i })).toBeChecked()
  })

  it('remembers the auto-load choice and lets it be turned off', async () => {
    const { unmount } = renderWithProviders(
      <MolstarSection
        source={owner}
        view={view}
      />
    )
    const toggle = screen.getByRole('checkbox', { name: /always load/i })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    expect(localStorage.getItem(AUTO_LOAD_KEY)).toBe('true')
    // Ticking the box is a preference for next time, not a load
    expect(screen.queryByTestId('molstar')).not.toBeInTheDocument()
    unmount()

    renderWithProviders(
      <MolstarSection
        source={owner}
        view={view}
      />
    )
    await screen.findByTestId('molstar')
    await userEvent.click(
      screen.getByRole('checkbox', { name: /always load/i })
    )
    expect(localStorage.getItem(AUTO_LOAD_KEY)).toBeNull()
  })

  it('falls back to the button when storage throws', () => {
    const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderWithProviders(
      <MolstarSection
        source={owner}
        view={view}
      />
    )
    expect(
      screen.getByRole('button', { name: /load 3d viewer/i })
    ).toBeInTheDocument()
    getItem.mockRestore()
  })
})
