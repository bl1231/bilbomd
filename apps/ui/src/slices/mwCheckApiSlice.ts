import { apiSlice } from 'app/api/apiSlice'
import type { MwCheckResponse } from '@bilbomd/bilbomd-types'

// The pre-submission model-vs-SAXS mass check. In its own slice so the job
// forms can use it without touching the job endpoints.
export const mwCheckApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    checkMw: builder.mutation<MwCheckResponse, FormData>({
      query: (formData) => ({
        url: '/mw-check',
        method: 'POST',
        body: formData
      })
    })
  })
})

export const { useCheckMwMutation } = mwCheckApiSlice
