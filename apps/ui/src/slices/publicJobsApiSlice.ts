import { apiSlice } from 'app/api/apiSlice'
import type { PublicJobStatus, AnonJobResponse } from '@bilbomd/bilbomd-types'

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
    })
  })
})

export const { useAddNewPublicJobMutation, useGetPublicJobByIdQuery } =
  publicJobsApiSlice
