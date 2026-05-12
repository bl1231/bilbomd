import PipelineSchematicBase, {
  PipelineStep
} from 'features/shared/PipelineSchematicBase'

const ROW0: PipelineStep[] = [
  { lines: ['*.pdb ', ' const.inp', 'SANS *.dat'], color: 'blue' },
  { lines: ['OpenMM', 'Minimize'], color: 'green' },
  { lines: ['OpenMM', 'Heat'], color: 'green' },
  { lines: ['OpenMM', 'Coarse Grained MD'], color: 'green' },
  { lines: ['Extract PDB', 'from Trajectories'], color: 'blue' }
]

const ROW1: PipelineStep[] = [
  { lines: ['Pepsi-SANS'], color: 'pink' },
  { lines: ['GA-SANS'], color: 'pink' },
  { lines: ['Gather Results'], color: 'blue' },
  { lines: ['Notify'], color: 'blue' }
]

const extraColors = (isDark: boolean) => ({
  pink: {
    fill: isDark ? '#831843' : '#fce7f3',
    stroke: isDark ? '#ec4899' : '#db2777',
    text: isDark ? '#fce7f3' : '#831843'
  }
})

const SANSPipelineSchematic = () => (
  <PipelineSchematicBase
    row0={ROW0}
    row1={ROW1}
    ariaLabel="BilboMD SANS pipeline schematic"
    extraColors={extraColors}
  />
)

export default SANSPipelineSchematic
