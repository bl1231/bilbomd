import { Job as BullMQJob } from 'bullmq'

type Params = {
  out_dir: string
}

type PaeParams = Params & {
  in_crd: string
  in_pae: string
}

type CharmmParams = Params & {
  charmm_template: string
  charmm_topo_dir: string
  charmm_inp_file: string
  charmm_out_file: string
  in_psf_file: string
  in_crd_file: string
}

type CharmmHeatParams = CharmmParams & {
  constinp: string
}

type CharmmMDParams = CharmmParams & {
  constinp: string
  rg_min: number
  rg_max: number
  rg: number
  timestep: number
  conf_sample: number
  inp_basename: string
}

type CharmmDCD2PDBParams = CharmmParams & {
  inp_basename: string
  foxs_rg?: string
  pepsisans_rg?: string
  in_dcd: string
  run: string
}

type FoxsParams = Params & {
  foxs_rg: string
  rg_min: number
  rg_max: number
  conf_sample: number
}

type MultiFoxsParams = Params & {
  data_file: string
}

interface FileCopyParams {
  source: string
  destination: string
  filename: string
  MQjob: BullMQJob
  isCritical: boolean
}

interface FileCopyParamsNew {
  source: string
  destination: string
  filename: string
  isCritical: boolean
}
