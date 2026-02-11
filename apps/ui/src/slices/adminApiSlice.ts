import { apiSlice } from 'app/api/apiSlice'
import type { FrontendBullMQJob } from 'types/bullmq'

interface QueueInfo {
  name: string
  isPaused: boolean
  jobCounts: {
    active: number
    completed: number
    delayed: number
    failed: number
    paused: number
    prioritized: number
    waiting: number
    ['waiting-children']: number
  }
}

interface QueueJobsResponse {
  jobs: FrontendBullMQJob[]
}

interface QueueMutationParams {
  queueName: string
  jobId: string
}

export const adminApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getQueues: builder.query<QueueInfo[], string | void>({
      query: () => '/admin/queues',
      providesTags: ['AdminQueue']
    }),
    pauseQueue: builder.mutation<void, string>({
      query: (queueName) => ({
        url: `/admin/queues/${queueName}/pause`,
        method: 'POST'
      }),
      invalidatesTags: ['AdminQueue']
    }),
    resumeQueue: builder.mutation<void, string>({
      query: (queueName) => ({
        url: `/admin/queues/${queueName}/resume`,
        method: 'POST'
      }),
      invalidatesTags: ['AdminQueue']
    }),
    getJobsByQueue: builder.query<QueueJobsResponse, string>({
      query: (queueName) => `/admin/queues/${queueName}/jobs`
    }),
    retryQueueJob: builder.mutation<void, QueueMutationParams>({
      query: ({ queueName, jobId }) => ({
        url: `/admin/queues/${queueName}/jobs/${jobId}/retry`,
        method: 'POST'
      }),
      invalidatesTags: ['AdminQueue']
    }),
    deleteQueueJob: builder.mutation<void, QueueMutationParams>({
      query: ({ queueName, jobId }) => ({
        url: `/admin/queues/${queueName}/jobs/${jobId}`,
        method: 'DELETE'
      }),
      invalidatesTags: ['AdminQueue']
    }),
    drainQueue: builder.mutation<void, string>({
      query: (queueName) => ({
        url: `/admin/queues/${queueName}/drain`,
        method: 'POST'
      }),
      invalidatesTags: ['AdminQueue']
    }),
    failQueueJob: builder.mutation<void, QueueMutationParams>({
      query: ({ queueName, jobId }) => ({
        url: `/admin/queues/${queueName}/jobs/${jobId}/fail`,
        method: 'POST'
      }),
      invalidatesTags: ['AdminQueue']
    })
  })
})

export const {
  useGetQueuesQuery,
  usePauseQueueMutation,
  useResumeQueueMutation,
  useGetJobsByQueueQuery,
  useRetryQueueJobMutation,
  useDeleteQueueJobMutation,
  useDrainQueueMutation,
  useFailQueueJobMutation
} = adminApiSlice
