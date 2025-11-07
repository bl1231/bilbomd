import { apiSlice } from 'app/api/apiSlice'
import type { PublicJobStatus, AnonJobResponse } from '@bilbomd/bilbomd-types'
import type { IFeedbackData } from '@bilbomd/mongodb-schema/frontend'
import type { FoxsData } from 'types/foxs'

export const publicJobsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    addNewPublicJob: builder.mutation<AnonJobResponse, FormData>({
      query: (formData) => ({
        url: '/public/jobs',
        method: 'POST',
        body: formData
      })
    }),
    getPublicJobById: builder.query<PublicJobStatus, string>({
      query: (publicId) => `/public/jobs/${publicId}`
    }),
    getPublicFoxsData: builder.query<FoxsData[], string>({
      query: (publicId) => `/public/jobs/${publicId}/results/foxs`
    }),
    getPublicFeedbackData: builder.query<IFeedbackData, string>({
      query: (publicId) => `/public/jobs/${publicId}/results/feedback`
    }),
    getPublicResultFile: builder.query<
      Blob,
      { publicId: string; filename: string }
    >({
      query: ({ publicId, filename }) => ({
        url: `/public/jobs/${publicId}/results/${filename}`,
        responseHandler: (response) => response.blob()
      })
    })
  })
})

export const {
  useAddNewPublicJobMutation,
  useGetPublicJobByIdQuery,
  useGetPublicFoxsDataQuery,
  useGetPublicFeedbackDataQuery,
  useGetPublicResultFileQuery
} = publicJobsApiSlice
