import { describe, it, expect } from 'vitest'
import { getSubmitError } from '../submitError'

describe('getSubmitError', () => {
  it('returns the message and per-field details from a validation error', () => {
    const error = {
      status: 400,
      data: {
        message: 'Validation failed',
        errors: [
          {
            path: 'dat_file',
            message:
              'SAXS data File contains 64 valid lines out of 64. We require at least 100 valid SAXS data lines with q, I(q), and error.'
          },
          { path: 'rg_min', message: 'Rg min is required' }
        ]
      }
    }
    expect(getSubmitError(error)).toEqual({
      message: 'Validation failed',
      details: [
        'SAXS data File contains 64 valid lines out of 64. We require at least 100 valid SAXS data lines with q, I(q), and error.',
        'Rg min is required'
      ]
    })
  })

  it('returns the message with no details when errors is absent', () => {
    expect(
      getSubmitError({ status: 500, data: { message: 'Queue unavailable' } })
    ).toEqual({ message: 'Queue unavailable', details: [] })
  })

  it('drops malformed and duplicate entries in errors', () => {
    const error = {
      data: {
        message: 'Validation failed',
        errors: [
          { path: 'a', message: 'Same problem' },
          { path: 'b', message: 'Same problem' },
          { path: 'c' },
          { path: 'd', message: '   ' },
          null,
          'not an object',
          { path: 'e', message: 42 }
        ]
      }
    }
    expect(getSubmitError(error).details).toEqual(['Same problem'])
  })

  it('falls back to the default message for non-API errors', () => {
    expect(getSubmitError(new Error('boom'))).toEqual({
      message: 'An error occurred during submission.',
      details: []
    })
    expect(getSubmitError(undefined).message).toBe(
      'An error occurred during submission.'
    )
    expect(
      getSubmitError({ status: 'FETCH_ERROR', error: 'TypeError' }).message
    ).toBe('An error occurred during submission.')
  })

  it('uses a custom fallback when the body has no usable message', () => {
    expect(
      getSubmitError({ data: { message: '' } }, 'Could not submit job')
    ).toEqual({ message: 'Could not submit job', details: [] })
    expect(getSubmitError({ data: 'Bad Gateway' }, 'Try again').message).toBe(
      'Try again'
    )
  })
})
