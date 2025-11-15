import { Typography, Container } from '@mui/material'
import useTitle from 'hooks/useTitle'

const SampleData = ({ title = 'BilboMD: Sample Data' }) => {
  useTitle(title)
  return (
    <Container>
      <Typography
        variant="h4"
        gutterBottom
      >
        Sample Data
      </Typography>
      <Typography
        variant="body1"
        gutterBottom
      >
        This is the sample data page for BilboMD. Here you can find example
        inputs and outputs to help you get started with the platform.
      </Typography>
    </Container>
  )
}

export default SampleData
