import { TextField } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { useField, useFormikContext } from 'formik'
import { TITLE_MAX_LENGTH } from '../schemas/titleSchema'

type TitleFieldProps = {
  /** Formik field name. Defaults to `title`. */
  name?: string
  /** Field label. Defaults to `Title`. */
  label?: string
  /** Hard character cap applied to the input. Defaults to {@link TITLE_MAX_LENGTH}. */
  maxLength?: number
  /**
   * Disable the field. When omitted the field is disabled while the form is
   * submitting.
   */
  disabled?: boolean
  fullWidth?: boolean
  sx?: SxProps<Theme>
}

/**
 * Shared job-title input used by every BilboMD job form.
 *
 * Wires itself to Formik via `useField`, caps typing at `maxLength`, and shows
 * a live character counter that switches to the validation error once the
 * field is touched. Pair with `titleSchema` in the form's validation schema.
 */
const TitleField = ({
  name = 'title',
  label = 'Title',
  maxLength = TITLE_MAX_LENGTH,
  disabled,
  fullWidth = true,
  sx = { width: '100%' }
}: TitleFieldProps) => {
  const [field, meta] = useField<string | undefined>(name)
  const { isSubmitting } = useFormikContext()

  const value = field.value ?? ''
  const showError = Boolean(meta.error) && meta.touched
  const isDisabled = disabled ?? isSubmitting

  return (
    <TextField
      id={name}
      label={label}
      type="text"
      fullWidth={fullWidth}
      disabled={isDisabled}
      error={showError}
      helperText={showError ? meta.error : `${value.length}/${maxLength}`}
      slotProps={{ htmlInput: { maxLength } }}
      sx={sx}
      {...field}
      value={value}
    />
  )
}

export default TitleField
