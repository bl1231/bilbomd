import { Job as BullMQJob } from 'bullmq'
import type {
  IBilboMDPDBJob,
  IBilboMDCRDJob,
  IBilboMDAutoJob,
  IBilboMDAlphaFoldJob,
  IBilboMDOpenFoldJob,
  IBilboMDSANSJob
} from '@bilbomd/mongodb-schema'
import {
  runPdb2Crd,
  runMinimize,
  runHeat,
  runMolecularDynamics,
  runMultiFoxs,
  runPaeToConstInp
} from '../functions/bilbomd-step-functions.js'
import {
  prepareOpenMMConfig,
  runOmmMinimize,
  runOmmHeat,
  runOmmMD
} from '../functions/openmm-functions.js'
import { runCifToPdb, runPrepPdb } from '../functions/pdb-to-crd.js'
import {
  extractPDBFilesFromDCD,
  remediatePDBFiles
} from '../functions/bilbomd-functions.js'
import { runFoXS } from '../functions/foxs-functions.js'
import { runSingleFoXS } from '../functions/foxs-analysis.js'
import { prepareBilboMDResults } from '../functions/bilbomd-step-functions-nersc.js'
import { enqueueMakeMovie } from '../functions/movie-enqueuer.js'
import type { PipelineStep } from './runPipeline.js'

// Reusable steps and step sequences shared by the BilboMD pipelines. Each is
// typed by what its underlying functions accept, so e.g. OpenMM steps can't
// be added to the CHARMM-only CRD pipeline.

type OmmJob =
  | IBilboMDPDBJob
  | IBilboMDAutoJob
  | IBilboMDAlphaFoldJob
  | IBilboMDOpenFoldJob
  | IBilboMDSANSJob

type AnalysisJob =
  | IBilboMDPDBJob
  | IBilboMDCRDJob
  | IBilboMDAutoJob
  | IBilboMDAlphaFoldJob
  | IBilboMDOpenFoldJob

type DcdJob =
  IBilboMDPDBJob | IBilboMDCRDJob | IBilboMDAutoJob | IBilboMDAlphaFoldJob

// pdb, crd and auto: the pipelines that share classicSimulationAndAnalysis
type ClassicJob = IBilboMDPDBJob | IBilboMDCRDJob | IBilboMDAutoJob

type AnyBilboMDJob = AnalysisJob | IBilboMDSANSJob

export interface MDRunners<J> {
  minimize: (MQjob: BullMQJob, job: J) => Promise<void>
  heat: (MQjob: BullMQJob, job: J) => Promise<void>
  md: (MQjob: BullMQJob, job: J) => Promise<void>
}

export const charmmRunners: MDRunners<
  IBilboMDCRDJob | IBilboMDPDBJob | IBilboMDAutoJob | IBilboMDSANSJob
> = { minimize: runMinimize, heat: runHeat, md: runMolecularDynamics }

export const openmmRunners: MDRunners<OmmJob> = {
  minimize: runOmmMinimize,
  heat: runOmmHeat,
  md: runOmmMD
}

// Convert an uploaded mmCIF to PDB before anything engine-specific
export const cifToPdbStep = <
  J extends { uuid: string; pdb_file?: string }
>(): PipelineStep<J> => ({
  label: 'cif-to-pdb',
  when: ({ job }) => Boolean(job.pdb_file?.toLowerCase().endsWith('.cif')),
  run: async ({ job }) => {
    job.pdb_file = await runCifToPdb({
      uuid: job.uuid,
      pdb_file: job.pdb_file as string
    })
  }
})

export const pdb2crdStep = <
  J extends IBilboMDPDBJob | IBilboMDSANSJob | IBilboMDAutoJob
>(
  progress?: number
): PipelineStep<J> => ({
  label: 'pdb2crd',
  stepKey: 'pdb2crd',
  run: ({ MQjob, job }) => runPdb2Crd(MQjob, job),
  progress
})

// Remove waters/ions, then write openmm_config.yaml. `progress` applies
// after the config is written.
export const openmmPrepSteps = <J extends OmmJob>(
  progress?: number
): PipelineStep<J>[] => [
  {
    label: 'prep-pdb',
    // Remove waters and ions — incompatible with the implicit-solvent force field
    run: ({ job }) =>
      runPrepPdb({ uuid: job.uuid, pdb_file: job.pdb_file as string })
  },
  {
    label: 'openmm-config',
    run: ({ job }) => prepareOpenMMConfig(job),
    progress
  }
]

export const paeStep = <
  J extends IBilboMDAutoJob | IBilboMDAlphaFoldJob | IBilboMDOpenFoldJob
