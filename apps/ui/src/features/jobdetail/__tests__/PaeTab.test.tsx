import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from 'test/server'
import { renderWithProviders } from 'test/rendersWithProviders'
import PaeTab from '../PaeTab'

const API = 'http://localhost:3003/api/v1'
const png = () =>
  new HttpResponse(new Blob(['png'], { type: 'image/png' }), {
    headers: { 'Content-Type': 'image/png' }
  })

let requested: string[]
let urls = 0

beforeEach(() => {
  requested = []
  urls = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    () => `blob:test/${++urls}`
  )
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  server.use(
    http.get(`${API}/jobs/:id/:filename`, ({ request }) => {
      requested.push(new URL(request.url).pathname)
      return png()
    }),
    http.get(
      `${API}/public/jobs/:publicId/results/:filename`,
      ({ request }) => {
        requested.push(new URL(request.url).pathname)
        return png()
      }
    )
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PaeTab', () => {
  it('shows both PAE images from the owner endpoint', async () => {
    renderWithProviders(<PaeTab source={{ kind: 'owner', id: 'job-1' }} />)

    expect(
      await screen.findByRole('img', { name: 'PAE matrix' })
    ).toHaveAttribute('src', expect.stringMatching(/^blob:test\//))
    expect(
      await screen.findByRole('img', { name: 'Rigid bodies' })
    ).toBeInTheDocument()
    expect(requested.sort()).toEqual([
      '/api/v1/jobs/job-1/pae.png',
      '/api/v1/jobs/job-1/viz.png'
    ])
  })

  it('loads the images by token on public pages', async () => {
    renderWithProviders(<PaeTab source={{ kind: 'public', token: 'tok' }} />)

    await screen.findByRole('img', { name: 'PAE matrix' })
    await screen.findByRole('img', { name: 'Rigid bodies' })
    expect(requested.sort()).toEqual([
      '/api/v1/public/jobs/tok/results/pae.png',
      '/api/v1/public/jobs/tok/results/viz.png'
    ])
  })

  it('links each image to its full-size version', async () => {
    renderWithProviders(<PaeTab source={{ kind: 'owner', id: 'job-1' }} />)

    const link = await screen.findByRole('link', {
      name: /open pae matrix full size/i
    })
    const img = screen.getByRole('img', { name: 'PAE matrix' })
    expect(link).toHaveAttribute('href', img.getAttribute('src'))
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('says when an image is missing and still shows the other', async () => {
    server.use(
      http.get(`${API}/jobs/:id/viz.png`, () =>
        HttpResponse.json({ error: 'File not found' }, { status: 404 })
      )
    )
    renderWithProviders(<PaeTab source={{ kind: 'owner', id: 'job-1' }} />)

    expect(
      await screen.findByText("Rigid bodies isn't available for this job.")
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('img', { name: 'PAE matrix' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: 'Rigid bodies' })
    ).not.toBeInTheDocument()
  })

  it('keeps the explanation collapsed', async () => {
    renderWithProviders(<PaeTab source={{ kind: 'owner', id: 'job-1' }} />)
    expect(
      screen.getByRole('button', { name: /interpreting the pae matrix/i })
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
