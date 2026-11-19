import { useState, ChangeEvent } from 'react'
import {
  Button,
  FormControl,
  FormControlProps,
  Input,
  Alert
} from '@mui/material'
import Grid from '@mui/material/Grid'

interface FileFieldProps extends FormControlProps {
  id: string
  name: string
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  title: string
  isError: boolean
  errorMessage: string
  fileExt: string
  setFieldValue: (field: string, value: File, shouldValidate?: boolean) => void
  /** The field's value, from Formik: a File, or an object with its name */
  value?: unknown
}

// The name of a file already in the form, so a picker shown again (Back to
// this step) still says which file it holds
const nameOf = (value: unknown): string => {
  if (value instanceof File) return value.name
  if (typeof value === 'object' && value !== null && 'name' in value) {
    const { name } = value as { name: unknown }
    return typeof name === 'string' ? name : ''
  }
  return ''
}

// As tall as the button beside it; a long message can still grow
const alertSx = {
  minHeight: '40px',
  py: 0,
  fontSize: '1.1rem',
  alignItems: 'center',
  '& .MuiAlert-icon, & .MuiAlert-message': { py: 0 }
}

const FileField = ({
  id,
  name,
  title,
  isError,
  errorMessage,
  fileExt,
  setFieldValue,
  onChange,
  value
}: FileFieldProps) => {
  const [picked, setFileName] = useState('')
  const fileName = picked || nameOf(value)

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault()
    const file = event.target.files?.[0]
    if (file) {
      setFileName(file.name)
      setFieldValue(name, file)
      if (onChange) {
        onChange(event)
      }
    }
  }
  return (
    <FormControl error={isError}>
      {/* <FormLabel>test</FormLabel> */}
      <Grid
        container
        spacing={2}
        sx={{ alignItems: 'center' }}
      >
        <Grid>
          <Input
            style={{ display: 'none' }}
            id={id}
            name={name}
            type="file"
            onChange={handleFileChange}
            slotProps={{ input: { accept: fileExt } }}
          />
          <label htmlFor={id}>
            <Button
              variant="contained"
              component="span"
              sx={{
                height: '40px',
                // Grow for a longer title ("Select const.inp") instead of
                // wrapping it onto a clipped second line
                minWidth: '160px',
                whiteSpace: 'nowrap',
                // Show file names as written, not capitalised
                textTransform: 'none',
                fontSize: '1.1rem',
                alignItems: 'center'
              }}
            >
              {title}
            </Button>
          </label>
        </Grid>
        <Grid>
          {fileName && !errorMessage ? (
            <Alert
              variant="outlined"
              severity="success"
              sx={alertSx}
            >
              {fileName}
            </Alert>
          ) : null}
          {isError ? (
            <Alert
              severity="error"
              sx={alertSx}
            >
              {errorMessage}
            </Alert>
          ) : null}
        </Grid>
        {/* <Grid item>
          {fileName && !errorMessage ? (
            <Alert variant="outlined" severity="info" sx={{ py: 0 }}>
              {fileName}
            </Alert>
          ) : null}
        </Grid> */}
      </Grid>
    </FormControl>
  )
}

export default FileField
