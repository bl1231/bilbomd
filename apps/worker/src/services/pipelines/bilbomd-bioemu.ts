import { Job as BullMQJob } from 'bullmq'
import { BilboMdBioEmuJob, IBilboMDBioEmuJob } from '@bilbomd/mongodb-schema'
import { runBioEmu } from '../functions/bioemu-functions.js'
import { runFoXS } from '../functions/foxs-functions.js'
import { runMultiFoxs } from '../functions/multifoxs.js'
import { runPolish } from '../functions/polish-functions.js'
import { prepareBilboMDResults } from '../functions/prepare-results.js'
import { runPipeline } from './runPipeline.js'

// BilboMD BioEmu2 (bilbomd#1200): sequence + SAXS data in. AutoRg ran at
// submission; BioEmu2 samples structures steered to each Rg target straight
// into foxs/rg*/ (no input model, no MD), so FoXS and MultiFoXS run unchanged.
// The members of the best ensembles are then polished with a restrained
// OpenMM minimization, which is why the engine is fixed to OpenMM.
const processBilboMDBioEmuJob = (MQjob: BullMQJob) =>
  runPipeline<IBilboMDBioEmuJob>(MQjob, {
    pipeline: 'bioemu',
    model: BilboMdBioEmuJob,
    defaultEngine: 'OpenMM',
    fixedEngine: 'OpenMM',
    steps: () => [
      {
        label: 'bioemu',
        stepKey: 'bioemu',
        run: ({ MQjob, job }) => runBioEmu(MQjob, job),
        progress: 60
      },
      {
        label: 'foxs',
        stepKey: 'foxs',
        run: ({ MQjob, job }) => runFoXS(MQjob, job),
        progress: 75
      },
      {
        label: 'multifoxs',
        stepKey: 'multifoxs',
        run: ({ MQjob, job }) => runMultiFoxs(MQjob, job),
        progress: 90
      },
      {
        label: 'polish',
        stepKey: 'polish',
        run: ({ job }) => runPolish(job),
        progress: 95
      },
      {
        label: 'results',
        stepKey: 'results',
        run: ({ job }) => prepareBilboMDResults(job),
        progress: 99
      }
    ]
  })

export { processBilboMDBioEmuJob }
