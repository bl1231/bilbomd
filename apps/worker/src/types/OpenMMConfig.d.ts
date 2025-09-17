// types/OpenMMConfig.d.ts

interface ResidueRange {
  start: number
  stop: number
}

interface BodyBase {
  /** Arbitrary label, e.g. "FixedBody1" */
  name: string
  /** Single-letter chain identifier, e.g. "A" */
  chain_id: string
  residues: ResidueRange
}

type FixedBody = BodyBase
type RigidBody = BodyBase

interface Constraints {
  fixed_bodies?: FixedBody[]
  rigid_bodies?: RigidBody[]
}

interface MinimizationParameters {
  /** Max iterations for OpenMM local energy minimization */
  max_iterations: number
}

interface MinimizationStep {
  parameters: MinimizationParameters
  /** Output PDB filename for minimized structure */
  output_pdb: string
}

interface HeatingParameters {
  /** Starting temperature (K) */
  first_temp: number
  /** Final temperature (K) */
  final_temp: number
  /** Total integrator steps */
  total_steps: number
  /** Timestep (ps) */
  timestep: number
}

interface HeatingStep {
  parameters: HeatingParameters
  /** Output PDB after heating */
  output_pdb: string
  /** Serialized OpenMM state/system/integrator (e.g., XML) */
  output_restart: string
}

interface MDParameters {
  /** Thermostat temperature (K) */
  temperature: number
  /** Langevin friction coefficient (1/ps) */
  friction: number
  /** Number of MD steps */
  nsteps: number
  /** Timestep (ps) */
  timestep: number
}

interface RgyrOptions {
  /** Radius-of-gyration targets/centers to explore */
  rgs: number[]
  /** Force constant for Rg restraint (kJ/mol/nm^2) */
  k_rg: number
  /** How often to report (in steps) */
  report_interval: number
  /** CSV filename for Rg reporting */
  filename: string
}

interface MDStep {
  parameters: MDParameters
  /** Optional Rg restraint/monitoring settings */
  rgyr?: RgyrOptions
  /** Final PDB from MD */
  output_pdb: string
  /** Restart/state file after MD */
  output_restart: string
  /** Trajectory file */
  output_dcd: string
  /** Write a single PDB file every N steps (e.g., for visualization) */
  pdb_report_interval: number
}

interface Steps {
  minimization: MinimizationStep
  heating: HeatingStep
  md: MDStep
}

interface InputConfig {
  /** Directory containing inputs (relative or absolute) */
  dir: string
  /** PDB filename (relative to dir or absolute) */
  pdb_file: string
  /** OpenMM ForceField XMLs in load order */
  forcefield: string[]
}

interface OutputConfig {
  /** Base output directory */
  output_dir: string
  /** Subdir for minimization artifacts */
  min_dir: string
  /** Subdir for heating artifacts */
  heat_dir: string
  /** Subdir for MD artifacts */
  md_dir: string
}

interface OpenMMConfig {
  input: InputConfig
  output: OutputConfig
  constraints?: Constraints
  steps?: Steps
}
