import PipelineSchematicBase, {
  PipelineStep
} from 'features/shared/PipelineSchematicBase'

const ROW0: PipelineStep[] = [
  { lines: ['Sequences', 'SAXS *.dat'], color: 'blue' },
  { lines: ['AutoRg', 'Rg targets'], color: 'blue' },
  { lines: ['MSA', '(ColabFold)'], color: 'blue' },
  { lines: ['BioEmu2', 'Rg-steered'], color: 'green' },
  { lines: ['Physicality', 'check'], color: 'green' }
]

const ROW1: PipelineStep[] = [
  { lines: ['FoXS'], color: 'purple' },
  { lines: ['MultiFoXS'], color: 'purple' },
  { lines: ['OpenMM', 'Polish'], color: 'green' },
  { lines: ['Gather Results'], color: 'blue' },
  { lines: ['Notify'], color: 'blue' }
]

const BioEmuPipelineSchematic = () => (
  <PipelineSchematicBase
    row0={ROW0}
    row1={ROW1}
    ariaLabel="BilboMD BioEmu2 pipeline schematic"
  />
)

export default BioEmuPipelineSchematic
