import PipelineSchematicBase, {
  PipelineStep
} from 'features/shared/PipelineSchematicBase'

const ROW0: PipelineStep[] = [
  { lines: ['*.crd & *.psf', 'const.inp', 'SAXS *.dat'], color: 'blue' },
  { lines: ['CHARMM', 'Minimize'], color: 'green' },
  { lines: ['CHARMM', 'Heat'], color: 'green' },
  { lines: ['CHARMM', 'Coarse Grained MD'], color: 'green' },
  { lines: ['Extract PDB', 'from Trajectories'], color: 'blue' }
]

const ROW1: PipelineStep[] = [
  { lines: ['FoXS'], color: 'purple' },
  { lines: ['MultiFoXS'], color: 'purple' },
  { lines: ['Gather Results'], color: 'blue' },
  { lines: ['Notify'], color: 'blue' }
]

const ClassicCRDPipelineSchematic = () => (
  <PipelineSchematicBase
    row0={ROW0}
    row1={ROW1}
    ariaLabel="BilboMD Classic CRD pipeline schematic"
  />
)

export default ClassicCRDPipelineSchematic
