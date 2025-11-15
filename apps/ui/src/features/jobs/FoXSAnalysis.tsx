import { useMemo } from 'react'
import FoXSChart from 'features/scoperjob/FoXSChart'
import { Alert, AlertTitle } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useGetFoxsAnalysisByIdQuery } from 'slices/jobsApiSlice'
import { useGetPublicFoxsDataQuery } from 'slices/publicJobsApiSlice'
import CircularProgress from '@mui/material/CircularProgress'
import FoXSEnsembleCharts from 'features/foxs/FoXSEnsembleCharts'
import Item from 'themes/components/Item'
import { FoxsData, FoxsDataPoint } from '@bilbomd/bilbomd-types'

// Define types
type CombinedFoxsData = {
  q: number
  exp_intensity: number
} & Record<string, number>

type ScoperFoXSAnalysisProps = {
  id: string
}

// Allows dynamic keys like model_intensity_1, residual_1, etc., without using `any`
type CombinedFoxsDataDynamic = CombinedFoxsData &
  Record<`model_intensity_${number}` | `residual_${number}`, number>

const prepData = (data: FoxsDataPoint[]): FoxsDataPoint[] =>
  data
    .filter((item) => item.exp_intensity > 0 && item.model_intensity > 0)
    .map((item) => ({
      q: parseFloat(item.q.toFixed(4)),
      exp_intensity: parseFloat(item.exp_intensity.toFixed(4)),
      model_intensity: parseFloat(item.model_intensity.toFixed(4)),
      error: parseFloat(item.error.toFixed(4))
    }))

const combineFoxsData = (foxsDataArray: FoxsData[]): CombinedFoxsData[] => {
  if (!Array.isArray(foxsDataArray) || foxsDataArray.length < 2) {
    console.warn(
      'FoXSAnalysis: Not enough data to process ensemble comparison.'
    )
    return []
  }

  const base = foxsDataArray[0]
  if (!base || !Array.isArray(base.data) || base.data.length === 0) {
    console.warn('FoXSAnalysis: Base FoXS dataset is empty or invalid.')
    return []
  }

  // Initially map over the base data to calculate model intensities and residuals
  let baseData: CombinedFoxsData[] = base.data.map((point, index) => {
    const q = point?.q != null ? parseFloat(point.q.toFixed(4)) : 0
    const exp_intensity =
      point?.exp_intensity != null
        ? parseFloat(point.exp_intensity.toFixed(4))
        : 0
    const error =
      point?.error != null ? Math.max(parseFloat(point.error.toFixed(4)), 0) : 1

    const combinedData: CombinedFoxsDataDynamic = {
      q,
      exp_intensity,
      error
    } as CombinedFoxsDataDynamic

    foxsDataArray.slice(1).forEach((foxsData, dataIndex) => {
      const modelIntensityKey = `model_intensity_${dataIndex + 1}` as const
      const residualKey = `residual_${dataIndex + 1}` as const
      const currentPoint = foxsData?.data?.[index]

      if (currentPoint) {
        const model_intensity =
          currentPoint.model_intensity != null
            ? Math.max(parseFloat(currentPoint.model_intensity.toFixed(4)), 0)
            : 0
        combinedData[modelIntensityKey] = model_intensity
        combinedData[residualKey] =
          error !== 0
            ? parseFloat(((exp_intensity - model_intensity) / error).toFixed(4))
            : 0
      }
    })

    return combinedData
  })

  // Filter the baseData array to exclude any data points with negative exp_intensity values
  baseData = baseData.filter((dataPoint) => (dataPoint?.exp_intensity ?? 0) > 0)

  return baseData
}

const calculateResiduals = (dataPoints: FoxsDataPoint[]) => {
  const arr = Array.isArray(dataPoints) ? dataPoints : []
  return arr.map((item) => {
    const q = item?.q != null ? parseFloat(item.q.toFixed(4)) : 0
    const num = (item?.exp_intensity ?? 0) - (item?.model_intensity ?? 0)
    const denom = item?.error ?? 1
    const res = denom !== 0 ? parseFloat((num / denom).toFixed(4)) : 0
    return { q, res }
  })
}

