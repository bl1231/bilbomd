export interface FoxsDataPoint {
  q: number
  exp_intensity: number
  model_intensity: number
  error: number
}

// interface ResidualDataPoints {
//   q: number
//   [key: `res_${number}`]: number
// }

export interface FoxsData {
  filename: string
  chisq: number
  c1: string
  c2: string
  data: FoxsDataPoint[]
}

export interface CombinedFoxsData {
  q: number
  exp_intensity: number
  error: number
  [key: `model_intensity_${number}`]: number
  [key: `residual_${number}`]: number
}

export interface ScoperFoXSAnalysisProps {
  id: string
}
