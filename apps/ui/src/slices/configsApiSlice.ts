import { apiSlice } from 'app/api/apiSlice'

export interface ConfigLicense {
  status: 'valid' | 'missing' | 'invalid' | 'expired'
  licensee?: string
  expiresAt?: string
}

export interface ConfigResponse {
  useNersc?: string
  enableBilboMdAlphaFold?: string
  enableBilboMdOpenfold?: string
  enableCharmmEngine?: string
  orcidAuthEnabled?: string
  // Note: `license` (a ConfigLicense object) is intentionally not declared here —
  // it can't coexist with this string index signature. Read it via a cast.
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
