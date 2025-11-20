import { Schema } from 'mongoose'

const jobSummarySchema = new Schema({
  ensemble_size: { type: Number, required: false },
  warnings: [{ type: String, required: false }],
  notes: [{ type: String, required: false }],
  version: { type: String, required: false }
})

// Optional: keep this separate so you can reuse / keep it tidy
const ensembleMemberSchema = new Schema(
  {
    pdb: { type: String, required: true },
    weight: { type: Number, required: false },
    rg: { type: Number, required: false }
  },
  { _id: false } // don’t need separate _id for each member
)

const classicResultsSchema = new Schema({
  // ensemble
  ensemble_size: { type: Number, required: false },
  ensemble_members: {
    type: [ensembleMemberSchema],
    required: false
  },

  // Rg statistics across MD
  rg_min: { type: Number, required: false },
  rg_max: { type: Number, required: false },
  rg_mean: { type: Number, required: false },
  rg_std: { type: Number, required: false },

  // Dmax if you’re computing it
  dmax_min: { type: Number, required: false },
  dmax_max: { type: Number, required: false },
  dmax_mean: { type: Number, required: false },

  // FoXS / MultiFoXS
  foxs_best_model_dat: { type: String, required: false },
  foxs_chi2_best_model: { type: Number, required: false },
  multifoxs_best_ensemble_dat: { type: String, required: false },
  multifoxs_chi2_best_ensemble: { type: Number, required: false },

  // bookkeeping / filenames
  ensemble_size_file: { type: String, required: false },
  foxs_results_json: { type: String, required: false },
  multifoxs_results_json: { type: String, required: false }
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
