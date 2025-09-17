import { IJob } from '../interfaces/jobInterface'

export const jobTypeDisplayNames: Record<IJob['__t'], string> = {
  BilboMd: 'BilboMD (Generic)',
  BilboMdPDB: 'BilboMD (PDB)',
  BilboMdCRD: 'BilboMD (CRD)',
  BilboMdAuto: 'BilboMD (Auto)',
  BilboMdScoper: 'Scoper',
  BilboMdAlphaFold: 'BilboMD (AlphaFold)',
  BilboMdSANS: 'BilboMD (SANS)'
}

// export { jobTypeDisplayNames }
