import { Schema } from 'mongoose'

import { IOpenMMParameters } from '../interfaces/openmmInterface'

const openmmParametersSchema = new Schema<IOpenMMParameters>({
  minimize: {
    max_iterations: { type: Number, min: 100, max: 10000, default: 1000 }
  },
  heating: {
    start_temp: { type: Number, min: 250, max: 350, default: 300 },
    final_temp: { type: Number, min: 500, max: 1500, default: 600 },
    nsteps: { type: Number, min: 1000, max: 50000, default: 10000 },
    timestep: { type: Number, min: 0.0001, max: 0.01, default: 0.001 }
  },
  md: {
    temperature: { type: Number, min: 300, max: 1500, default: 600 },
    friction: { type: Number, min: 0.01, max: 1.0, default: 0.1 },
    nsteps: { type: Number, min: 1000, max: 10000000, default: 300000 },
    timestep: { type: Number, min: 0.0001, max: 0.01, default: 0.001 },
    rgyr: { type: [Number], default: [] },
    k_rg: { type: Number, min: 1, max: 100, default: 10 },
    rg_report_interval: { type: Number, min: 100, max: 1000, default: 500 },
    pdb_report_interval: { type: Number, min: 100, max: 1000, default: 500 }
  }
})

export { openmmParametersSchema }
