import { apiSlice } from 'app/api/apiSlice'

export interface ConfigResponse {
  useNersc?: string
  enableBilboMdAlphaFold?: string
  enableBilboMdOpenfold?: string
  enableCharmmEngine?: string
  [key: string]: string | undefined
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
