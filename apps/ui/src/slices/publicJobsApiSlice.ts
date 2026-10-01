import { apiSlice } from 'app/api/apiSlice'
import type {
  PublicJobStatus,
  AnonJobResponse,
  JobAssetsDTO
} from '@bilbomd/bilbomd-types'
import type { IFeedbackData } from '@bilbomd/mongodb-schema/frontend'
import type { FoxsData } from 'types/foxs'
import { revokeObjectUrlOnRemove } from 'utils/objectUrl'

type PublicResultFileParams = { publicId: string; filename: string }
type EnsemblePdbFilesResponse = { ensemblePdbFiles: string[] }

export const publicJobsApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    addNewPublicJob: builder.mutation<AnonJobResponse, FormData>({
      query: (formData) => ({
        url: '/public/jobs',
        method: 'POST',
        body: formData
      })
    }),
    addNewPublicSANSJob: builder.mutation<AnonJobResponse, FormData>({
      query: (formData) => ({
        url: '/public/jobs/sans',
        method: 'POST',
        body: formData
      })
    }),
    getPublicJobById: builder.query<PublicJobStatus, string>({
      query: (publicId) => `/public/jobs/${publicId}`,
      providesTags: (_, __, publicId) => [{ type: 'PublicJob', id: publicId }]
    }),
    getPublicFoxsData: builder.query<FoxsData[], string>({
      query: (publicId) => `/public/jobs/${publicId}/results/foxs`
    }),
    getPublicFeedbackData: builder.query<IFeedbackData, string>({
      query: (publicId) => `/public/jobs/${publicId}/results/feedback`
    }),
    getPublicResultFile: builder.query<Blob, PublicResultFileParams>({
      query: ({ publicId, filename }) => ({
        url: `/public/jobs/${publicId}/results/${filename}`,
        responseHandler: (response) => response.blob()
      })
    }),
    getPublicResultFileJson: builder.query<
      EnsemblePdbFilesResponse,
      PublicResultFileParams
    >({
      query: ({ publicId, filename }) => ({
        url: `/public/jobs/${publicId}/results/${filename}`,
        responseHandler: (response) => response.json()
      })
    }),
    getPublicResultFileText: builder.query<string, PublicResultFileParams>({
      query: ({ publicId, filename }) => ({
        url: `/public/jobs/${publicId}/results/${filename}`,
        responseHandler: (response) => response.text()
      })
    }),
    // A result image as an object URL, for use as an <img> src
    getPublicJobImage: builder.query<string, PublicResultFileParams>({
      query: ({ publicId, filename }) => ({
        url: `/public/jobs/${publicId}/results/${filename}`,
        responseHandler: (response) => response.blob()
      }),
      transformResponse: (blob: Blob) => URL.createObjectURL(blob),
      onCacheEntryAdded: revokeObjectUrlOnRemove
    }),
    getPublicMDMovies: builder.query<JobAssetsDTO, string>({
      query: (publicId) => `/public/jobs/${publicId}/movies`,
      providesTags: (_, __, publicId) => [
        { type: 'PublicMovieAsset', id: publicId }
      ]
    })
  })
})

export const {
  useAddNewPublicJobMutation,
  useAddNewPublicSANSJobMutation,
  useGetPublicJobByIdQuery,
  useGetPublicFoxsDataQuery,
  useGetPublicFeedbackDataQuery,
  useGetPublicResultFileQuery,
  useGetPublicResultFileJsonQuery,
  useGetPublicResultFileTextQuery,
  useGetPublicJobImageQuery,
  useGetPublicMDMoviesQuery
} = publicJobsApiSlice
