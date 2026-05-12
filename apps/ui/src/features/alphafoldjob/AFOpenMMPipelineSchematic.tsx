import PipelineSchematicBase, {
  PipelineStep
} from 'features/shared/PipelineSchematicBase'

const ROW0: PipelineStep[] = [
  { lines: ['AA Sequence', 'SAXS *.dat'], color: 'blue' },
  { lines: ['AlphaFold2'], color: 'blue' },
  { lines: ['Select Rank 1', ' prediction'], color: 'blue' },
  { lines: ['PAE Analysis'], color: 'blue' },
  { lines: ['OpenMM', 'Minimize'], color: 'green' },
  { lines: ['OpenMM', 'Heat'], color: 'green' }
]

const ROW1: PipelineStep[] = [
  { lines: ['OpenMM', 'Coarse Grained MD'], color: 'green' },
  { lines: ['Extract PDB', 'from Trajectories'], color: 'blue' },
  { lines: ['FoXS'], color: 'purple' },
  { lines: ['MultiFoXS'], color: 'purple' },
  { lines: ['Gather Results'], color: 'blue' },
  { lines: ['Notify'], color: 'blue' }
]

const AFOpenMMPipelineSchematic = () => (
  <PipelineSchematicBase
    row0={ROW0}
    row1={ROW1}
    ariaLabel="BilboMD AF pipeline schematic"
  />
)

export default AFOpenMMPipelineSchematic
