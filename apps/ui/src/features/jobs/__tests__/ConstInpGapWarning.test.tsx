import { describe, it, expect } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import ConstInpGapWarning from '../ConstInpGapWarning'

const inp = (rigidStart: number) =>
  new File(
    [
      `define fixed1 sele ( resid 1:50 .and. segid PROA ) end
cons fix sele fixed1 end
define rigid1 sele ( resid ${rigidStart}:80 .and. segid PROA ) end
shape desc dock1 rigid sele rigid1 end
return`
    ],
    'const.inp'
  )

describe('ConstInpGapWarning', () => {
  it('warns about bodies closer than the minimum gap', async () => {
    render(<ConstInpGapWarning file={inp(52)} />)
    expect(
      await screen.findByTestId('const-inp-gap-warning')
    ).toHaveTextContent(
      'FixedBody1 (chain A 1–50) and RigidBody1 (52–80): 1 residue between'
    )
  })

  it('shows nothing when the bodies have room', async () => {
    render(<ConstInpGapWarning file={inp(53)} />)
    // Give the file read time to finish
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(screen.queryByTestId('const-inp-gap-warning')).toBeNull()
  })

  it('switches with the picked file', async () => {
    const { rerender } = render(<ConstInpGapWarning file={inp(51)} />)
    expect(
      await screen.findByTestId('const-inp-gap-warning')
    ).toHaveTextContent('adjacent')
    rerender(<ConstInpGapWarning file="example-const.inp" />)
    expect(screen.queryByTestId('const-inp-gap-warning')).toBeNull()
  })
})
