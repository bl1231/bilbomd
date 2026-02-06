import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { MDConstraintsRenderer } from '../MDConstraintsRenderer'
import type {
  IMDConstraints,
  IFixedBody,
  IRigidBody
} from '@bilbomd/mongodb-schema'

describe('MDConstraintsRenderer', () => {
  const createMockConstraints = (
    overrides: Partial<IMDConstraints> = {}
  ): IMDConstraints => ({
    fixed_bodies: [],
    rigid_bodies: [],
    ...overrides
  })

  const createMockFixedBody = (
    overrides: Partial<IFixedBody> = {}
  ): IFixedBody => ({
    name: 'Fixed Body 1',
    segments: [
      {
        chain_id: 'A',
        residues: { start: 1, stop: 10 }
      }
    ],
    ...overrides
  })

  const createMockRigidBody = (
    overrides: Partial<IRigidBody> = {}
  ): IRigidBody => ({
    name: 'Rigid Body 1',
    segments: [
      {
        chain_id: 'B',
        residues: { start: 20, stop: 30 }
      }
    ],
    ...overrides
  })

  it('should render empty state when no constraints are provided', () => {
    const constraints = createMockConstraints()

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('No constraints found.')).toBeInTheDocument()
  })

  it('should render fixed bodies section', () => {
    const fixedBody = createMockFixedBody()
    const constraints = createMockConstraints({
      fixed_bodies: [fixedBody]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('Fixed Bodies')).toBeInTheDocument()
    expect(screen.getByText('Fixed Body 1')).toBeInTheDocument()
    expect(screen.getByText('Residues: 1 - 10')).toBeInTheDocument()
  })

  it('should render rigid bodies section', () => {
    const rigidBody = createMockRigidBody()
    const constraints = createMockConstraints({
      rigid_bodies: [rigidBody]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('Rigid Bodies')).toBeInTheDocument()
    expect(screen.getByText('Rigid Body 1')).toBeInTheDocument()
    expect(screen.getByText('Residues: 20 - 30')).toBeInTheDocument()
  })

  it('should render both fixed and rigid bodies', () => {
    const fixedBody = createMockFixedBody()
    const rigidBody = createMockRigidBody()
    const constraints = createMockConstraints({
      fixed_bodies: [fixedBody],
      rigid_bodies: [rigidBody]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('Fixed Bodies')).toBeInTheDocument()
    expect(screen.getByText('Rigid Bodies')).toBeInTheDocument()
    expect(screen.getByText('Fixed Body 1')).toBeInTheDocument()
    expect(screen.getByText('Rigid Body 1')).toBeInTheDocument()
  })

  it('should render multiple segments for a single body', () => {
    const fixedBody = createMockFixedBody({
      segments: [
        { chain_id: 'A', residues: { start: 1, stop: 10 } },
        { chain_id: 'A', residues: { start: 20, stop: 30 } },
        { chain_id: 'B', residues: { start: 5, stop: 15 } }
      ]
    })
    const constraints = createMockConstraints({
      fixed_bodies: [fixedBody]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('Residues: 1 - 10')).toBeInTheDocument()
    expect(screen.getByText('Residues: 20 - 30')).toBeInTheDocument()
    expect(screen.getByText('Residues: 5 - 15')).toBeInTheDocument()
  })

  it('should handle bodies with empty segments array', () => {
    const fixedBody = createMockFixedBody({
      segments: []
    })
    const constraints = createMockConstraints({
      fixed_bodies: [fixedBody]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('Fixed Bodies')).toBeInTheDocument()
    expect(screen.getByText('Fixed Body 1')).toBeInTheDocument()
    // Should not crash with empty segments
  })

  it('should handle bodies with undefined segments', () => {
    const fixedBody = createMockFixedBody({
      segments: undefined as unknown as IFixedBody['segments']
    })
    const constraints = createMockConstraints({
      fixed_bodies: [fixedBody]
    })

    expect(() => {
      render(<MDConstraintsRenderer constraints={constraints} />)
    }).not.toThrow()
  })

  it('should render multiple fixed bodies', () => {
    const fixedBody1 = createMockFixedBody({
      name: 'N-terminal Domain',
      segments: [{ chain_id: 'A', residues: { start: 1, stop: 50 } }]
    })
    const fixedBody2 = createMockFixedBody({
      name: 'C-terminal Domain',
      segments: [{ chain_id: 'A', residues: { start: 100, stop: 150 } }]
    })
    const constraints = createMockConstraints({
      fixed_bodies: [fixedBody1, fixedBody2]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('N-terminal Domain')).toBeInTheDocument()
    expect(screen.getByText('C-terminal Domain')).toBeInTheDocument()
    expect(screen.getByText('Residues: 1 - 50')).toBeInTheDocument()
    expect(screen.getByText('Residues: 100 - 150')).toBeInTheDocument()
  })

  it('should render multiple rigid bodies', () => {
    const rigidBody1 = createMockRigidBody({
      name: 'Helix 1',
      segments: [{ chain_id: 'A', residues: { start: 10, stop: 25 } }]
    })
    const rigidBody2 = createMockRigidBody({
      name: 'Helix 2',
      segments: [{ chain_id: 'A', residues: { start: 50, stop: 65 } }]
    })
    const constraints = createMockConstraints({
      rigid_bodies: [rigidBody1, rigidBody2]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    expect(screen.getByText('Helix 1')).toBeInTheDocument()
    expect(screen.getByText('Helix 2')).toBeInTheDocument()
    expect(screen.getByText('Residues: 10 - 25')).toBeInTheDocument()
    expect(screen.getByText('Residues: 50 - 65')).toBeInTheDocument()
  })

  it('should apply correct styling classes', () => {
    const fixedBody = createMockFixedBody()
    const constraints = createMockConstraints({
      fixed_bodies: [fixedBody]
    })

    const { container } = render(
      <MDConstraintsRenderer constraints={constraints} />
    )

    // Check for MUI Box components and structure
    expect(container.querySelector('.MuiBox-root')).toBeInTheDocument()
    expect(container.querySelector('.MuiTypography-root')).toBeInTheDocument()
  })

  it('should handle complex constraint structure', () => {
    const constraints = createMockConstraints({
      fixed_bodies: [
        {
          name: 'Core Domain',
          segments: [
            { chain_id: 'A', residues: { start: 1, stop: 100 } },
            { chain_id: 'B', residues: { start: 1, stop: 50 } }
          ]
        }
      ],
      rigid_bodies: [
        {
          name: 'Flexible Loop',
          segments: [{ chain_id: 'A', residues: { start: 150, stop: 180 } }]
        }
      ]
    })

    render(<MDConstraintsRenderer constraints={constraints} />)

    // Should render all sections and segments
    expect(screen.getByText('Fixed Bodies')).toBeInTheDocument()
    expect(screen.getByText('Rigid Bodies')).toBeInTheDocument()
    expect(screen.getByText('Core Domain')).toBeInTheDocument()
    expect(screen.getByText('Flexible Loop')).toBeInTheDocument()
    expect(screen.getByText('Residues: 1 - 100')).toBeInTheDocument()
    expect(screen.getByText('Residues: 1 - 50')).toBeInTheDocument()
    expect(screen.getByText('Residues: 150 - 180')).toBeInTheDocument()
  })
})
