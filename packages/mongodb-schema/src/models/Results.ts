import { Schema } from 'mongoose'

const jobSummarySchema = new Schema({
  ensemble_size: { type: Number, required: false },
  warnings: [{ type: String, required: false }],
  notes: [{ type: String, required: false }],
  version: { type: String, required: false }
})

const ensembleMemberSchema = new Schema(
  {
    pdb: { type: String, required: true },
    weight: { type: Number, required: false },
    rg: { type: Number, required: false },
    weight_avg: { type: Number, required: false },
    weight_stddev: { type: Number, required: false },
    fraction: { type: Number, required: false }
  },
  { _id: false }
)

const ensembleModelSchema = new Schema(
  {
    rank: { type: Number, required: true },
    chi2: { type: Number, required: true },
    c1: { type: Number, required: true },
    c2: { type: Number, required: true },
    states: { type: [ensembleMemberSchema], required: true }
  },
  { _id: false } // don’t need separate _id for each model
)

const ensembleSchema = new Schema(
  {
    size: { type: Number, required: true },
    models: { type: [ensembleModelSchema], required: true }
  },
  { _id: false } // don’t need separate _id for each ensemble
)

const classicResultsSchema = new Schema({
  total_num_ensembles: { type: Number, required: false },
  ensembles: { type: [ensembleSchema], required: false }
})

const scoperResultsSchema = new Schema({
  foxs_top_file: { type: String, required: false }
})

export const resultsSchema = new Schema({
  summary: { type: jobSummarySchema, required: false },
  classic: { type: classicResultsSchema, required: false },
  auto: { type: Schema.Types.Mixed, required: false },
  alphafold: { type: Schema.Types.Mixed, required: false },
  sans: { type: Schema.Types.Mixed, required: false },
  scoper: { type: scoperResultsSchema, required: false }
})