/**
 * FoXSAnalysis component
 * @param id - Job ID (for protected usage)
 * @param publicId - Public ID (for public usage, optional)
 * @param isPublic - If true, uses public query; otherwise, uses protected query
 * @param active - (optional) If false, data fetching is skipped. Defaults to true for backwards compatibility.
 */
const FoXSAnalysis = ({
  id,
  publicId,
  isPublic = false,
  active = true
}: Omit<ScoperFoXSAnalysisProps, 'id'> & {
  id?: string
  publicId?: string
  isPublic?: boolean
  active?: boolean
}) => {
  // Conditionally use the appropriate query
  const protectedQuery = useGetFoxsAnalysisByIdQuery(id, {
    pollingInterval: 0,
    refetchOnFocus: true,
    refetchOnMountOrArgChange: true,
    skip: !active || isPublic // Skip if public or inactive
  })
  const publicQuery = useGetPublicFoxsDataQuery(publicId || '', {
    skip: !active || !isPublic || !publicId // Skip if not public, inactive, or no publicId
  })

  // console.log(
  //   'FoXSAnalysis: isPublic=',
  //   isPublic,
  //   'publicId=',
  //   publicId,
  //   'active=',
  //   active,
  //   'skip public=',
  //   !active || !isPublic || !publicId
  // )

  // Select the active query result
  const { data, isLoading, isError } = isPublic ? publicQuery : protectedQuery

  // console.log('FoXSAnalysis data:', data)

  const foxsData = useMemo(
    () => (Array.isArray(data) ? (data as FoxsData[]) : []),
    [data]
  )

  const hasBase = useMemo(
    () =>
      foxsData.length > 0 &&
      Array.isArray(foxsData[0]?.data) &&
      foxsData[0]!.data.length > 0,
    [foxsData]
  )

  const hasEnsemble = useMemo(() => foxsData.length > 1, [foxsData])

  const origData = useMemo(
    () => (hasBase ? prepData(foxsData[0]!.data as FoxsDataPoint[]) : []),
    [hasBase, foxsData]
  )
  const ensembleData = useMemo(
    () => (hasEnsemble ? combineFoxsData(foxsData) : []),
    [hasEnsemble, foxsData]
  )

  const origResiduals = useMemo(
    () => (origData.length ? calculateResiduals(origData) : []),
    [origData]
  )

  const { minYAxis, maxYAxis } = useMemo(() => {
    if (!origResiduals.length) return { minYAxis: -1, maxYAxis: 1 }
    const maxY = Math.max(...origResiduals.map((r) => Math.abs(r.res)))
    const safe = Number.isFinite(maxY) && maxY > 0 ? maxY : 1
    return { minYAxis: -safe, maxYAxis: safe }
  }, [origResiduals])

  if (isLoading)
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh'
        }}
      >
        <CircularProgress />
      </div>
    )

  if (isError) {
    return (
      <Alert
        severity="error"
        variant="outlined"
      >
        <AlertTitle>FoXS request failed.</AlertTitle>
        The server returned an error while fetching FoXS data.
      </Alert>
    )
  }

  if (!hasBase) {
    return (
      <Alert
        severity="info"
        variant="outlined"
      >
        <AlertTitle>FoXS data is unavailable for this job.</AlertTitle>
        No experimental <code>.dat</code> or base FoXS dataset was found.
      </Alert>
    )
  }

  // Pull out the other info needed for the FoXS plots
  // const origPDBFile = foxsData[0].filename
  const origChiSq = foxsData[0].chisq
  const origC1 = foxsData[0].c1
  const origC2 = foxsData[0].c2

  // console.log('data:', data)

  return (
    <Item>
      <Grid
        container
        spacing={2}
      >
        <Grid size={{ xs: 6 }}>
          <FoXSChart
            title={`Original Model`}
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
          {hasEnsemble && ensembleData.length ? (
            <FoXSEnsembleCharts
              combinedData={ensembleData}
              foxsData={foxsData}
              minYAxis={minYAxis}
              maxYAxis={maxYAxis}
            />
          ) : (
            <Alert
              severity="info"
              variant="outlined"
            >
              <AlertTitle>No ensemble data</AlertTitle>
              Only a single FoXS dataset is available; ensemble comparison
              charts are hidden.
            </Alert>
          )}
        </Grid>
      </Grid>
    </Item>
  )
}

export default FoXSAnalysis
