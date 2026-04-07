import { createEntityAdapter, type EntityState } from '@reduxjs/toolkit'
import { apiSlice } from 'app/api/apiSlice'
import type {
  UserDTO,
  CreateUserDTO,
  UpdateUserDTO
} from '@bilbomd/bilbomd-types'

type NormalizedUser = UserDTO

interface APITokenInfo {
  _id?: string
  id?: string
  tokenHash?: string
  label: string
  createdAt: string | Date
  expiresAt?: string | Date
  token?: string
}

interface APITokensResponse {
  tokens: APITokenInfo[]
}

interface CreateAPITokenRequest {
  username: string
  label: string
  expiresAt?: string
}

interface DeleteAPITokenRequest {
  username: string
  id: string
}

const usersAdapter = createEntityAdapter<NormalizedUser>()

const initialState = usersAdapter.getInitialState()

export const usersApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<EntityState<NormalizedUser, string>, unknown>({
      query: () => ({
        url: '/users',
        method: 'GET',
        validateStatus: (response, result) => {
          return response.status === 200 && !result.isError
        }
      }),
      transformResponse: (responseData: {
        success: boolean
        data: Array<{
          _id: string
          username: string
          email: string
          roles: string[]
          firstName?: string | null
          lastName?: string | null
          active?: boolean
          isActive?: boolean
          createdAt: string | Date
          updatedAt: string | Date
          UUID?: string
          [key: string]: unknown
        }>
      }) => {
        const loadedUsers: NormalizedUser[] = responseData.data.map((user) => ({
          id: String(user._id),
          username: user.username,
          email: user.email,
          roles: user.roles as UserDTO['roles'],
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          active:
            (typeof user.active === 'boolean'
              ? user.active
              : (user as { isActive?: boolean }).isActive) ?? false,
          createdAt:
            typeof user.createdAt === 'string'
              ? user.createdAt
              : user.createdAt.toISOString(),
          updatedAt:
            typeof user.updatedAt === 'string'
              ? user.updatedAt
              : user.updatedAt.toISOString(),
          UUID: user.UUID
        }))
        return usersAdapter.setAll(initialState, loadedUsers)
      },
      transformErrorResponse: (response: { status: string | number }) => {
        return response.status
      },
      providesTags: (result) =>
        result?.ids
          ? [
              { type: 'User', id: 'LIST' },
              ...result.ids.map((id) => ({ type: 'User' as const, id }))
            ]
          : [{ type: 'User', id: 'LIST' }]
    }),
    addNewUser: builder.mutation<UserDTO, CreateUserDTO>({
      query: (initialUserData) => ({
        url: '/users',
        method: 'POST',
        body: {
          ...initialUserData
        }
      }),
      invalidatesTags: [{ type: 'User', id: 'LIST' }]
    }),
    updateUser: builder.mutation<UserDTO, UpdateUserDTO>({
      query: (initialUserData) => ({
        url: '/users',
        method: 'PATCH',
        body: {
          ...initialUserData
        }
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'User', id: arg.id }]
    }),
    deleteUser: builder.mutation<void, { id: string }>({
      query: ({ id }) => ({
        url: `/users/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'User', id: arg.id }]
    }),
    getAPITokens: builder.query<APITokensResponse, string>({
      query: (username) => ({
        url: `/users/${username}/tokens`,
        method: 'GET'
      }),
      providesTags: (_result, _error, username) => [
        { type: 'Token', id: username }
      ]
    }),
    createAPIToken: builder.mutation<APITokenInfo, CreateAPITokenRequest>({
      query: ({ username, label, expiresAt }) => ({
        url: `/users/${username}/tokens`,
        method: 'POST',
        body: { label, expiresAt }
      }),
      invalidatesTags: (_result, _error, { username }) => [
        { type: 'Token', id: username }
      ]
    }),
    deleteAPIToken: builder.mutation<void, DeleteAPITokenRequest>({
      query: ({ username, id }) => ({
        url: `/users/${username}/tokens/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: (_result, _error, { username }) => [
        { type: 'Token', id: username }
      ]
    })
  })
})

export const {
  useGetUsersQuery,
  useAddNewUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useGetAPITokensQuery,
  useCreateAPITokenMutation,
  useDeleteAPITokenMutation
} = usersApiSlice

// returns the query result object
export const selectUsersResult =
  usersApiSlice.endpoints.getUsers.select('usersList')

import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from 'app/store'

const selectUsersData = createSelector(
  selectUsersResult,
  (usersResult) => usersResult.data ?? initialState
)

export const {
  selectAll: selectAllUsers,
  selectById: selectUserById,
  selectIds: selectUserIds
} = usersAdapter.getSelectors<RootState>((state) => selectUsersData(state))
