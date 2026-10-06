import { describe, it, expect, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within
} from '@testing-library/react'
import { Formik } from 'formik'
import type { QUnits } from '@bilbomd/bilbomd-types'
import SaxsDataOptions from '../SaxsDataOptions'

// Guinier-like curve for a 30 Å particle; qScale 10 writes it in nm⁻¹
const curve = (qScale = 1, qEnd = 0.4) =>
  Array.from({ length: Math.round((qEnd - 0.01) / 0.002) + 1 }, (_, k) => {
    const q = 0.01 + k * 0.002
    const intensity = 1000 * Math.exp(-(q * q * 900) / 3) + 1
    return `${(q * qScale).toFixed(4)} ${intensity.toFixed(4)} ${(intensity * 0.02).toFixed(4)}`
  }).join('\n')

const makeFile = (name: string, content: string) => {
  const file = new File([content], name, { type: 'text/plain' })
  ;(file as unknown as { text: () => Promise<string> }).text = async () =>
    content
  return file
}

const renderWithFormik = (
  datFile: File | string,
  qUnits: QUnits = 'auto',
  onUnitsChange?: (qUnits: QUnits) => void
) =>
  render(
    <Formik
      initialValues={{ dat_file: datFile, q_units: qUnits }}
      onSubmit={vi.fn()}
    >
      <SaxsDataOptions onUnitsChange={onUnitsChange} />
    </Formik>
  )

describe('SaxsDataOptions', () => {
  it('renders the units selector defaulting to auto-detect', () => {
    renderWithFormik('')
    expect(screen.getByRole('combobox')).toHaveTextContent('Auto-detect')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows no warning for a clean Å⁻¹ file', async () => {
    renderWithFormik(makeFile('ok.dat', curve()))
    // Give the analysis a chance to run
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('warns about what will change in the file', async () => {
    renderWithFormik(makeFile('nm.dat', curve(10, 0.6)))
    const alert = await screen.findByRole('alert')
    const items = within(alert).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent(/nm⁻¹/)
    expect(items[1]).toHaveTextContent(/above q = 0.45/)
  })

  it('shows nothing for a rejected file (the field error explains it)', async () => {
    renderWithFormik(makeFile('bad.dat', 'not saxs data'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('updates q_units and notifies the parent when the user picks units', async () => {
    const onUnitsChange = vi.fn()
    renderWithFormik(makeFile('nm.dat', curve(10)), 'auto', onUnitsChange)
    await screen.findByRole('alert')

    fireEvent.mouseDown(screen.getByRole('combobox'))
    fireEvent.click(await screen.findByRole('option', { name: /nm⁻¹/ }))

    expect(onUnitsChange).toHaveBeenCalledWith('nm')
    await waitFor(() =>
      expect(screen.getByRole('combobox')).toHaveTextContent('nm⁻¹')
    )
    // The warning now reflects the user's choice
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('as specified')
    )
  })
})
