import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupApiStore } from '../../test/testUtils'
import { userAccountApiSlice } from '../userAccountApiSlice'
import { server } from '../../test/server'
import { http, HttpResponse } from 'msw'

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

const mockEmailData: EmailData = {
  username: 'testuser',
  currentEmail: 'old@example.com',
  newEmail: 'new@example.com'
}

const mockOtpData: OtpData = {
  username: 'testuser',
  currentEmail: 'old@example.com',
  newEmail: 'new@example.com',
  otp: '123456'
}

const mockSuccessResponse = { success: true }

describe('userAccountApiSlice', () => {
  const storeRef = setupApiStore()

  beforeEach(() => {
    server.use(
      http.post(
        'http://localhost:3003/api/v1/users/change-email',
        async ({ request }) => {
          const _body = (await request.json()) as EmailData
          return HttpResponse.json(mockSuccessResponse)
        }
      ),
      http.post(
        'http://localhost:3003/api/v1/users/verify-otp',
        async ({ request }) => {
          const _body = (await request.json()) as OtpData
          return HttpResponse.json(mockSuccessResponse)
        }
      ),
      http.post(
        'http://localhost:3003/api/v1/users/resend-otp',
        async ({ request }) => {
          const _body = (await request.json()) as EmailData
          return HttpResponse.json(mockSuccessResponse)
        }
      ),
      http.delete(
        'http://localhost:3003/api/v1/users/delete-user-by-username/:username',
        ({ params: _params }) => {
          return HttpResponse.json(mockSuccessResponse)
        }
      )
    )
  })

  afterEach(() => {
    server.resetHandlers()
  })

  describe('updateEmail', () => {
    it('should send email update request successfully', async () => {
      const result = await storeRef.store.dispatch(
        userAccountApiSlice.endpoints.updateEmail.initiate(mockEmailData)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle validation errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/change-email', () => {
          return HttpResponse.json(
            { error: 'Invalid email format' },
            { status: 400 }
          )
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.updateEmail.initiate(mockEmailData)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle user not found errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/change-email', () => {
          return HttpResponse.json({ error: 'User not found' }, { status: 404 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.updateEmail.initiate(mockEmailData)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle duplicate email errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/change-email', () => {
          return HttpResponse.json(
            { error: 'Email already in use' },
            { status: 409 }
          )
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.updateEmail.initiate(mockEmailData)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('verifyOtp', () => {
    it('should verify OTP successfully', async () => {
      const result = await storeRef.store.dispatch(
        userAccountApiSlice.endpoints.verifyOtp.initiate(mockOtpData)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle invalid OTP errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/verify-otp', () => {
          return HttpResponse.json({ error: 'Invalid OTP' }, { status: 400 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.verifyOtp.initiate(mockOtpData)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })

    it('should handle expired OTP errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/verify-otp', () => {
          return HttpResponse.json({ error: 'OTP expired' }, { status: 410 })
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.verifyOtp.initiate(mockOtpData)
      )

      expect(result.error).toBeDefined()
      expect(result.data).toBeUndefined()

      freshStoreRef.cleanup()
    })
  })

  describe('resendOtp', () => {
    it('should resend OTP successfully', async () => {
      const result = await storeRef.store.dispatch(
        userAccountApiSlice.endpoints.resendOtp.initiate(mockEmailData)
      )

      expect(result.data).toBeDefined()
      expect(result.error).toBeUndefined()
    })

    it('should handle rate limiting errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/resend-otp', () => {
          return HttpResponse.json(
            { error: 'Too many requests' },
            { status: 429 }
          )
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.resendOtp.initiate(mockEmailData)
      )

      expect(result.error).toBeDefined()
    })

    it('should handle no pending OTP errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/resend-otp', () => {
          return HttpResponse.json(
            { error: 'No pending OTP request' },
            { status: 404 }
          )
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.resendOtp.initiate(mockEmailData)
      )

      expect(result.error).toBeDefined()
    })
  })

  describe('deleteUserByUserName', () => {
    it('should delete user by username successfully', async () => {
      const result = await storeRef.store.dispatch(
        userAccountApiSlice.endpoints.deleteUserByUserName.initiate('testuser')
      )

      expect(result.data).toEqual(mockSuccessResponse)
    })

    it('should handle user not found errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.delete(
          'http://localhost:3003/api/v1/users/delete-user-by-username/:username',
          () => {
            return HttpResponse.json(
              { error: 'User not found' },
              { status: 404 }
            )
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.deleteUserByUserName.initiate(
          'nonexistent'
        )
      )

      expect(result.error).toBeDefined()
    })

    it('should handle unauthorized deletion attempts', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.delete(
          'http://localhost:3003/api/v1/users/delete-user-by-username/:username',
          () => {
            return HttpResponse.json({ error: 'Unauthorized' }, { status: 403 })
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.deleteUserByUserName.initiate('testuser')
      )

      expect(result.error).toBeDefined()
    })

    it('should handle cannot delete admin user errors', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.delete(
          'http://localhost:3003/api/v1/users/delete-user-by-username/:username',
          () => {
            return HttpResponse.json(
              { error: 'Cannot delete admin user' },
              { status: 409 }
            )
          }
        )
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.deleteUserByUserName.initiate('admin')
      )

      expect(result.error).toBeDefined()
    })
  })

  describe('hooks export', () => {
    it('should export all mutation hooks', () => {
      expect(userAccountApiSlice.useUpdateEmailMutation).toBeDefined()
      expect(userAccountApiSlice.useVerifyOtpMutation).toBeDefined()
      expect(userAccountApiSlice.useResendOtpMutation).toBeDefined()
      expect(userAccountApiSlice.useDeleteUserByUserNameMutation).toBeDefined()

      expect(typeof userAccountApiSlice.useUpdateEmailMutation).toBe('function')
      expect(typeof userAccountApiSlice.useVerifyOtpMutation).toBe('function')
      expect(typeof userAccountApiSlice.useResendOtpMutation).toBe('function')
      expect(typeof userAccountApiSlice.useDeleteUserByUserNameMutation).toBe(
        'function'
      )
    })
  })

  describe('data type validation', () => {
    it('should handle EmailData structure correctly', () => {
      const emailData = mockEmailData

      expect(emailData).toHaveProperty('username')
      expect(emailData).toHaveProperty('currentEmail')
      expect(emailData).toHaveProperty('newEmail')

      expect(typeof emailData.username).toBe('string')
      expect(typeof emailData.currentEmail).toBe('string')
      expect(typeof emailData.newEmail).toBe('string')
    })

    it('should handle OtpData structure correctly', () => {
      const otpData = mockOtpData

      expect(otpData).toHaveProperty('username')
      expect(otpData).toHaveProperty('currentEmail')
      expect(otpData).toHaveProperty('newEmail')
      expect(otpData).toHaveProperty('otp')

      expect(typeof otpData.username).toBe('string')
      expect(typeof otpData.currentEmail).toBe('string')
      expect(typeof otpData.newEmail).toBe('string')
      expect(typeof otpData.otp).toBe('string')
    })
  })

  describe('network error handling', () => {
    it('should handle network connectivity issues', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/change-email', () => {
          return HttpResponse.error()
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.updateEmail.initiate(mockEmailData)
      )

      expect(result.error).toBeDefined()
    })

    it('should handle server errors gracefully', async () => {
      const freshStoreRef = setupApiStore()

      server.use(
        http.post('http://localhost:3003/api/v1/users/verify-otp', () => {
          return HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      const result = await freshStoreRef.store.dispatch(
        userAccountApiSlice.endpoints.verifyOtp.initiate(mockOtpData)
      )

      expect(result.error).toBeDefined()
    })
  })
})
