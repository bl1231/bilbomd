import {
  updateStepStatus,
  updateJobResults,
  updateJobProgress
} from './mongo-utils.js'
import { IBilboMDScoperJob } from '@bilbomd/mongodb-schema'
import { logger } from './helpers/loggers.js'

// progress when we enter is 10
// progress when we exit is 80
//
// mgclassifierv2.py logs when each stage *starts*, never when it ends, so each
// marker line closes the previous step and opens the next. Pipeline order:
// reduce -> rnaview -> kgs -> foxs -> ionnet -> multifoxs

export async function parseScoperLogLine(line: string, job: IBilboMDScoperJob) {
  if (line.includes('Starting main application...')) {
    await updateStepStatus(job, 'reduce', {
      status: 'Running',
      message: 'Starting reduce step.'
    })
  } else if (line.includes('Adding hydrogens')) {
    await updateStepStatus(job, 'reduce', {
      status: 'Running',
      message: 'Adding hydrogens.'
    })
  } else if (line.includes('Running rnaview on input pdb')) {
    await updateStepStatus(job, 'reduce', {
      status: 'Success',
      message: 'Hydrogens added.'
    })
    await updateStepStatus(job, 'rnaview', {
      status: 'Running',
      message: 'RNAView running'
    })
    // progress to 15
    await updateJobProgress(job, 15)
  } else if (line.match(/Running KGS with (\d+) samples/)) {
    await updateStepStatus(job, 'rnaview', {
      status: 'Success',
      message: 'RNAView completed'
    })
    await updateStepStatus(job, 'kgs', {
      status: 'Running',
      message: 'KGS running'
    })
    // progress to 20
    await updateJobProgress(job, 20)
  } else if (line.match(/Getting FoXS scores for (\d+) structures/)) {
    await updateStepStatus(job, 'kgs', {
      status: 'Success',
      message: 'KGS completed'
    })
    await updateStepStatus(job, 'foxs', {
      status: 'Running',
      message: 'FoXS running'
    })
    // progress to 25
    await updateJobProgress(job, 25)
  } else if (line.match(/top_k_pdbs: \[\('(.+\.pdb)', (\d+\.\d+)\)\]/)) {
    const match = line.match(/top_k_pdbs: \[\('(.+\.pdb)', (\d+\.\d+)\)\]/)
    if (match) {
      await updateStepStatus(job, 'foxs', {
        status: 'Success',
        message: 'FoXS completed'
      })
      await updateStepStatus(job, 'ionnet', {
        status: 'Running',
        message: 'IonNet running'
      })
      // progress to 35
      await updateJobProgress(job, 35)
      await updateJobResults(job, {
        'results.scoper.foxs_top_file': match[1],
        'results.scoper.foxs_top_score': parseFloat(match[2])
      })
    }
  } else if (line.includes('Predicting with a threshold value of')) {
    const match = line.match(/Predicting with a threshold value of (\d+\.\d+)/)
    if (match) {
      await updateJobResults(job, {
        'results.scoper.prediction_threshold': parseFloat(match[1])
      })
    }
  } else if (line.includes('Running MultiFoXS Combination')) {
    await updateStepStatus(job, 'ionnet', {
      status: 'Success',
      message: 'IonNet completed'
    })
    // progress to 60
    await updateJobProgress(job, 60)
    await updateStepStatus(job, 'multifoxs', {
      status: 'Running',
      message: 'MultiFoXS running'
    })
  } else if (line.includes('predicted ensemble is of size:')) {
    const match = line.match(/predicted ensemble is of size: (\d+)/)
    if (match) {
      await updateStepStatus(job, 'multifoxs', {
        status: 'Success',
        message: 'MultiFoXS completed'
      })
      // progress to 70
      await updateJobProgress(job, 70)
      await updateJobResults(job, {
        'results.scoper.multifoxs_ensemble_size': parseInt(match[1], 10)
      })
    }
  } else if (line.includes('The lowest scoring ensemble is')) {
    const match = line.match(/The lowest scoring ensemble is (\d+\.\d+)/)
    if (match) {
      await updateJobResults(job, {
        'results.scoper.multifoxs_score': parseFloat(match[1])
      })
    }
  }
}

// stdout 'data' chunks don't line up with lines: one chunk can hold several
// markers, or end mid-line. This splits chunks into whole lines and parses them
// one at a time, in order, so step updates land in Mongo in pipeline order.
export const createScoperLogParser = (job: IBilboMDScoperJob) => {
  let partial = ''
  let queue: Promise<void> = Promise.resolve()

  const parseLines = (lines: string[]) => {
    queue = queue.then(async () => {
      for (const line of lines) {
        try {
          await parseScoperLogLine(line, job)
        } catch (error) {
          logger.error(`Error parsing scoper log line: ${error}`)
        }
      }
    })
    return queue
  }

  // Parse every complete line in the chunk; hold back a trailing partial line
  const push = (chunk: string) => {
    const lines = (partial + chunk).split(/\r?\n/)
    partial = lines.pop() ?? ''
    return parseLines(lines)
  }

  // Parse any trailing partial line and wait for all queued updates
  const flush = () => {
    const rest = partial
    partial = ''
    return parseLines(rest ? [rest] : [])
  }

  return { push, flush }
}
