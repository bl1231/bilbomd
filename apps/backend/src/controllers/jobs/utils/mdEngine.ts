// OpenMM is the default MD engine for every pipeline that offers a choice.
// CHARMM runs only when a request names it. Classic CRD jobs are CHARMM-only
// and parse their own engine.

type MDEngine = 'CHARMM' | 'OpenMM'

const parseMdEngine = (raw: unknown): MDEngine =>
  String(raw ?? '')
    .trim()
    .toLowerCase() === 'charmm'
    ? 'CHARMM'
    : 'OpenMM'

export { parseMdEngine }
export type { MDEngine }
