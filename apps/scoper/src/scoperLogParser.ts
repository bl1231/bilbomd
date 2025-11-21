import { updateStepStatus, updateJobResults } from './mongo-utils.js'
import { IBilboMDScoperJob } from '@bilbomd/mongodb-schema'

export function parseScoperLogLine(line: string, job: IBilboMDScoperJob) {
  if (line.includes('Starting main application...')) {
    updateStepStatus(job, 'reduce', {
      status: 'Running',
      message: 'Starting reduce step.'
    })
  } else if (line.includes('Adding hydrogens')) {
    updateStepStatus(job, 'reduce', {
      status: 'Success',
      message: 'Hydrogens added.'
    })
  } else if (line.includes('Running rnaview on input pdb')) {
    updateStepStatus(job, 'rnaview', {
      status: 'Success',
      message: 'RNAView completed'
    })
  } else if (line.match(/Running KGS with (\d+) samples/)) {
    updateStepStatus(job, 'kgs', {
      status: 'Success',
      message: 'KGS completed'
    })
  } else if (line.match(/Getting FoXS scores for (\d+) structures/)) {
    updateStepStatus(job, 'foxs', {
      status: 'Running',
      message: 'FoXS running'
    })
  } else if (line.match(/top_k_pdbs: \[\('(.+\.pdb)', (\d+\.\d+)\)\]/)) {
    const match = line.match(/top_k_pdbs: \[\('(.+\.pdb)', (\d+\.\d+)\)\]/)
    if (match) {
      updateStepStatus(job, 'foxs', {
        status: 'Success',
        message: 'FoXS completed'
      })
      const resultsUpdate = {
        ...job.results,
        scoper: {
          ...job.results?.scoper,
          foxs_top_file: match[1],
          foxs_top_score: parseFloat(match[2])
        }
      }
      updateJobResults(job, resultsUpdate)
    }
  } else if (line.includes('Predicting with a threshold value of')) {
    const match = line.match(/Predicting with a threshold value of (\d+\.\d+)/)
    if (match) {
      const resultsUpdate = {
        ...job.results,
        scoper: {
          ...job.results?.scoper,
          prediction_threshold: parseFloat(match[1])
        }
      }
      updateJobResults(job, resultsUpdate)
    } else if (line.includes('Running MultiFoXS Combination')) {
      updateStepStatus(job, 'ionnet', {
        status: 'Success',
        message: 'IonNet completed'
      })
      updateStepStatus(job, 'multifoxs', {
        status: 'Running',
        message: 'MultiFoXS running'
      })
    } else if (line.includes('predicted ensemble is of size:')) {
      const match = line.match(/predicted ensemble is of size: (\d+)/)
      if (match) {
        updateStepStatus(job, 'multifoxs', {
          status: 'Success',
          message: 'MultiFoXS completed'
        })
        const resultsUpdate = {
          ...job.results,
          scoper: {
            ...job.results?.scoper,
            multifoxs_ensemble_size: parseInt(match[1], 10)
          }
        }
        updateJobResults(job, resultsUpdate)
      }
    }
  } else if (line.includes('The lowest scoring ensemble is')) {
    const match = line.match(/The lowest scoring ensemble is (\d+\.\d+)/)
    if (match) {
      const resultsUpdate = {
        ...job.results,
        scoper: {
          ...job.results?.scoper,
          multifoxs_score: parseFloat(match[1])
        }
      }
      updateJobResults(job, resultsUpdate)
    }
  }
}
