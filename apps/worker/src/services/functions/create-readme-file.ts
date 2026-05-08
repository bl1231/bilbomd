import { logger } from '../../helpers/loggers.js'
import {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDSANSJob,
  IMultiJob
} from '@bilbomd/mongodb-schema'
import path from 'path'
import fs from 'fs-extra'

type AnyBilboMDJob =
  | IBilboMDCRDJob
  | IBilboMDPDBJob
  | IBilboMDAutoJob
  | IBilboMDAlphaFoldJob
  | IBilboMDOpenFoldJob
  | IBilboMDSANSJob
  | IMultiJob

const CITATION = `Pelikan M, Hura GL, Hammel M. Structure and flexibility within proteins as identified through small angle X-ray scattering. Gen Physiol Biophys. 2009 Jun;28(2):174-89. doi: 10.4149/gpb_2009_02_174. PMID: 19592714; PMCID: PMC3773563.`

const MULTIFOXS_ENSEMBLE_EXPLANATION = `
## The ensemble_size_N.txt files

Here is an example from a hypothetical ensemble_size_3.txt file:

1 |  2.89 | x1 2.89 (0.99, -0.50)
   70   | 0.418 (0.414, 0.011) | ../foxs/rg25_run3/dcd2pdb_rg25_run3_271500.pdb.dat (0.138)
   87   | 0.508 (0.422, 0.101) | ../foxs/rg41_run1/dcd2pdb_rg41_run1_35500.pdb.dat (0.273)
  184   | 0.074 (0.125, 0.024) | ../foxs/rg45_run1/dcd2pdb_rg45_run1_23000.pdb.dat (0.025)

In this example we show only the "best" 3-state ensemble. Each ensemble_size_N.txt file will
actually contain many possible N-state ensembles.

The first line is a summary of scores and fit parameters for a particular multi-state model:
    - The first column is a number/rank of the multi-state model (sorted by score)
    - The second column is a Chi^2 value for the fit to SAXS profile (2.89)
    - The third column repeats the Chi^2 value and also displays a pair of c1 (0.99) and c2 (-0.50)
      values (in brackets) from the MultiFoXS optimized fit to data.

After the model summary line the file contains information about the states (one line per state).
In this example the best scoring 3-state model consists of conformation numbers 70, 87, and 184
with weights of 0.418, 0.508, and 0.074 respectively. The numbers in brackets after the
conformation weight are an average and a standard deviation of the weight calculated for this
conformation across all good scoring multi-state models of this size. The number in brackets
after the filename is the fraction of good scoring multi-state models that contain this conformation.

## The ensemble_size_N_model.pdb files

In the case of N>2 these will be multi-model PDB files. For N=1 it will just be the best single
conformer to fit your SAXS data.

ensemble_size_1_model.pdb  - will contain the coordinates for the best 1-state model
ensemble_size_2_model.pdb  - will contain the coordinates for the best 2-state model
ensemble_size_3_model.pdb  - will contain the coordinates for the best 3-state model
etc.

## The multi_state_model_N_1_1.dat files

These are the theoretical SAXS curves from MultiFoXS calculated for each of the ensemble_size_N_model.pdb models.`

