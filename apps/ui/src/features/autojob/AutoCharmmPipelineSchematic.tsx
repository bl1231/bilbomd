import PipelineSchematicBase, {
  PipelineStep
} from 'features/shared/PipelineSchematicBase'

const ROW0: PipelineStep[] = [
  {
    lines: ['AlphaFold *.pdb', 'AlphaFold pae.json', 'SAXS *.dat'],
    color: 'blue'
  },
  { lines: ['Convert to', '*.crd / *.psf'], color: 'blue' },
  { lines: ['PAE Analysis'], color: 'blue' },
  { lines: ['CHARMM', 'Minimize'], color: 'green' },
  { lines: ['CHARMM', 'Heat'], color: 'green' },
  { lines: ['CHARMM', 'Coarse Grained MD'], color: 'green' }
]

const ROW1: PipelineStep[] = [
  { lines: ['Extract PDB', 'from Trajectories'], color: 'blue' },
  { lines: ['FoXS'], color: 'purple' },
  { lines: ['MultiFoXS'], color: 'purple' },
  { lines: ['Gather Results'], color: 'blue' },
  { lines: ['Notify'], color: 'blue' }
]

const AutoCharmmPipelineSchematic = () => (
  <PipelineSchematicBase
    row0={ROW0}
    row1={ROW1}
    ariaLabel="BilboMD Auto CHARMM pipeline schematic"
  />
)

export default AutoCharmmPipelineSchematic
