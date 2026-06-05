import {
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio
} from '@mui/material'

type MdEngineFieldProps = {
  value: 'charmm' | 'openmm'
  onChange: (value: 'charmm' | 'openmm') => void
  disabled?: boolean
  disableCharmm?: boolean
}

const MdEngineField = ({
  value,
  onChange,
  disabled,
  disableCharmm
}: MdEngineFieldProps) => (
  <FormControl
    component="fieldset"
    sx={{ my: 2 }}
    disabled={disabled}
  >
    <FormLabel component="legend">MD Engine</FormLabel>
    <RadioGroup
      row
      value={value}
      onChange={(e) =>
        onChange((e.target as HTMLInputElement).value as 'charmm' | 'openmm')
      }
      name="md_engine"
    >
      <FormControlLabel
        value="openmm"
        control={<Radio />}
        label="OpenMM"
      />
      <FormControlLabel
        value="charmm"
        control={<Radio />}
        label="CHARMM"
        disabled={disableCharmm}
      />
    </RadioGroup>
  </FormControl>
)

export default MdEngineField