const createReadmeFile = async (
  DBjob: AnyBilboMDJob,
  numEnsembles: number,
  resultsDir: string,
  saxsDataFileName?: string
): Promise<void> => {
  let readmeContent: string

  switch (DBjob.__t) {
    case 'BilboMdCRD': {
      const job = DBjob as IBilboMDCRDJob
      readmeContent = buildStandardReadme(DBjob, numEnsembles, `
- Original CRD file: ${job.crd_file}
- Original PSF file: ${job.psf_file}
- Original experimental SAXS data file: ${job.data_file}
- Original const.inp file: ${job.const_inp_file}
- Generated minimized PDB file: minimization_output.pdb
- Generated minimized PDB DAT file: minimization_output_${job.data_file.split('.')[0]}.dat
`)
      break
    }
    case 'BilboMdPDB': {
      const job = DBjob as IBilboMDPDBJob
      readmeContent = buildStandardReadme(DBjob, numEnsembles, `
- Original PDB file: ${job.pdb_file}
- Generated CRD file: ${job.crd_file}
- Generated PSF file: ${job.psf_file}
- Original experimental SAXS data file: ${job.data_file}
- Original const.inp file: ${job.const_inp_file}
- Generated minimized PDB file: minimization_output.pdb
- Generated minimized PDB DAT file: minimization_output_${job.data_file.split('.')[0]}.dat
`)
      break
    }
    case 'BilboMdAuto': {
      const job = DBjob as IBilboMDAutoJob
      readmeContent = buildStandardReadme(DBjob, numEnsembles, `
- Original PDB file: ${job.pdb_file}
- Original PAE file: ${job.pae_file}
- Generated CRD file: ${job.crd_file}
- Generated PSF file: ${job.psf_file}
- Original experimental SAXS data file: ${job.data_file}
- Generated const.inp file: ${job.const_inp_file}
- Generated minimized PDB file: minimization_output.pdb
- Generated minimized PDB DAT file: minimization_output_${job.data_file.split('.')[0]}.dat
`)
      break
    }
    case 'BilboMdAlphaFold': {
      const job = DBjob as IBilboMDAlphaFoldJob
      readmeContent = buildStandardReadme(DBjob, numEnsembles, `
- Original experimental SAXS data file: ${job.data_file}
- FASTA file: ${job.fasta_file}
- AlphaFold PDB file: af-rank1.pdb
- AlphaFold PAE file: af-pae.json
- Generated CRD file: bilbomd_pdb2crd.crd
- Generated PSF file: bilbomd_pdb2crd.psf
- Generated const.inp file: const.inp
- Generated minimized PDB file: minimization_output.pdb
- Generated minimized PDB DAT file: minimization_output_${job.data_file.split('.')[0]}.dat
`)
      break
    }
    case 'BilboMdOpenFold': {
      const job = DBjob as IBilboMDOpenFoldJob
      readmeContent = buildStandardReadme(DBjob, numEnsembles, `
- Original experimental SAXS data file: ${job.data_file}
- OpenFold3 query JSON: of3-query.json
- OpenFold3 PDB file: of3-rank1.pdb
- OpenFold3 PAE file: of3-pae.json
- Generated CRD file: bilbomd_pdb2crd.crd
- Generated PSF file: bilbomd_pdb2crd.psf
- Generated const.inp file: const.inp
- Generated minimized PDB file: minimization_output.pdb
- Generated minimized PDB DAT file: minimization_output_${job.data_file.split('.')[0]}.dat
`)
      break
    }
    case 'BilboMdSANS': {
      const job = DBjob as IBilboMDSANSJob
      readmeContent = `
# BilboMD SANS Job Results

This directory contains the results for your ${job.title} BilboMD SANS job.

- Job Title:  ${job.title}
- Job ID:  ${job._id}
- UUID:  ${job.uuid}
- Submitted:  ${job.time_submitted}
- Completed:  ${new Date().toString()}

## Contents

- Original PDB file: ${job.pdb_file}
- Converted CRD file: ${job.crd_file}
- Converted PSF file: ${job.psf_file}
- Original experimental SANS data file: ${job.data_file}
- Original const.inp file: ${job.const_inp_file}
- Generated minimized PDB file: minimization_output.pdb
- Generated minimized PDB DAT file: minimization_output_${job.data_file.split('.')[0]}.dat

The "best" N-state Ensemble PDB files will be present in multiple copies. There is one file for each ensemble size.

- Number of ensembles for this BilboMD SANS run: ${numEnsembles}

- Ensemble PDB file(s):  ensemble_size_N_model.pdb
- Ensemble CSV file(s):  gasans_summary_EnsSizeN.csv
- Ensemble DAT/CSV file(s):  best_model_EnsembleSizeN.csv

### The ensemble_size_N_model.pdb files

These will be multi-model PDB files created by concatenating the best ensemble of PDB files for each ensemble size.

ensemble_size_2_model.pdb  - will contain the coordinates for the best 2-state model
ensemble_size_3_model.pdb  - will contain the coordinates for the best 3-state model
ensemble_size_4_model.pdb  - will contain the coordinates for the best 4-state model
etc.

### The gasans_summary_EnsSizeN.csv files

TODO - Explain the contents of these CSV files

### The best_model_EnsembleSizeN.csv files

These are the theoretical SANS curves from Pepsi-SANS calculated for each of the ensemble_size_N_model.pdb models.

If you use BilboMD in your research, please cite:

${CITATION}

TODO - add citation for Pepsi-SANS
TODO - add citation for GA-SANS

Thank you for using BilboMD SANS
`
      break
    }
    case 'MultiJob': {
      const job = DBjob as IMultiJob
      readmeContent = `
# BilboMD Multi Job Results

This directory contains the results for your ${job.title} BilboMD Multi job.

- Job Title:  ${job.title}
- Experimental SAXS dat file: ${saxsDataFileName ?? 'N/A'}
- All calculated scattering profiles from previous selected BilboMD runs
- Job ID:  ${job._id}
- UUID:  ${job.uuid}
- Submitted:  ${job.time_submitted}
- Completed:  ${new Date().toString()}

## Contents

The Ensemble files will be present in multiple copies. There is one file for each ensemble size.

- Number of ensembles for this BilboMD run: ${numEnsembles}

- Ensemble PDB file(s):  ensemble_size_N_model.pdb
- Ensemble TXT file(s):  ensemble_size_N.txt
- Ensemble DAT file(s):  multi_state_model_N_1_1.dat
- Summary of DB info:    bilbomd_job.json
${MULTIFOXS_ENSEMBLE_EXPLANATION}

If you use BilboMD in your research, please cite:

${CITATION}

Thank you for using BilboMD
`
      break
    }
    default:
      logger.warn(`createReadmeFile: unhandled job type '${(DBjob as AnyBilboMDJob).__t}'`)
      readmeContent = `# BilboMD Job Results\n\nNo README template available for job type: ${(DBjob as AnyBilboMDJob).__t}\n`
  }

  const readmePath = path.join(resultsDir, 'README.md')
  try {
    await fs.writeFile(readmePath, readmeContent)
    logger.info('README file created successfully.')
  } catch (error) {
    logger.error(`Failed to create README file: ${error}`)
    throw new Error('Failed to create README file')
  }
}

const buildStandardReadme = (
  DBjob: AnyBilboMDJob,
  numEnsembles: number,
  originalFiles: string
): string => `
# BilboMD Job Results

This directory contains the results for your ${DBjob.title} BilboMD job.

- Job Title:  ${DBjob.title}
- Job ID:  ${DBjob._id}
- UUID:  ${DBjob.uuid}
- Submitted:  ${DBjob.time_submitted}
- Completed:  ${new Date().toString()}

## Contents
${originalFiles}
The Ensemble files will be present in multiple copies. There is one file for each ensemble size.

- Number of ensembles for this BilboMD run: ${numEnsembles}

- Ensemble PDB file(s):  ensemble_size_N_model.pdb
- Ensemble TXT file(s):  ensemble_size_N.txt
- Ensemble DAT file(s):  multi_state_model_N_1_1.dat
${MULTIFOXS_ENSEMBLE_EXPLANATION}

If you use BilboMD in your research, please cite:

${CITATION}

Thank you for using BilboMD
`

export { createReadmeFile }
