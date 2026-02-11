import { apiSlice } from 'app/api/apiSlice'
import { logOut, setCredentials } from 'slices/authSlice'

interface LoginCredentials {
  email?: string
  otp: string
}

interface AuthResponse {
  accessToken: string
}

interface OrcidSessionResponse {
  givenName: string
  familyName: string
  email: string
  orcidId: string
}

interface OrcidFinalizeRequest {
  givenName?: string
  familyName?: string
  email?: string
  orcidId?: string
  code?: string
  state?: string
}

export const authApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<AuthResponse, LoginCredentials>({
      query: (credentials) => ({
        url: '/auth/otp',
        method: 'POST',
        body: { ...credentials }
      })
    }),
    sendLogout: builder.mutation<void, unknown>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST'
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          dispatch(logOut())
          // Dave Gray suggests this timeout to give components time to unmount before resetting state
          setTimeout(() => {
            dispatch(apiSlice.util.resetApiState())
          }, 1000)
          console.log('Logout succeeded with response:', data)
        } catch (error) {
          console.log(error)
        }
      }
    }),
    refresh: builder.mutation<AuthResponse, unknown>({
      query: () => ({
        url: '/auth/refresh',
        method: 'GET'
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          //console.log(data)
          const { accessToken } = data
          dispatch(setCredentials({ accessToken }))
        } catch (error) {
          console.log(error)
        }
      }
    }),
    getOrcidSession: builder.query<OrcidSessionResponse, unknown>({
      query: () => ({
        url: '/auth/orcid/confirmation',
        method: 'GET'
      })
    }),
    finalizeOrcid: builder.mutation<void, OrcidFinalizeRequest>({
      query: (body) => ({
        url: '/auth/orcid/finalize',
        method: 'POST',
        body
      })
    })
  })
})

export const {
  useLoginMutation,
  useSendLogoutMutation,
  useRefreshMutation,
  useGetOrcidSessionQuery,
  useFinalizeOrcidMutation
} = authApiSlice
