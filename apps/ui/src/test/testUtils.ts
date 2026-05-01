import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { setupListeners } from '@reduxjs/toolkit/query'
import { apiSlice } from '../app/api/apiSlice'
import { superfacilityApiSlice } from '../app/api/sfapiSlice'
import authReducer from '../slices/authSlice'
import type { RootState, AppStore } from '../app/store'

const rootReducer = combineReducers({
  [apiSlice.reducerPath]: apiSlice.reducer,
  [superfacilityApiSlice.reducerPath]: superfacilityApiSlice.reducer,
  auth: authReducer
})

interface StoreRef {
  store: AppStore
  cleanup: () => void
}

/**
 * Test utility to set up a Redux store with RTK Query for testing API slices
 * @param preloadedState - Initial state for the store
 * @returns Object containing the configured store and cleanup function
 */
export const setupApiStore = (
  preloadedState?: Partial<RootState>
): StoreRef => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['api/executeQuery/fulfilled'],
          ignoredActionPaths: [
            'payload',
            'meta.baseQueryMeta',
            'meta.arg.originalArgs'
          ],
          ignoredPaths: ['api.queries']
        }
      }).concat(apiSlice.middleware, superfacilityApiSlice.middleware),
    preloadedState: {
      auth: { token: 'test-token' },
      ...preloadedState
    }
  }) as AppStore

  // Setup listeners for refetchOnFocus/refetchOnReconnect behaviors
  const cleanup = setupListeners(store.dispatch)

  return { store, cleanup }
}

/**
 * Creates a minimal mock JWT token for testing purposes
 * @param payload - The payload to encode in the JWT
 * @returns A mock JWT token string
 */
export const createTestJWT = (payload: unknown): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const encodedPayload = btoa(JSON.stringify(payload))
  const signature = 'mock-signature'

  return `${header}.${encodedPayload}.${signature}`
}

/**
 * Helper to create mock FormData for testing file uploads
 * @param data - Object with key-value pairs to add to FormData
 * @returns FormData instance with the provided data
 */
export const createMockFormData = (data: Record<string, unknown>): FormData => {
  const formData = new FormData()

  Object.entries(data).forEach(([key, value]) => {
    if (value instanceof File) {
      formData.append(key, value)
    } else if (typeof value === 'string') {
      formData.append(key, value)
    } else {
      formData.append(key, JSON.stringify(value))
    }
  })

  return formData
}

/**
 * Waits for RTK Query to finish pending operations
 * @param store - The Redux store
 * @param timeout - Maximum time to wait in milliseconds
 */
export const waitForApiState = async (
  store: AppStore,
  timeout = 1000
): Promise<void> => {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const state = store.getState()
    const apiState = state.api

    // Check if there are any pending queries
    const hasPendingQueries = Object.values(apiState?.queries || {}).some(
      (query) => (query as { status?: string })?.status === 'pending'
    )

    const hasPendingMutations = Object.values(apiState?.mutations || {}).some(
      (mutation) => (mutation as { status?: string })?.status === 'pending'
    )

    if (!hasPendingQueries && !hasPendingMutations) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  throw new Error(`API operations did not complete within ${timeout}ms`)
}
