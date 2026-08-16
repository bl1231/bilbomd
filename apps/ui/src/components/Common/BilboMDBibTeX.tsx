import { Box, Typography } from '@mui/material'
import CopyToClipboardButton from 'components/Common/CopyToClipboardButton'

const BIBTEX = `@article{10.1093/nar/gkag377,
    author = {Classen, Scott and Del Mundo, Joshua and Kulkarni, Dhruva and Prabhakar, Shreyas and Hicks, Alan and Hammel, Michal},
    title = {BilboMD: a web-accessible SAXS and AlphaFold-guided modeling pipeline},
    journal = {Nucleic Acids Research},
    pages = {gkag377},
    year = {2026},
    month = {04},
    issn = {1362-4962},
    doi = {10.1093/nar/gkag377},
    url = {https://doi.org/10.1093/nar/gkag377},
    eprint = {https://academic.oup.com/nar/advance-article-pdf/doi/10.1093/nar/gkag377/68163429/gkag377.pdf},
}`

const BilboMDBibTeX = () => (
  <Box sx={{ my: 1 }}>
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderRadius: '4px',
        p: 2,
        backgroundColor: 'grey.100',
        border: '1px solid',
        borderColor: 'grey.300'
      }}
    >
      <Typography
        component='pre'
        variant='body2'
        sx={{
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          m: 0,
          minWidth: 0,
          overflowWrap: 'anywhere'
        }}
      >
        {BIBTEX}
      </Typography>
      <Box sx={{ ml: 2, flexShrink: 0 }}>
        <CopyToClipboardButton text={BIBTEX} />
      </Box>
    </Box>
  </Box>
)

export default BilboMDBibTeX
