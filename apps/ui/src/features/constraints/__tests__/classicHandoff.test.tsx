import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

const auth = vi.hoisted(() => ({ isAuthenticated: false }))
vi.mock('hooks/useAuth', () => ({ default: () => auth }))

import {
  classicFormPath,
  readClassicHandoff,
  useStartClassicJob
} from '../classicHandoff'

const structure = new File(['ATOM'], 'model.pdb')
const constraints = new File(['return'], 'const.inp')

const Start = () => {
  const start = useStartClassicJob()
  return (
    <button
      type="button"
      onClick={() => start({ structure, constraints, from: 'the Inp Jiffy™' })}
    >
      Use in a new Classic job
    </button>
  )
}

const Target = () => {
  const location = useLocation()
  const handoff = readClassicHandoff(location.state)
  return (
    <p data-testid="target">
      {location.pathname} {handoff?.structure.name} {handoff?.constraints.name}
    </p>
  )
}

const renderJiffy = () =>
  render(
    <MemoryRouter initialEntries={['/jiffy']}>
      <Routes>
        <Route
          path="/jiffy"
          element={<Start />}
        />
        <Route
          path="*"
          element={<Target />}
        />
      </Routes>
    </MemoryRouter>
  )

describe('classic hand-off', () => {
  it('picks the Classic form by sign-in', () => {
    expect(classicFormPath(true)).toBe('/dashboard/jobs/classic')
    expect(classicFormPath(false)).toBe('/jobs/classic/new')
  })

  it.each([
    [false, '/jobs/classic/new'],
    [true, '/dashboard/jobs/classic']
  ])(
    'opens the Classic form with the files (signed in: %s)',
    async (signedIn, path) => {
      auth.isAuthenticated = signedIn
      renderJiffy()
      await userEvent.click(
        screen.getByRole('button', { name: 'Use in a new Classic job' })
      )
      expect(screen.getByTestId('target')).toHaveTextContent(
        `${path} model.pdb const.inp`
      )
    }
  )

  it('reads only a well-formed hand-off', () => {
    expect(readClassicHandoff(null)).toBeNull()
    expect(readClassicHandoff({})).toBeNull()
    expect(
      readClassicHandoff({
        classicHandoff: { structure: 'x', constraints, from: 'y' }
      })
    ).toBeNull()
    expect(
      readClassicHandoff({
        classicHandoff: { structure, constraints, from: 'the PAE Jiffy™' }
      })
    ).toEqual({ structure, constraints, from: 'the PAE Jiffy™' })
  })
})
