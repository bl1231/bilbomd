import { useMemo } from 'react'
import FoXSChart from './FoXSChart'
import { Alert, AlertTitle } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useGetFoxsAnalysisByIdQuery } from 'slices/jobsApiSlice'
import Item from 'themes/components/Item'

interface FoxsDataPoint {
  q: number
  exp_intensity: number
  model_intensity: number
  error: number
}

interface FoxsData {
  filename: string
  chisq: number
  c1: string
  c2: string
  data: FoxsDataPoint[]
}

interface ScoperFoXSAnalysisProps {
  id: string
}

const prepData = (data: FoxsDataPoint[]): FoxsDataPoint[] =>
  data
    .filter((item) => item.exp_intensity > 0 && item.model_intensity > 0)
    .map((item) => ({
      q: parseFloat(item.q.toFixed(4)),
      exp_intensity: parseFloat(item.exp_intensity.toFixed(4)),
      model_intensity: parseFloat(item.model_intensity.toFixed(4)),
      error: parseFloat(item.error.toFixed(4))
    }))

const calculateResiduals = (dataPoints: FoxsDataPoint[]) => {
  return dataPoints
    .map((item) => {
      const q = parseFloat(item.q.toFixed(4))
      const num = item.exp_intensity - item.model_intensity
      const denom = item.error
      const res =
        Number.isFinite(denom) && denom !== 0
          ? parseFloat((num / denom).toFixed(4))
          : 0
      return { q, res }
    })
    .filter((point) => Number.isFinite(point.res))
}

const ScoperFoXSAnalysis = ({ id }: ScoperFoXSAnalysisProps) => {
  const { data, isLoading, isError } = useGetFoxsAnalysisByIdQuery(id, {
    pollingInterval: 30000,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true
  })

  // Memoize foxsData to prevent unnecessary re-renders
  const foxsData = useMemo(
    () => ((data ?? []) as FoxsData[]),
    [data]
  )

  // Prepare original data to reduce the number of digits after the decimal point
  // and filter out negative values
  const origData = useMemo(
    () => (foxsData.length > 0 ? prepData(foxsData[0].data) : []),
    [foxsData]
  )
  const scopData = useMemo(
    () => (foxsData.length > 1 ? prepData(foxsData[1].data) : []),
    [foxsData]
  )

  // Calculate residual values for both datasets
  const origResiduals = useMemo(
    () => (origData.length > 0 ? calculateResiduals(origData) : []),
    [origData]
  )
  const scopResiduals = useMemo(
    () => (scopData.length > 0 ? calculateResiduals(scopData) : []),
    [scopData]
  )

  // Define a Memoized calculation for min and max Y axis values
  const { minYAxis, maxYAxis } = useMemo(() => {
    if (!origResiduals.length) return { minYAxis: -1, maxYAxis: 1 }
    const maxY = Math.max(...origResiduals.map((r) => Math.abs(r.res)))
    const safe = Number.isFinite(maxY) && maxY > 0 ? maxY : 1
    return { minYAxis: -safe, maxYAxis: safe }
  }, [origResiduals])

  // Handle loading and error states
  if (isLoading) return <div>Loading...</div>
  if (isError || !data || foxsData.length < 2)
    return (
      <Alert
        severity="info"
        variant="outlined"
      >
        <AlertTitle>FoXS data is unavailable for this job.</AlertTitle>
      </Alert>
    )

  // Pull out the other info needed for the FoXS plots
  const origPDBFile = foxsData[0].filename
  const scopPDBFile = foxsData[1].filename
  const origChiSq = foxsData[0].chisq
  const scopChiSq = foxsData[1].chisq
  const origC1 = foxsData[0].c1
  const scopC1 = foxsData[1].c1
  const origC2 = foxsData[0].c2
  const scopC2 = foxsData[1].c2

  return (
    <Item>
      <Grid
        container
        spacing={2}
      >
        <Grid size={{ xs: 6 }}>
          <FoXSChart
            title={`Original Model - ${origPDBFile}`}
            data={origData}
            residualsData={origResiduals}
            chisq={origChiSq}
            c1={origC1}
            c2={origC2}
            minYAxis={minYAxis}
            maxYAxis={maxYAxis}
          />
        </Grid>
        <Grid size={{ xs: 6 }}>
          <FoXSChart
            title={`Scoper Model - ${scopPDBFile}`}
            data={scopData}
            residualsData={scopResiduals}
            chisq={scopChiSq}
            c1={scopC1}
            c2={scopC2}
            minYAxis={minYAxis}
            maxYAxis={maxYAxis}
          />
        </Grid>
      </Grid>
    </Item>
  )
}

export default ScoperFoXSAnalysis
