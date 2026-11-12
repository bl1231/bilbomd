import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Formik } from 'formik'
import { renderWithProviders } from 'test/test-utils'
import UploadForm from '../UploadForm'
import initialValues from '../../FormModel/formInitialValues'

const renderUploadForm = () =>
  renderWithProviders(
    <Formik
      initialValues={initialValues}
      onSubmit={vi.fn()}
    >
      <UploadForm setStepIsValid={vi.fn()} />
    </Formik>
  )

describe('UploadForm instructions', () => {
  it('links to the c51b1 CHARMM atom selection docs', () => {
    renderUploadForm()

    expect(
      screen.getByRole('link', { name: /atom selection/i, hidden: true })
    ).toHaveAttribute(
      'href',
      'https://academiccharmm.org/documentation/version/c51b1/select'
    )
  })

  it('gives every define in the example const.inp its own name', () => {
    renderUploadForm()

    const example = screen.getByText(/shape desc dock1/).textContent ?? ''
    const names = [...example.matchAll(/define\s+(\w+)\s+sele/g)].map(
      ([, name]) => name
    )

    expect(names).toEqual(['fixed1', 'fixed2', 'rigid1', 'rigid2'])
    expect(example).toContain('shape desc dock1 rigid sele rigid1 end')
    expect(example).toContain('shape desc dock2 rigid sele rigid2 end')
  })
})
