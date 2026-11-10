import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from 'test/server'
import { renderWithProviders } from 'test/rendersWithProviders'
import RigidDomainsTab from '../RigidDomainsTab'

const API = 'http://localhost:3003/api/v1'

const report = {
  method: 'rigid-domain',
  sd_cutoff: 1.5,
  samples: 299,
  residues: 6,
  reference: 'x.pdb',
  anchor_size: 4,
  domains: [{ id: 1, size: 4, residues: ['A:1-4'] }],
  flexible: ['B:1-2'],
  members: [],
  residue_chains: ['A', 'A', 'A', 'A', 'B', 'B'],
  residue_numbers: [1, 2, 3, 4, 1, 2],
  residue_domains: [1, 1, 1, 1, 0, 0],
  matrix: {
    size: 2,
    bin: 3,
    max_sd: 20,
    data: btoa('\u0000\u0010\u0010\u0000')
  }
}

let requested: string[]

const serve = (body: unknown, status = 200) => {
  const handler = ({ request }: { request: Request }) => {
    requested.push(new URL(request.url).pathname)
    return HttpResponse.json(body as object, { status })
  }
  server.use(
    http.get(`${API}/jobs/:id/results/alignment.json`, handler),
    http.get(`${API}/public/jobs/:publicId/results/alignment.json`, handler)
  )
}

beforeEach(() => {
  requested = []
  // jsdom has no canvas: the component skips drawing without a context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RigidDomainsTab', () => {
  it('shows the domains and the matrix for an owner', async () => {
    serve(report)
    renderWithProviders(
      <RigidDomainsTab source={{ kind: 'owner', id: 'job-1' }} />
    )

    expect(await screen.findByText(/Domain 1/)).toHaveTextContent(
      'Domain 1 (anchor)'
    )
    expect(screen.getByText('A:1–4')).toBeInTheDocument()
    expect(screen.getByText('Flexible')).toBeInTheDocument()
    expect(screen.getByText('B:1–2')).toBeInTheDocument()
    expect(
      screen.getByText(/largest rigid domain: 4 of 6 residues/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /residue-pair distance/ })
    ).toBeInTheDocument()
    expect(screen.getByText(/299 sampled structures/)).toBeInTheDocument()
    expect(requested).toEqual(['/api/v1/jobs/job-1/results/alignment.json'])
  })

  it('loads the report by token on public pages', async () => {
    serve(report)
    renderWithProviders(
      <RigidDomainsTab source={{ kind: 'public', token: 'tok' }} />
    )
    await screen.findByText(/Domain 1/)
    expect(requested).toEqual([
      '/api/v1/public/jobs/tok/results/alignment.json'
    ])
  })

  it('says so when members were superposed on all residues', async () => {
    serve({
      ...report,
      method: 'all-residues',
      domains: [],
      flexible: [],
      matrix: null,
      residue_domains: [0, 0, 0, 0, 0, 0]
    })
    renderWithProviders(
      <RigidDomainsTab source={{ kind: 'owner', id: 'job-1' }} />
    )
    expect(
      await screen.findByText(/No rigid domain was found/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(/Domain 1/)).toBeNull()
  })

  it('explains when an older job has no report', async () => {
    serve({ message: 'No file' }, 500)
    renderWithProviders(
      <RigidDomainsTab source={{ kind: 'owner', id: 'job-1' }} />
    )
    expect(
      await screen.findByText(/rigid-domain analysis isn't available/)
    ).toBeInTheDocument()
  })
})
