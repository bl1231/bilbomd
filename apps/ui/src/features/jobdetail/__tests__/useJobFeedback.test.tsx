import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { skipToken } from '@reduxjs/toolkit/query'
import { useJobFeedback } from '../useJobFeedback'
import { makeView } from './fixtures'
import { reportV2 } from 'features/analysis/__tests__/fixtures'

const usePublicFeedback = vi.fn()
vi.mock('slices/publicJobsApiSlice', () => ({
  useGetPublicFeedbackDataQuery: (...args: unknown[]) =>
    usePublicFeedback(...args)
}))

const owner = { kind: 'owner', id: 'job-1' } as const
const anon = { kind: 'public', token: 'tok' } as const

beforeEach(() => {
  usePublicFeedback.mockReset()
  usePublicFeedback.mockReturnValue({ data: undefined })
})

describe('useJobFeedback', () => {
  it('gives owners the report that came with the job', () => {
    const view = makeView({ feedback: reportV2 })
    const { result } = renderHook(() => useJobFeedback(owner, view))

    expect(result.current).toBe(reportV2)
    expect(usePublicFeedback).toHaveBeenCalledWith(skipToken)
  })

  it('fetches the report by token on a public page', () => {
    usePublicFeedback.mockReturnValue({ data: reportV2 })
    const { result } = renderHook(() => useJobFeedback(anon, makeView()))

    expect(usePublicFeedback).toHaveBeenCalledWith('tok')
    expect(result.current).toBe(reportV2)
  })

  it('asks for nothing until the job has completed', () => {
    const view = makeView({ status: 'Running', feedback: reportV2 })
    const { result } = renderHook(() => useJobFeedback(anon, view))

    expect(usePublicFeedback).toHaveBeenCalledWith(skipToken)
    expect(result.current).toBeUndefined()
  })

  it('asks for nothing for job types without the tab, or with no job', () => {
    renderHook(() => useJobFeedback(anon, makeView({ jobType: 'sans' })))
    renderHook(() => useJobFeedback(anon, undefined))

    expect(usePublicFeedback).toHaveBeenNthCalledWith(1, skipToken)
    expect(usePublicFeedback).toHaveBeenNthCalledWith(2, skipToken)
  })
})
