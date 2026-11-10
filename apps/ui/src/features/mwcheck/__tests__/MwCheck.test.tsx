import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { MwCheckResponse } from '@bilbomd/bilbomd-types'
import MwCheck from '../MwCheck'

const checkMw = vi.fn()
vi.mock('slices/mwCheckApiSlice', () => ({
  useCheckMwMutation: () => [checkMw]
}))

const dat = new File(['0.01 1 0.1\n'], 'saxs.dat', { lastModified: 1 })
const pdb = new File(['ATOM\n'], 'model.pdb', { lastModified: 2 })

const response = (
  code: string,
  mw: Partial<MwCheckResponse['mw']> = {}
): MwCheckResponse => ({
  mw: {
    model_kda: 43.6,
    saxs_kda: 81.5,
    diff_fraction: 0.869,
    method: 'vc_rambo_tainer',
    particle: 'protein',
    confidence: 'normal',
    nucleic_fraction: 0,
    model_pdb_file: null,
    qmax_used: 0.3,
    guinier: null,
    reason: null,
    ...mw
  },
  finding: { code, severity: 'info', title: 'title', detail: 'detail' }
})

const answer = (result: MwCheckResponse) =>
  checkMw.mockReturnValue({ unwrap: () => Promise.resolve(result) })

// Let the debounce elapse and the answer arrive
const settle = async (ms = 2000) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  checkMw.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MwCheck', () => {
  it('does nothing until there is a SAXS file and a model', async () => {
    const { container } = render(
      <MwCheck
        datFile={dat}
        pdbFile=""
      />
    )
    await settle()
    expect(checkMw).not.toHaveBeenCalled()
    expect(container).toBeEmptyDOMElement()
  })

  it('warns when the model and the data differ in mass', async () => {
    answer(response('mw_differs'))
    render(
      <MwCheck
        datFile={dat}
        qUnits="auto"
        pdbFile={pdb}
      />
    )
    await settle()

    expect(checkMw).toHaveBeenCalledTimes(1)
    const sent = checkMw.mock.calls[0]![0] as FormData
    expect((sent.get('pdb_file') as File).name).toBe('model.pdb')

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(
      'Your model and your SAXS data may not match'
    )
    expect(alert).toHaveTextContent(
      'Your model weighs 43.6 kDa; the SAXS data suggest about 81.5 kDa (87% higher).'
    )
    expect(alert).toHaveTextContent('not aggregated')
    expect(alert).toHaveTextContent('you can still submit')
  })

  it('does not suggest aggregation when the data are lighter than the model', async () => {
    answer(response('mw_differs', { saxs_kda: 20, diff_fraction: -0.54 }))
    render(
      <MwCheck
        datFile={dat}
        pdbFile={pdb}
      />
    )
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent('(54% lower)')
    expect(screen.getByRole('alert')).not.toHaveTextContent('aggregated')
  })

  it('confirms quietly when the masses agree', async () => {
    answer(response('mw_consistent', { saxs_kda: 40.1, diff_fraction: -0.08 }))
    render(
      <MwCheck
        datFile={dat}
        pdbFile={pdb}
      />
    )
    await settle()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The two are consistent.')
    expect(alert).not.toHaveTextContent('may not match')
  })

  it('says why an estimate is only indicative', async () => {
    answer(
      response('mw_low_confidence', {
        confidence: 'low',
        reason: 'The model is 36% nucleic acid by mass.'
      })
    )
    render(
      <MwCheck
        datFile={dat}
        pdbFile={pdb}
      />
    )
    await settle()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The model is 36% nucleic acid by mass.'
    )
  })

  it('mentions an unassessable comparison without an alert', async () => {
    answer(
      response('mw_not_assessed', {
        saxs_kda: null,
        diff_fraction: null,
        reason: 'No acceptable Guinier region was found in the data.'
      })
    )
    render(
      <MwCheck
        datFile={dat}
        pdbFile={pdb}
      />
    )
    await settle()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByText(/No acceptable Guinier region was found/)
    ).toBeInTheDocument()
  })

  it('shows progress while checking and stays silent if the check fails', async () => {
    let fail: (reason: unknown) => void = () => {}
    checkMw.mockReturnValue({
      unwrap: () => new Promise((_, reject) => (fail = reject))
    })
    const { container } = render(
      <MwCheck
        datFile={dat}
        pdbFile={pdb}
      />
    )
    await settle(500)
    expect(
      screen.getByText(/Comparing the model's mass with the SAXS data/)
    ).toBeInTheDocument()

    await act(async () => {
      fail({ status: 429 })
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('waits for typing to settle before checking sequences', async () => {
    answer(response('mw_consistent'))
    const entity = { type: 'Protein', sequence: 'MKT', copies: 1 }
    const { rerender } = render(
      <MwCheck
        datFile={dat}
        entities={[entity]}
      />
    )
    await settle(500)
    rerender(
      <MwCheck
        datFile={dat}
        entities={[{ ...entity, sequence: 'MKTA' }]}
      />
    )
    await settle(500)
    expect(checkMw).not.toHaveBeenCalled()

    await settle()
    expect(checkMw).toHaveBeenCalledTimes(1)
    const sent = checkMw.mock.calls[0]![0] as FormData
    expect(sent.get('entities')).toBe(
      JSON.stringify([{ type: 'Protein', sequence: 'MKTA', copies: 1 }])
    )
  })

  it('does not repeat the check when the form re-renders unchanged', async () => {
    answer(response('mw_consistent'))
    const entity = { type: 'Protein', sequence: 'MKT', copies: 1 }
    const { rerender } = render(
      <MwCheck
        datFile={dat}
        entities={[entity]}
      />
    )
    await settle()
    // Formik hands the form a new array on every render
    rerender(
      <MwCheck
        datFile={dat}
        entities={[{ ...entity }]}
      />
    )
    await settle()
    expect(checkMw).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('drops the answer to a request the form has moved on from', async () => {
    let resolveFirst: (value: MwCheckResponse) => void = () => {}
    checkMw.mockReturnValueOnce({
      unwrap: () => new Promise((resolve) => (resolveFirst = resolve))
    })
    const { rerender, container } = render(
      <MwCheck
        datFile={dat}
        pdbFile={pdb}
      />
    )
    await settle(500)
    // The user removes the model while the first check is in flight
    rerender(
      <MwCheck
        datFile={dat}
        pdbFile=""
      />
    )
    await act(async () => {
      resolveFirst(response('mw_differs'))
    })
    await settle()
    expect(container).toBeEmptyDOMElement()
  })
})