>(
  progress?: number
): PipelineStep<J> => ({
  label: 'pae',
  stepKey: 'pae',
  run: ({ MQjob, job }) => runPaeToConstInp(MQjob, job),
  progress
})

interface SimulationProgress {
  minimize: number
  initfoxs?: number // omit to skip the initial FoXS fit
  heat: number
  md: number
}

// Minimize → (initial FoXS) → heat → MD with the given engine
export const simulationSteps = <J extends AnyBilboMDJob>(
  runners: MDRunners<J>,
  progress: SimulationProgress
): PipelineStep<J>[] => [
  {
    label: 'minimize',
    stepKey: 'minimize',
    run: ({ MQjob, job }) => runners.minimize(MQjob, job),
    progress: progress.minimize
  },
  ...(progress.initfoxs === undefined
    ? []
    : [
        {
          label: 'initfoxs',
          stepKey: 'initfoxs',
          run: ({ job }) => runSingleFoXS(job),
          progress: progress.initfoxs
        } satisfies PipelineStep<J>
      ]),
  {
    label: 'heat',
    stepKey: 'heat',
    run: ({ MQjob, job }) => runners.heat(MQjob, job),
    progress: progress.heat
  },
  {
    label: 'md',
    stepKey: 'md',
    run: ({ MQjob, job }) => runners.md(MQjob, job),
    progress: progress.md
  }
]

// CHARMM writes DCD trajectories: extract PDB frames, then remediate them
export const charmmTrajectorySteps = <
  J extends DcdJob
>(): PipelineStep<J>[] => [
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

// Fire-and-forget: movies render in their own queue while the pipeline
// carries on, so the enqueue promise is deliberately not awaited.
export const movieStep = <J extends AnyBilboMDJob>(
  progress?: number
): PipelineStep<J> => ({
  label: 'movies',
  detached: true,
  run: ({ MQjob, job }) => {
    void enqueueMakeMovie(MQjob, job)
  },
  progress
})

interface AnalysisProgress {
  foxs: number
  multifoxs: number
  results: number
}

// FoXS on every conformer → MultiFoXS ensembles → results archive
export const analysisSteps = <J extends AnalysisJob>(
  progress: AnalysisProgress
): PipelineStep<J>[] => [
  {
    label: 'foxs',
    stepKey: 'foxs',
    run: ({ MQjob, job }) => runFoXS(MQjob, job),
    progress: progress.foxs
  },
  {
    label: 'multifoxs',
    stepKey: 'multifoxs',
    run: ({ MQjob, job }) => runMultiFoxs(MQjob, job),
    progress: progress.multifoxs
  },
  {
    label: 'results',
    stepKey: 'results',
    run: ({ job }) => prepareBilboMDResults(job),
    progress: progress.results
  }
]

// Shared tail of the classic pipelines (pdb, crd, auto): simulate with the
// chosen engine, turn the trajectories into PDBs (CHARMM) or queue movies
// (OpenMM), then run the SAXS analysis.
export const classicSimulationAndAnalysis = <J extends ClassicJob>(
  runners: MDRunners<J>,
  engine: 'CHARMM' | 'OpenMM'
): PipelineStep<J>[] => [
  ...simulationSteps(runners, { minimize: 25, initfoxs: 30, heat: 40, md: 50 }),
  ...(engine === 'OpenMM' ? [movieStep<J>()] : charmmTrajectorySteps<J>()),
  ...analysisSteps({ foxs: 80, multifoxs: 95, results: 99 })
]

// Pipelines that start from a predicted structure (AlphaFold, OpenFold):
// predict → clean PDB → bare OpenMM config → PAE constraints → config with
// constraints → OpenMM simulation → movies → SAXS analysis.
export const predictedStructureSteps = <
  J extends IBilboMDAlphaFoldJob | IBilboMDOpenFoldJob
>(
  predictStep: PipelineStep<J>
): PipelineStep<J>[] => [
  { ...predictStep, progress: 25 },
  // First openmm_config.yaml — bare config, no constraints yet
  ...openmmPrepSteps<J>(),
  // PAE → openmm_const.yml
  paeStep<J>(30),
  {
    // Re-run so openmm_const.yml is folded into openmm_config.yaml
    label: 'openmm-config-merge',
    run: ({ job }) => prepareOpenMMConfig(job)
  },
  ...simulationSteps<J>(openmmRunners, {
    minimize: 40,
    initfoxs: 45,
    heat: 55,
    md: 70
  }),
  movieStep<J>(),
  ...analysisSteps<J>({ foxs: 85, multifoxs: 95, results: 99 })
]
