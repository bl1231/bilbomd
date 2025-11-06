import { Button, Grid, Typography } from '@mui/material'
import HeaderBox from 'components/HeaderBox'
import Item from 'themes/components/Item'
import { axiosInstance } from 'app/api/axios'
import type { PublicJobStatus } from '@bilbomd/bilbomd-types'

const handleDownload = async (publicId: string) => {
  try {
    const response = await axiosInstance.get(
      `/public/jobs/${publicId}/results`,
      {
        responseType: 'blob'
      }
    )

    if (response && response.data) {
      const contentDisposition = response.headers['content-disposition']
      let filename = 'results.tar.gz' // sensible default

      if (contentDisposition) {
        const matches = /filename="?([^"]+)"?/.exec(contentDisposition)
        if (matches && matches.length > 1) {
          filename = matches[1]
        }
      }

      const url = window.URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.parentNode?.removeChild(link)
    } else {
      console.error('No data to download')
    }
  } catch (error) {
    console.error('Download results error:', error)
  }
}

const PublicDownloadResultsSection = ({ job }: { job: PublicJobStatus }) => {
  console.log('PublicDownloadResultsSection loaded')
  return (
    <Grid size={{ xs: 12 }}>
      <HeaderBox sx={{ py: '6px' }}>
        <Typography>Results</Typography>
      </HeaderBox>
      <Item>
        <Button
          variant="contained"
          onClick={() => {
            void handleDownload(job.publicId)
          }}
          sx={{ mr: 2 }}
        >
          Download Results
        </Button>

        <Typography>
          The{' '}
          <span
            style={{
              fontWeight: 'bold',
              fontFamily: 'Courier, monospace'
            }}
          >
            results-{job.publicId.split('-')[0]}.tar.gz
          </span>{' '}
          tar archive will contains your original files plus some output files
          from BilboMD.
        </Typography>
      </Item>
    </Grid>
  )
}

export default PublicDownloadResultsSection
