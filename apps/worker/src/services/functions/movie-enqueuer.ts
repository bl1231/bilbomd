import { movieQueue } from '../../queues/movie.js'
import { Job as BullMQJob } from 'bullmq'
import { IJob, Job } from '@bilbomd/mongodb-schema'
import path from 'path'
import { config } from '../../config/config.js'
import fs from 'fs-extra'

const upsertMovieAsset = async (
  jobId: string,
  label: string,
  data: {
    pdb: string
    dcd: string
    width: number
    height: number
    stride: number
    crf: number
    ray: boolean
    supersample: number // you’re using hard-coded 2x, so store it
  }
) => {
  // 1) Try to update existing
  const res = await Job.updateOne(
    { _id: jobId, 'assets.movies.label': label },
    {
      $set: {
        'assets.movies.$.status': 'queued',
        'assets.movies.$.source.pdb': data.pdb,
        'assets.movies.$.source.dcd': data.dcd,
        'assets.movies.$.meta.width': data.width,
        'assets.movies.$.meta.height': data.height,
        'assets.movies.$.meta.stride': data.stride,
        'assets.movies.$.meta.crf': data.crf,
        'assets.movies.$.meta.ray': data.ray,
        'assets.movies.$.meta.supersample': data.supersample,
        'assets.movies.$.updatedAt': new Date()
      }
    }
  )

  // 2) If not found, push a new one
  if (res.matchedCount === 0) {
    await Job.updateOne(
      { _id: jobId },
      {
        $push: {
          'assets.movies': {
            label,
            status: 'queued',
            source: { pdb: data.pdb, dcd: data.dcd },
            meta: {
              width: data.width,
              height: data.height,
              stride: data.stride,
              crf: data.crf,
              ray: data.ray,
              supersample: data.supersample
            },
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      }
    )
  }
}

const enqueueMakeMovie = async (
  MQjob: BullMQJob,
  DBJob: IJob,
  opts?: Partial<MovieJobData>
) => {
  // 1) figure out your inputs
  //    (adapt these to your actual filesystem layout)
  const workDir = path.join(config.uploadDir, DBJob.uuid)

  // Discover md runs under workDir/md/rg_*/
  const mdDir = path.join(workDir, 'md')
  const outDirBase = path.join(workDir, 'assets', 'movies')

  const foundPairs: Array<{
    label: string
    pdb: string
    dcd: string
    outDir: string
  }> = []

  if (!(await fs.pathExists(mdDir))) {
    await MQjob.log(`[movie] skip enqueue: md directory not found at ${mdDir}`)
    return
  }

  const entries = await fs.readdir(mdDir, { withFileTypes: true })
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const label = ent.name
    // Accept directories like rg_27, rg_30, ...
    if (!/^rg_\d+$/i.test(label)) continue

    const runDir = path.join(mdDir, label)
    const pdbPath = path.join(runDir, 'md.pdb')
    const dcdPath = path.join(runDir, 'md.dcd')

    const hasPdb = await fs.pathExists(pdbPath)
    const hasDcd = await fs.pathExists(dcdPath)

    if (!hasPdb || !hasDcd) {
      await MQjob.log(
        `[movie] skipping ${label}: missing ${!hasPdb ? 'md.pdb' : ''}${!hasPdb && !hasDcd ? ' and ' : ''}${!hasDcd ? 'md.dcd' : ''}`
      )
      continue
    }

    const outDir = path.join(outDirBase, label)
    foundPairs.push({ label, pdb: pdbPath, dcd: dcdPath, outDir })
  }

  if (foundPairs.length === 0) {
    await MQjob.log(
      `[movie] skip enqueue: no rg_* runs with md.pdb + md.dcd found under ${mdDir}`
    )
    return
  }

  // 2) defaults (tune these to your script)
  type MovieTunables = Pick<
    MovieJobData,
    'stride' | 'width' | 'height' | 'crf' | 'rayEnabled'
  >

  const defaults: MovieTunables = {
    stride: 10,
    width: 1280,
    height: 720,
    crf: 22,
    rayEnabled: true
  }

  // 3) enqueue one BullMQ job per DCD
  for (const pair of foundPairs) {
    // Upsert asset entry in Job.assets.movies
    await upsertMovieAsset(String(DBJob._id), pair.label, {
      pdb: pair.pdb,
      dcd: pair.dcd,
      width: defaults.width,
      height: defaults.height,
      stride: defaults.stride,
      crf: defaults.crf,
      ray: defaults.rayEnabled,
      supersample: 2 // you hard-coded 2x in the PyMOL script
    })

    const data: MovieJobData = {
      jobId: String(DBJob._id),
      label: pair.label,
      pdb: pair.pdb,
      dcd: pair.dcd,
      outDir: pair.outDir,
      ...defaults,
      ...(opts || {})
    }

    // idempotent job id (so retries/enqueues don’t duplicate)
    const bullJobId = `${DBJob._id}:movie:${pair.label}`

    movieQueue
      .add('render-movie', data, {
        jobId: bullJobId,
        priority: 10,
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 200,
        removeOnFail: 500
      })
      .then(() => {
        MQjob.log(
          `[movie] enqueued ${bullJobId} (pdb=${path.basename(pair.pdb)}, dcd=${path.basename(pair.dcd)})`
        )
      })
      .catch((err) => {
        MQjob.log(
          `[movie] enqueue failed for ${bullJobId}: ${err?.message || err}`
        )
      })
  }
}

export { enqueueMakeMovie }
