import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const startClassicJob = vi.hoisted(() => vi.fn())
vi.mock('../classicHandoff', () => ({
  useStartClassicJob: () => startClassicJob
}))

import { UseInClassicJobButton } from '../UseInClassicJobButton'

const structure = new File(['ATOM'], 'ranked_0.pdb')
const constInp = 'define a sele ( segid PROA ) end\ncons fix sele a end\nreturn'

describe('UseInClassicJobButton', () => {
  beforeEach(() => startClassicJob.mockReset())

  it('hands the structure and the const.inp, as a file, to a new Classic job', async () => {
    render(
      <UseInClassicJobButton
        structure={structure}
        constInp={constInp}
        from="the PAE Jiffy™"
      />
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Use in a new Classic job' })
    )
    const handoff = startClassicJob.mock.calls[0]?.[0]
    expect(handoff.structure).toBe(structure)
    expect(handoff.from).toBe('the PAE Jiffy™')
    expect(handoff.constraints.name).toBe('const.inp')
    expect(await handoff.constraints.text()).toBe(constInp)
  })

  it.each([
    ['no structure', { structure: null, constInp }],
    ['no const.inp', { structure, constInp: null }],
    ['disabled', { structure, constInp, disabled: true }]
  ])('is off with %s', (_, props) => {
    render(
      <UseInClassicJobButton
        from="the Inp Jiffy™"
        {...props}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Use in a new Classic job' })
    ).toBeDisabled()
  })
})
