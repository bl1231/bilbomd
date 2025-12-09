import { Schema } from 'mongoose'
import { ICHARMMParameters } from '../interfaces/charmmInterface'

const charmmParametersSchema = new Schema<ICHARMMParameters>({
  minimize: {
    max_iterations: { type: Number, min: 100, max: 10000 }
  },
  heating: {
    start_temp: { type: Number, min: 250, max: 350 },
    final_temp: { type: Number, min: 500, max: 1500 },
    nsteps: { type: Number, min: 1000, max: 50000 },
    timestep: { type: Number, min: 0.0001, max: 0.01 }
  },
  md: {
    temperature: { type: Number, min: 300, max: 1500 },
    friction: { type: Number, min: 0.01, max: 1.0 },
    nsteps: { type: Number, min: 1000, max: 10000000 },
    timestep: { type: Number, min: 0.0001, max: 0.01 },
    rgyr: { type: [Number], default: [] },
    k_rg: { type: Number, min: 1, max: 100 },
    pdb_report_interval: { type: Number, min: 100, max: 1000, default: 500 }
  }
})

export { charmmParametersSchema }
