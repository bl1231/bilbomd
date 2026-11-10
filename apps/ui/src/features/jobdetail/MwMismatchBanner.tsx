import { Alert, AlertTitle, Button } from '@mui/material'
import { describeDiff, type MwMismatch } from 'features/analysis/feedbackModel'

type MwMismatchBannerProps = {
  mismatch: MwMismatch
  onShowDetails: () => void
}

// A mismatch between the model and the sample is the most common reason a
// job cannot find a good fit, so it is said on the page itself rather than
// only inside the Feedback & Validation tab.
const MwMismatchBanner = ({
  mismatch,
  onShowDetails
}: MwMismatchBannerProps) => (
  <Alert
    severity="warning"
    variant="outlined"
    action={
      <Button
        color="inherit"
        size="small"
        sx={{ whiteSpace: 'nowrap' }}
        onClick={onShowDetails}
      >
        See details
      </Button>
    }
  >
    <AlertTitle>Your model and your SAXS data may not match</AlertTitle>
    The model weighs {mismatch.modelKda.toFixed(1)} kDa, but the SAXS data
    suggest about {mismatch.saxsKda.toFixed(1)} kDa (
    {describeDiff(mismatch.diffFraction)}). Check that the sequence and the
    oligomeric state of the model are those of the sample
    {mismatch.diffFraction > 0 ? ', and that the sample is not aggregated' : ''}
    . The SAXS estimate is approximate, so treat this as a prompt to check
    rather than a verdict.
  </Alert>
)

export default MwMismatchBanner
