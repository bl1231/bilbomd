import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from 'test/test-utils'
import GapWarning from '../GapWarning'
import { jiffyConstraints } from '../jiffyConstraints'

describe('jiffyConstraints', () => {
  it('treats PRIMARY as the fixed body', () => {
    expect(
      jiffyConstraints([
        { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 50 }] },
        { id: 'RIGID 1', domains: [{ chainid: 'A', start: 51, end: 80 }] }
      ])
    ).toEqual({
      fixed_bodies: [
        {
          name: 'PRIMARY',
          segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }]
        }
      ],
      rigid_bodies: [
        {
          name: 'RIGID 1',
          segments: [{ chain_id: 'A', residues: { start: 51, stop: 80 } }]
        }
      ]
    })
  })
})

describe('GapWarning', () => {
  it('warns when a rigid body touches PRIMARY', () => {
    renderWithProviders(
      <GapWarning
        rigidBodies={[
          { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 50 }] },
          { id: 'RIGID 1', domains: [{ chainid: 'A', start: 51, end: 80 }] }
        ]}
      />
    )
    expect(screen.getByTestId('jiffy-gap-warning')).toHaveTextContent(
      'PRIMARY (chain A 1–50) and RIGID 1 (51–80): adjacent'
    )
  })

  it('shows nothing when the bodies have room', () => {
    renderWithProviders(
      <GapWarning
        rigidBodies={[
          { id: 'PRIMARY', domains: [{ chainid: 'A', start: 1, end: 50 }] },
          { id: 'RIGID 1', domains: [{ chainid: 'A', start: 53, end: 80 }] }
        ]}
      />
    )
    expect(screen.queryByTestId('jiffy-gap-warning')).toBeNull()
  })
})
