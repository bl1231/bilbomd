import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { apiSlice } from './api/apiSlice'
import { analyticsApi } from '../slices/analyticsApiSlice'
import { superfacilityApiSlice } from './api/sfapiSlice'
import authReducer from '../slices/authSlice'

const rootReducer = combineReducers({
  [apiSlice.reducerPath]: apiSlice.reducer,
  [analyticsApi.reducerPath]: analyticsApi.reducer,
  [superfacilityApiSlice.reducerPath]: superfacilityApiSlice.reducer,
  auth: authReducer
})

export const setupStore = (preloadedState?: Partial<RootState>) => {
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(
        apiSlice.middleware,
        analyticsApi.middleware,
        superfacilityApiSlice.middleware
      ),
    preloadedState,
    devTools: true
  })
}

export type RootState = ReturnType<typeof rootReducer>
export type AppStore = ReturnType<typeof setupStore>
export type AppDispatch = AppStore['dispatch']
