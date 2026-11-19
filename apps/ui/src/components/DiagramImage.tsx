import { Box } from '@mui/material'

interface DiagramImageProps {
  src: string
  alt: string
}

/**
 * A figure drawn for a white page (black labels, transparent background).
 * In dark mode it sits on a white card so its labels and arrows stay visible.
 */
const DiagramImage = ({ src, alt }: DiagramImageProps) => (
  <Box
    component="img"
    src={src}
    alt={alt}
    sx={[
      { maxWidth: '100%', height: 'auto' },
      (theme) =>
        theme.palette.mode === 'dark'
          ? { backgroundColor: '#fff', p: 1.5, borderRadius: 1 }
          : {}
    ]}
  />
)

export default DiagramImage
