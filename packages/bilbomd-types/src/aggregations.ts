// BilboMD Usage Aggregation DTOs

import type { PipelineType } from './usage-events.js'

export interface PerPipelineCount {
  pipeline: PipelineType
  count: number
}

export interface SuccessRateByPipeline {
  pipeline: PipelineType
  successRate: number // 0..1
  total: number
}

export interface DurationStatsByPipeline {
  pipeline: PipelineType
  avgMs: number
  p50Ms?: number
  p90Ms?: number
  count: number
}

export interface AccessModeSplitByPipeline {
  pipeline: PipelineType
  access_mode: 'user' | 'anonymous'
  count: number
}

export interface DailyCountsByPipeline {
  day: string // ISO date string truncated to day
  pipeline: PipelineType
  count: number
}
