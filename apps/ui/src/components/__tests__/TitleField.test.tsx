// apps/ui/src/components/__tests__/TitleField.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { Formik, Form } from 'formik'
import { object } from 'yup'
import TitleField from '../TitleField'
import { titleSchema, TITLE_MAX_LENGTH } from '../../schemas/titleSchema'

const validationSchema = object({ title: titleSchema() })

type HarnessProps = {
  initialTitle?: string
  onSubmit?: () => void | Promise<void>
  children?: React.ReactNode
}

const renderTitleField = ({
  initialTitle = '',
  onSubmit = vi.fn(),
  children
}: HarnessProps = {}) =>
  render(
    <Formik
      initialValues={{ title: initialTitle }}
      validationSchema={validationSchema}
      onSubmit={onSubmit}
    >
      <Form>
        <TitleField />
        {children}
      </Form>
    </Formik>
  )

const getInput = () =>
  screen.getByRole('textbox', { name: /title/i }) as HTMLInputElement

describe('TitleField', () => {
  describe('rendering', () => {
    it('renders a Title input', () => {
      renderTitleField()
      expect(getInput()).toBeInTheDocument()
    })

    it('reflects the Formik field value', () => {
      renderTitleField({ initialTitle: 'Existing' })
      expect(getInput().value).toBe('Existing')
    })
  })

  describe('character cap', () => {
    it('applies a maxLength attribute equal to TITLE_MAX_LENGTH', () => {
      renderTitleField()
      expect(getInput()).toHaveAttribute('maxlength', String(TITLE_MAX_LENGTH))
    })

    it('prevents typing beyond the maximum length', async () => {
      const user = userEvent.setup()
      renderTitleField()
      const input = getInput()
      await user.type(input, 'a'.repeat(TITLE_MAX_LENGTH + 10))
      expect(input.value).toHaveLength(TITLE_MAX_LENGTH)
    })
  })

  describe('live character counter', () => {
    it('shows 0/max when empty', () => {
      renderTitleField()
      expect(screen.getByText(`0/${TITLE_MAX_LENGTH}`)).toBeInTheDocument()
    })

    it('updates the counter as the user types', async () => {
      const user = userEvent.setup()
      renderTitleField()
      await user.type(getInput(), 'Hello')
      expect(screen.getByText(`5/${TITLE_MAX_LENGTH}`)).toBeInTheDocument()
    })
  })

  describe('validation feedback', () => {
    it('shows the error message once the field is touched and invalid', async () => {
      const user = userEvent.setup()
      renderTitleField()
      const input = getInput()
      await user.type(input, 'ab')
      fireEvent.blur(input) // marks the field touched -> Formik validates
      expect(
        await screen.findByText(/at least 4 characters/i)
      ).toBeInTheDocument()
    })

    it('does not show an error before the field is touched', async () => {
      const user = userEvent.setup()
      renderTitleField()
      await user.type(getInput(), 'ab')
      expect(screen.queryByText(/at least 4 characters/i)).not.toBeInTheDocument()
    })
  })

  describe('disabled state', () => {
    it('honors an explicit disabled prop', () => {
      render(
        <Formik initialValues={{ title: '' }} onSubmit={vi.fn()}>
          <Form>
            <TitleField disabled />
          </Form>
        </Formik>
      )
      expect(getInput()).toBeDisabled()
    })

    it('disables the input while the form is submitting', async () => {
      const user = userEvent.setup()
      // A submit handler that never resolves keeps isSubmitting true.
      renderTitleField({
        initialTitle: 'Valid Title',
        onSubmit: () => new Promise<void>(() => {}),
        children: <button type="submit">Submit</button>
      })
      await user.click(screen.getByRole('button', { name: /submit/i }))
      expect(await screen.findByRole('textbox', { name: /title/i })).toBeDisabled()
    })
  })
})
