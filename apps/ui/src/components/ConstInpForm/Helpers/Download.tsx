import { Box, Button } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'

interface DownloadButtonProps {
  /** The file's text; null disables the button */
  content: string | null
  fileName: string
  /** Called once the file has been saved */
  onDownload?: () => void
}

/** Saves the given text as a file, made here in the browser */
const DownloadButton = ({
  content,
  fileName,
  onDownload
}: DownloadButtonProps) => {
  const handleDownload = () => {
    if (content === null) return
    const url = window.URL.createObjectURL(
      new Blob([content], { type: 'text/plain' })
    )
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', fileName)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
    onDownload?.()
  }

  return (
    <Button
      variant="outlined"
      type="button"
      startIcon={<DownloadIcon />}
      disabled={content === null}
      onClick={handleDownload}
    >
      {/* The theme capitalizes button text; a file name keeps its case */}
      Download{' '}
      <Box
        component="span"
        // The button is a flex box, which drops the space before it
        sx={{ textTransform: 'none', ml: '0.3em' }}
      >
        {fileName}
      </Box>
    </Button>
  )
}

export default DownloadButton
