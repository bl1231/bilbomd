import { apiSlice } from 'app/api/apiSlice'

interface ConfigResponse {
  useNersc?: string
  enableAlphaFold?: string
  [key: string]: unknown
}

export const configApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getConfigs: builder.query<ConfigResponse, unknown>({
      query: () => ({
        url: '/configs',
        method: 'GET'
      }),
      providesTags: ['Config']
    })
  })
})

export const { useGetConfigsQuery } = configApiSlice
