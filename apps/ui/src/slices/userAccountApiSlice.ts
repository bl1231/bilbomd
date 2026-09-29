import { apiSlice } from 'app/api/apiSlice'

interface EmailData {
  username: string
  currentEmail: string
  newEmail: string
}

interface OtpData {
  username: string
  currentEmail: string
  newEmail: string
  otp: string
}

export interface UserPreferences {
  emailNotifications: boolean
}

export const userAccountApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPreferences: builder.query<UserPreferences, void>({
      query: () => 'users/me/preferences',
      providesTags: [{ type: 'User', id: 'ME_PREFERENCES' }]
    }),
    updatePreferences: builder.mutation<UserPreferences, UserPreferences>({
      query: (preferences) => ({
        url: 'users/me/preferences',
        method: 'PATCH',
        body: preferences
      }),
      // Show the saved value right away; the refetch confirms it
      async onQueryStarted(preferences, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          userAccountApiSlice.util.updateQueryData(
            'getPreferences',
            undefined,
            (draft) => Object.assign(draft, preferences)
          )
        )
        try {
          await queryFulfilled
        } catch {
          patch.undo()
        }
      },
      invalidatesTags: [{ type: 'User', id: 'ME_PREFERENCES' }]
    }),
    updateEmail: builder.mutation<void, EmailData>({
      query: (emailData) => ({
        url: 'users/change-email',
        method: 'POST',
        body: emailData
      })
    }),
    verifyOtp: builder.mutation<void, OtpData>({
      query: (otpData) => ({
        url: '/users/verify-otp',
        method: 'POST',
        body: otpData
      })
    }),
    resendOtp: builder.mutation<void, EmailData>({
      query: (emailData) => ({
        url: '/users/resend-otp',
        method: 'POST',
        body: emailData
      })
    }),
    deleteUserByUserName: builder.mutation<void, string>({
      query: (username) => ({
        url: `users/delete-user-by-username/${username}`,
        method: 'DELETE'
      })
    })
  })
})

export const {
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  useUpdateEmailMutation,
  useVerifyOtpMutation,
  useResendOtpMutation,
  useDeleteUserByUserNameMutation
} = userAccountApiSlice
