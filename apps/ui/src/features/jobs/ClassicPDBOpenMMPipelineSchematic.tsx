import PipelineSchematicBase, {
  PipelineStep
} from 'features/shared/PipelineSchematicBase'

const ROW0: PipelineStep[] = [
  { lines: ['*.pdb / *.cif', ' const.inp', 'SAXS *.dat'], color: 'blue' },
  { lines: ['OpenMM', 'Minimize'], color: 'green' },
  { lines: ['OpenMM', 'Heat'], color: 'green' },
  { lines: ['OpenMM', 'Coarse Grained MD'], color: 'green' },
  { lines: ['Extract PDB', 'from Trajectories'], color: 'blue' }
]

const ROW1: PipelineStep[] = [
  { lines: ['FoXS'], color: 'purple' },
  { lines: ['MultiFoXS'], color: 'purple' },
  { lines: ['Gather Results'], color: 'blue' },
  { lines: ['Notify'], color: 'blue' }
]

const ClassicPDBOpenMMPipelineSchematic = () => (
  <PipelineSchematicBase
    row0={ROW0}
    row1={ROW1}
    ariaLabel="BilboMD Classic PDB pipeline schematic"
  />
)

export default ClassicPDBOpenMMPipelineSchematic
