import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { Job, MultiJob, User } from '@bilbomd/mongodb-schema'

// connectDB() connects the worker's mongoose. The models come from
// @bilbomd/mongodb-schema, so they have to be registered on that same
// mongoose instance; with a second copy (e.g. a different peer-dependency
// variant of mongoose) every query buffers until it times out.
describe('mongoose instance', () => {
  it('the schema package registers its models on the worker mongoose', () => {
    for (const model of [Job, MultiJob, User]) {
      expect(model.base).toBe(mongoose)
    }
  })
})
