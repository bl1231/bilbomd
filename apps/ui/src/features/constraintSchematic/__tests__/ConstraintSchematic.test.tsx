import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom'
import { parseConstInp } from '@bilbomd/bilbomd-types'
import { ConstraintSchematic } from '../ConstraintSchematic'

// What the PAE jiffy hands over: its const.inp text, parsed
const constraints =
  parseConstInp(`define fixed1 sele ( resid 1:150 .and. segid PROA ) end
define fixed2 sele ( resid 155:170 .and. segid PROA ) end
cons fix sele fixed1 .or. fixed2 end

define rigid1 sele ( resid 181:290 .and. segid PROA ) end
define rigid2 sele ( resid 20:95 .and. segid PROB ) end
shape desc dock1 rigid sele rigid1 .or. rigid2 end

define rigid1 sele ( resid 311:400 .and. segid PROA ) end
shape desc dock2 rigid sele rigid1 end
return
`)

const status = () => screen.getByRole('status')

describe('ConstraintSchematic', () => {
  it('draws a bead per segment, a body per fixed segment, rigid body and tail', () => {
    const { unmount } = render(
      <ConstraintSchematic constraints={constraints} />
    )
    const kinds = screen
      .getAllByTestId('schematic-body')
      .map((el) => el.getAttribute('data-kind'))
    expect(kinds).toEqual(['fixed', 'fixed', 'rigid', 'rigid', 'tail'])
    expect(screen.getAllByTestId('schematic-bead')).toHaveLength(5)
    // A 151–154, A 171–180, A 291–310, and chain B's 1–19 tail
    expect(screen.getAllByTestId('schematic-linker')).toHaveLength(4)
    for (const linker of screen.getAllByTestId('schematic-linker')) {
      expect(linker.getAttribute('d')).toMatch(/^M/)
    }
    unmount()
  })

  it('lists the bodies with their segment counts and chains', () => {
    render(<ConstraintSchematic constraints={constraints} />)
    expect(screen.getByTestId('schematic-legend-fixed')).toHaveTextContent(
      'Fixed (pinned) · 2 segs · A'
    )
    expect(
      screen
        .getAllByTestId('schematic-legend-rigid')
        .map((el) => el.textContent)
    ).toEqual(['RigidBody1 · 2 segs · A+B', 'RigidBody2 · 1 seg · A'])
  })

  it('reads out a hovered body and goes back to the hint', () => {
    render(<ConstraintSchematic constraints={constraints} />)
    const [, , dock1] = screen.getAllByTestId('schematic-body')
    fireEvent.pointerEnter(dock1!)
    expect(status()).toHaveTextContent(
      'RigidBody1 · moves as one unit · A 181–290, B 20–95 · 186 residues'
    )
    fireEvent.pointerLeave(dock1!)
    expect(status()).toHaveTextContent(/Hover a bead/)
  })

  it('says fixed segments stay put when one is grabbed', () => {
    render(<ConstraintSchematic constraints={constraints} />)
    const [fixed] = screen.getAllByTestId('schematic-body')
    fireEvent.pointerDown(fixed!)
    expect(status()).toHaveTextContent(
      'Fixed segments stay where they are during MD.'
    )
  })

  it('dims every other body while a legend chip has focus', () => {
    render(<ConstraintSchematic constraints={constraints} />)
    const [chip] = screen.getAllByTestId('schematic-legend-rigid')
    fireEvent.focus(chip!)
    const opacity = screen
      .getAllByTestId('schematic-body')
      .map((el) => el.getAttribute('opacity'))
    expect(opacity).toEqual(['0.18', '0.18', '1', '0.18', '0.18'])
    fireEvent.blur(chip!)
    expect(
      screen
        .getAllByTestId('schematic-body')
        .every((el) => el.getAttribute('opacity') === '1')
    ).toBe(true)
  })

  it('pauses and resumes the motion', async () => {
    const user = userEvent.setup()
    render(<ConstraintSchematic constraints={constraints} />)
    const button = screen.getByRole('button', { name: 'Pause motion' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await user.click(button)
    expect(
      screen.getByRole('button', { name: 'Animate motion' })
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('lays out again on re-shuffle', async () => {
    const user = userEvent.setup()
    render(<ConstraintSchematic constraints={constraints} />)
    await user.click(screen.getByRole('button', { name: 'Pause motion' }))
    const before = screen
      .getAllByTestId('schematic-body')
      .map((el) => el.getAttribute('transform'))
    await user.click(screen.getByRole('button', { name: 'Re-shuffle layout' }))
    const after = screen
      .getAllByTestId('schematic-body')
      .map((el) => el.getAttribute('transform'))
    expect(after).not.toEqual(before)
  })
})
