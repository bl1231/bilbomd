// Authoritative list of residues and ions that BilboMD's PDB validation accepts.
// This is the single source of truth shared by the frontend and backend.
// When pdb2crd.py gains support for a new residue, add it here only.

export const PROTEIN_RESIDUES = new Set<string>([
  // Standard amino acids
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS',
  'ILE', 'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
  // Phosphorylated amino acids — renamed to standard residue + CHARMM patch by pdb2crd.py
  'SEP', 'TPO', 'PTR',
  // CHARMM internal HIS variant — may appear in PDB files previously processed by CHARMM
  'HSD',
])

export const DNA_RESIDUES = new Set<string>([
  // Standard PDB DNA nucleotides
  'DA', 'DC', 'DG', 'DT', 'DI',
])

export const RNA_RESIDUES = new Set<string>([
  // Standard PDB RNA nucleotides
  'A', 'C', 'G', 'U', 'I',
])

export const CARBOHYDRATE_RESIDUES = new Set<string>([
  // Carbohydrates (backend-authoritative: union of pdb_utils.py + pdb2crd.py rename map)
  'AFL', 'ALL', 'ALT', 'BMA', 'BGC', 'BOG', 'FCA', 'FCB', 'FMF',
  'FUC', 'FUL', 'G4S', 'GAL', 'GLA', 'GLB', 'GLC', 'GLS', 'GSA',
  'GUL', 'IDO', 'LAK', 'LAT', 'MAF', 'MAL', 'MAN', 'NAG', 'NAN',
  'NGA', 'RHM', 'RIB', 'SIA', 'SLB', 'TAL', 'XYL',
  // GLYCAM carbohydrate residues
  'AMA', 'BGL',
])

// Organic cofactors parameterized via GAFF2 by openmmforcefields at runtime.
// model_prep.py downloads their SDF from RCSB and registers GAFF2 templates.
export const GAFF_COFACTORS = new Set<string>([
  // Flavin cofactors
  'FAD', 'FMN', 'RBF',
  // Nicotinamide cofactors
  'NAD', 'NAP', 'NDP',
  // Pyridoxal phosphate
  'PLP', 'PMP',
  // Thiamine
  'TPP', 'TDP',
  // Coenzyme A
  'COA', 'ACO',
  // Modified amino acid — pyroglutamate (N-terminal glutamine cyclisation)
  'PCA',
  // ATP / ADP / AMP
  'ATP', 'ADP', 'AMP',
  // Other common cofactors
  'SAH', 'SAM', 'HBI',
])

// Metal-containing cofactors excluded from the GAFF2 path (model_prep.py
// _has_metal_atoms check). These are still removed before OpenMM MD.
export const METAL_COFACTORS = new Set<string>([
  // Heme / porphyrins (contain Fe)
  'HEM', 'HEC', 'HEA', 'HEB',
])

export const SUPPORTED_PDB_RESIDUES = new Set<string>([
  ...PROTEIN_RESIDUES,
  ...DNA_RESIDUES,
  ...RNA_RESIDUES,
  // Nucleotide aliases recognised by pdb_utils (post-rename CHARMM names)
  'ADE', 'CYT', 'GUA', 'THY',
  ...CARBOHYDRATE_RESIDUES,
  // Cofactors handled before OpenMM MD — allowed through validation
  ...GAFF_COFACTORS,
  ...METAL_COFACTORS,
  // Water — removed by pdb2crd.py, not an error
  'HOH',
  // Common ions — passed through or stripped without error
  'LI', 'NA', 'K', 'RB', 'CS',
  'MG', 'CA', 'SR', 'BA',
  'SC', 'TI', 'V', 'CR', 'MN', 'FE', 'CO', 'NI', 'CU', 'ZN', 'MO', 'CD', 'HG',
  'AL', 'GA', 'IN', 'SN', 'PB',
  'B', 'SE', 'AS',
  'CL', 'BR', 'F',
  'SO4', 'PO4', 'NO3', 'CN',
])
