import { Button } from '@mui/material'
import ScienceIcon from '@mui/icons-material/Science'
import { useStartClassicJob } from './classicHandoff'

interface UseInClassicJobButtonProps {
  /** The structure the Jiffy worked on: a PDB or mmCIF file */
  structure: File | null
  /** The const.inp it made; null disables the button */
  constInp: string | null
  /** For the form's note: "the Inp Jiffy™" */
  from: string
  disabled?: boolean
}

/**
 * Opens a new BilboMD Classic job with a Jiffy's structure and const.inp
 * already picked, instead of a download and an upload.
 */
export const UseInClassicJobButton = ({
  structure,
  constInp,
  from,
  disabled
}: UseInClassicJobButtonProps) => {
  const startClassicJob = useStartClassicJob()
  return (
    <Button
      variant="contained"
      startIcon={<ScienceIcon />}
      disabled={disabled || !structure || constInp === null}
      onClick={() => {
        if (!structure || constInp === null) return
        startClassicJob({
          structure,
          constraints: new File([constInp], 'const.inp', {
            type: 'text/plain'
          }),
          from
        })
      }}
    >
      Use in a new Classic job
    </Button>
  )
}

export default UseInClassicJobButton
