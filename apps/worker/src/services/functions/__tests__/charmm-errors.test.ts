import { describe, it, expect } from 'vitest'
import { summarizeCharmmErrors } from '../charmm-errors.js'

describe('summarizeCharmmErrors', () => {
  it('keeps only CHARMM error lines, trimmed and joined', () => {
    expect(
      summarizeCharmmErrors([
        ' CHARMM>    read psf card',
        '  ***** ERROR in ATOM SELECTION',
        '      ? unrecognized command',
        ' normal output',
        ' ABNORMAL TERMINATION'
      ])
    ).toBe(
      '***** ERROR in ATOM SELECTION | ? unrecognized command | ABNORMAL TERMINATION'
    )
  })

  it('falls back to a pointer to the log when no error lines are found', () => {
    expect(summarizeCharmmErrors(['just output', ''])).toBe(
      'see CHARMM log for details'
    )
  })
})
