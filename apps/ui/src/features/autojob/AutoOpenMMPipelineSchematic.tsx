import PipelineSchematicBase, {
  PipelineStep
} from 'features/shared/PipelineSchematicBase'

const ROW0: PipelineStep[] = [
  {
    lines: ['AlphaFold *.pdb', 'AlphaFold pae.json', 'SAXS *.dat'],
    color: 'blue'
  },
  { lines: ['PAE Analysis'], color: 'blue' },
  { lines: ['OpenMM', 'Minimize'], color: 'green' },
  { lines: ['OpenMM', 'Heat'], color: 'green' },
  { lines: ['OpenMM', 'Coarse Grained MD'], color: 'green' }
]

const ROW1: PipelineStep[] = [
  { lines: ['Extract PDB', 'from Trajectories'], color: 'blue' },
  { lines: ['FoXS'], color: 'purple' },
  { lines: ['MultiFoXS'], color: 'purple' },
  { lines: ['Gather Results'], color: 'blue' },
  { lines: ['Notify'], color: 'blue' }
]

const AutoOpenMMPipelineSchematic = () => (
  <PipelineSchematicBase
    row0={ROW0}
    row1={ROW1}
    ariaLabel="BilboMD Auto pipeline schematic"
  />
)

export default AutoOpenMMPipelineSchematic
