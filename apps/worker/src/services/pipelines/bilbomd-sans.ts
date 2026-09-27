import { Job as BullMQJob } from 'bullmq'
import path from 'node:path'
import fs from 'fs-extra'
import { BilboMdSANSJob, IBilboMDSANSJob } from '@bilbomd/mongodb-schema'
import { config } from '../../config/config.js'
import { runOmmMinimize } from '../functions/openmm-functions.js'
import {
  extractPDBFilesFromDCD,
  mirrorOmmMdToPepsiSANS,
  remediatePDBFiles
} from '../functions/sans-trajectory.js'
import { runPepsiSANSOnPDBFiles } from '../functions/sans-pepsisans.js'
import { runGASANS } from '../functions/sans-gasans.js'
import { prepareBilboMDSANSResults } from '../functions/sans-results.js'
import { runPipeline, type PipelineStep } from './runPipeline.js'
import {
  charmmRunners,
  cifToPdbStep,
  movieStep,
  openmmPrepSteps,
  openmmRunners,
  pdb2crdStep,
  simulationSteps
} from './steps.js'

type Step = PipelineStep<IBilboMDSANSJob>

// SANS doesn't fit an initial FoXS curve, and turns MD frames into
// Pepsi-SANS inputs instead of FoXS ones.
const charmmSteps = (): Step[] => [
  pdb2crdStep(15),
  ...simulationSteps(charmmRunners, { minimize: 20, heat: 30, md: 50 }),
  {
    label: 'dcd2pdb',
    stepKey: 'dcd2pdb',
    run: ({ MQjob, job }) => extractPDBFilesFromDCD(MQjob, job),
    progress: 60
  },
  {
    label: 'remediate',
    stepKey: 'pdb_remediate',
    run: ({ job }) => remediatePDBFiles(job),
    progress: 70
  }
]

const openmmSteps = (): Step[] => {
  const [minimize, ...heatAndMd] = simulationSteps(openmmRunners, {
    minimize: 20,
    heat: 30,
    md: 50
  })
  return [
    ...openmmPrepSteps(),
    {
      ...minimize!,
      run: async ({ MQjob, job }) => {
        await runOmmMinimize(MQjob, job)
        // Place minimized PDB at the job root so prepareBilboMDSANSResults can copy it.
        const workDir = path.join(config.uploadDir, job.uuid)
        await fs.copy(
          path.join(workDir, 'openmm', 'minimize', 'minimized.pdb'),
          path.join(workDir, 'minimization_output.pdb'),
          { overwrite: true }
        )
      }
    },
    ...heatAndMd,
    {
      // Mirror PDB frames from openmm/md/rg_{N}/ into pepsisans/rg{N}/
      label: 'mirror-md-to-pepsisans',
      run: ({ job }) => mirrorOmmMdToPepsiSANS(job)
    },
    movieStep(70)
  ]
}

const processBilboMDSANSJob = (MQjob: BullMQJob) =>
  runPipeline<IBilboMDSANSJob>(MQjob, {
    pipeline: 'sans',
    model: BilboMdSANSJob,
    defaultEngine: 'CHARMM',
    steps: ({ engine }) => [
      cifToPdbStep(),
      ...(engine === 'CHARMM' ? charmmSteps() : openmmSteps()),
      {
        label: 'pepsisans',
        stepKey: 'pepsisans',
        run: ({ MQjob, job }) => runPepsiSANSOnPDBFiles(MQjob, job),
        progress: 80
      },
      {
        label: 'ga-sans',
        stepKey: 'gasans',
        run: ({ MQjob, job }) => runGASANS(MQjob, job),
        progress: 90
      },
      {
        label: 'results',
        stepKey: 'results',
        run: ({ job }) => prepareBilboMDSANSResults(job),
        progress: 99
      }
    ]
  })

export { processBilboMDSANSJob }
