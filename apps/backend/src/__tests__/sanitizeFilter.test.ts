import { describe, it, expect } from 'vitest'
import mongoose, { Model } from 'mongoose'
import { User, Job, JobStatus } from '@bilbomd/mongodb-schema'

// Reproduce mongoose's query-time `sanitizeFilter` + schema casting WITHOUT a
// DB connection. This is the exact path that turned user registration into a
// 500: with `sanitizeFilter` enabled globally (app.ts), mongoose wraps any
// `{ $op: ... }` filter value in `{ $eq: ... }` to neutralize operator
// injection, which then fails to cast against the field's type. The escape
// hatch for developer-built (non-user) operators is `mongoose.trusted()`.
//
// Returns the CastError if the filter is rejected, else null.
const filterCastError = <T>(
  model: Model<T>,
  filter: Record<string, unknown>
): Error | null => {
  const query = model.find(filter as never, null, {
    sanitizeFilter: true
  })
  ;(query as unknown as { _castConditions: () => void })._castConditions()
  return (query as unknown as { error: () => Error | null }).error() ?? null
}

describe('sanitizeFilter operator-query regressions', () => {
  describe('registerController previous-email lookup (User.previousEmails: [String])', () => {
    it('casts cleanly when matching the array field against a scalar (the fix)', () => {
      expect(
        filterCastError(User, { previousEmails: 'scott@example.com' })
      ).toBeNull()
    })

    it('casts cleanly when an operator is explicitly mongoose.trusted()', () => {
      expect(
        filterCastError(User, {
          previousEmails: mongoose.trusted({ $in: ['scott@example.com'] })
        })
      ).toBeNull()
    })

    it('REGRESSION: a bare { $in: [...] } is mangled by sanitizeFilter and fails to cast', () => {
      expect(
        filterCastError(User, {
          previousEmails: { $in: ['scott@example.com'] }
        })
      ).toBeInstanceOf(mongoose.Error.CastError)
    })
  })

  describe('anonymous job-quota status filter (Job.status: String enum)', () => {
    const activeStatuses = [
      JobStatus.Submitted,
      JobStatus.Pending,
      JobStatus.Running
    ]

    it('casts cleanly with mongoose.trusted({ $in })', () => {
      expect(
        filterCastError(Job, {
          status: mongoose.trusted({ $in: activeStatuses })
        })
      ).toBeNull()
    })

    it('REGRESSION: a bare { $in: [...] } fails to cast under sanitizeFilter', () => {
      expect(
        filterCastError(Job, { status: { $in: activeStatuses } })
      ).toBeInstanceOf(mongoose.Error.CastError)
    })
  })

  describe('jobCleaner age filter (Job.createdAt: Date)', () => {
    const threshold = new Date('2026-01-01T00:00:00Z')

    it('casts cleanly with mongoose.trusted({ $lt })', () => {
      expect(
        filterCastError(Job, {
          createdAt: mongoose.trusted({ $lt: threshold })
        })
      ).toBeNull()
    })

    it('REGRESSION: a bare { $lt: date } fails to cast under sanitizeFilter', () => {
      expect(
        filterCastError(Job, { createdAt: { $lt: threshold } })
      ).toBeInstanceOf(mongoose.Error.CastError)
    })
  })
})
