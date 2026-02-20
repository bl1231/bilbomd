import { describe, it, expect } from 'vitest'
import authReducer, {
  setCredentials,
  logOut,
  selectCurrentToken
} from '../authSlice'

describe('authSlice', () => {
  const initialState = {
    token: null
  }

  describe('reducers', () => {
    describe('setCredentials', () => {
      it('should set access token', () => {
        const accessToken = 'test-access-token'
        const action = setCredentials({ accessToken })
        const newState = authReducer(initialState, action)

        expect(newState.token).toBe(accessToken)
      })

      it('should replace existing token', () => {
        const existingState = { token: 'old-token' }
        const newToken = 'new-token'
        const action = setCredentials({ accessToken: newToken })
        const newState = authReducer(existingState, action)

        expect(newState.token).toBe(newToken)
      })
    })

    describe('logOut', () => {
      it('should clear token', () => {
        const authenticatedState = { token: 'test-token' }
        const action = logOut()
        const newState = authReducer(authenticatedState, action)

        expect(newState.token).toBeNull()
      })

      it('should not error when already logged out', () => {
        const action = logOut()
        const newState = authReducer(initialState, action)

        expect(newState.token).toBeNull()
      })
    })
  })

  describe('selectors', () => {
    describe('selectCurrentToken', () => {
      it('should select token from state', () => {
        const state = { auth: { token: 'test-token' } }
        const token = selectCurrentToken(state)

        expect(token).toBe('test-token')
      })

      it('should return null when no token', () => {
        const state = { auth: { token: null } }
        const token = selectCurrentToken(state)

        expect(token).toBeNull()
      })
    })
  })

  describe('initial state', () => {
    it('should return initial state when undefined is passed', () => {
      const newState = authReducer(undefined, { type: 'unknown' })

      expect(newState).toEqual(initialState)
    })
  })
})
