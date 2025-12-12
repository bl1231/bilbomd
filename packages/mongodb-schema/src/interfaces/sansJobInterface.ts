import { IJob } from './jobInterface.js'

interface IDeurerationFraction {
  label: string
  fraction: number
}

interface IBilboMDSANSJob extends IJob {
  __t: 'BilboMdSANS'
  pdb_file: string
  psf_file?: string
  crd_file?: string
  const_inp_file: string
  conformational_sampling: number
  d2o_fraction: number
  rg: number
  rg_min: number
  rg_max: number
  deuteration_fractions: IDeurerationFraction[]
}

export { IBilboMDSANSJob }
