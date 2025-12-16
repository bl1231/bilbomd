import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

type PipelineType = 'pdb' | 'crd' | 'auto' | 'sans' | 'multi'

export interface PerPipelineCount {
  pipeline: PipelineType
  count: number
}
export interface SuccessRateByPipeline {
  pipeline: PipelineType
  successRate: number
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
  day: string
  pipeline: PipelineType
  count: number
}

export interface SummaryAnalytics {
  users: number
  jobs: number
  multijobs: number
  jobsCompleted: number
  jobsFailed: number
  usagePerPipeline: PerPipelineCount[]
}

export const analyticsApi = createApi({
  reducerPath: 'analyticsApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '/api/v1/admin/analytics',
    credentials: 'include'
  }),
  tagTypes: ['Analytics'],
  endpoints: (builder) => ({
    getSummary: builder.query<SummaryAnalytics, void>({
      query: () => ({ url: '/summary' }),
      providesTags: ['Analytics']
    }),
    getJobsByUser: builder.query<{ userId: string; count: number }[], void>({
      query: () => ({ url: '/jobs/by-user' }),
      providesTags: ['Analytics']
    }),
    getJobsByType: builder.query<
      { pipeline: PipelineType; count: number }[],
      void
    >({
      query: () => ({ url: '/jobs/by-type' }),
      providesTags: ['Analytics']
    }),
    getJobsByStatus: builder.query<{ status: string; count: number }[], void>({
      query: () => ({ url: '/jobs/by-status' }),
      providesTags: ['Analytics']
    }),
    getJobsTimeseries: builder.query<
      { day: string; count: number }[],
      {
        start?: string
        end?: string
        granularity?: 'day' | 'week' | 'month'
        status?: string
        type?: PipelineType
      }
    >({
      query: (params) => ({ url: '/jobs/timeseries', params }),
      providesTags: ['Analytics']
    }),
    getUsagePerPipeline: builder.query<PerPipelineCount[], void>({
      query: () => ({ url: '/usage/per-pipeline' }),
      providesTags: ['Analytics']
    }),
    getUsageSuccessRate: builder.query<SuccessRateByPipeline[], void>({
      query: () => ({ url: '/usage/success-rate' }),
      providesTags: ['Analytics']
    }),
    getUsageDurationStats: builder.query<DurationStatsByPipeline[], void>({
      query: () => ({ url: '/usage/duration-stats' }),
      providesTags: ['Analytics']
    }),
    getUsageAccessModeSplit: builder.query<AccessModeSplitByPipeline[], void>({
      query: () => ({ url: '/usage/access-mode-split' }),
      providesTags: ['Analytics']
    }),
    getUsageDailyCounts: builder.query<
      DailyCountsByPipeline[],
      { start?: string; end?: string }
    >({
      query: (params) => ({ url: '/usage/daily', params }),
      providesTags: ['Analytics']
    })
  })
})

export const {
  useGetSummaryQuery,
  useGetJobsByUserQuery,
  useGetJobsByTypeQuery,
  useGetJobsByStatusQuery,
  useGetJobsTimeseriesQuery,
  useGetUsagePerPipelineQuery,
  useGetUsageSuccessRateQuery,
  useGetUsageDurationStatsQuery,
  useGetUsageAccessModeSplitQuery,
  useGetUsageDailyCountsQuery
} = analyticsApi
