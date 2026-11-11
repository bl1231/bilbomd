import type { Store } from '@reduxjs/toolkit'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { axiosInstance, isAxiosError } from './axios'
import { refreshAccessToken } from './apiSlice'
import type { AppDispatch, RootState } from '../store'
import { selectCurrentToken } from '../../slices/authSlice'

// The app store, or the one from useStore() in a component
type TokenStore = Pick<Store<RootState>, 'getState' | 'dispatch'>

// GET for requests made outside RTK Query, which get no automatic token
// refresh. Access tokens live two minutes and a page that has stopped polling
// keeps a stale one, so the token is read at request time and a 403 (expired
// token) triggers one refresh and retry.
export const getWithFreshToken = async <T>(
  store: TokenStore,
  url: string,
  config: AxiosRequestConfig = {}
): Promise<AxiosResponse<T>> => {
  const request = () => {
    const token = selectCurrentToken(store.getState())
    return axiosInstance.get<T>(url, {
      ...config,
      headers: token
        ? { ...config.headers, Authorization: `Bearer ${token}` }
        : config.headers
    })
  }
  try {
    return await request()
  } catch (err) {
    const expired = isAxiosError(err) && err.response?.status === 403
    if (!expired || !(await refreshAccessToken(store.dispatch as AppDispatch)))
      throw err
    return request()
  }
}
