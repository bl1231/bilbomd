import { IJob } from '../interfaces/jobInterface'

export const jobTypeDisplayNames: Record<IJob['__t'], string> = {
  BilboMd: 'BilboMD (Generic)',
  BilboMdPDB: 'BilboMD (PDB)',
  BilboMdCRD: 'BilboMD (CRD)',
  BilboMdAuto: 'BilboMD (Auto)',
  BilboMdScoper: 'Scoper',
  BilboMdAlphaFold: 'BilboMD (AlphaFold)',
  BilboMdOpenFold: 'BilboMD (OpenFold3)',
  BilboMdSANS: 'BilboMD (SANS)'
}

// export { jobTypeDisplayNames }
