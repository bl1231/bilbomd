export type FoxsDataPoint = {
  q: number
  exp_intensity: number
  model_intensity: number
  error: number
}

export type FoxsData = {
  filename: string
  chisq: number
  c1: string
  c2: string
  data: FoxsDataPoint[]
}
