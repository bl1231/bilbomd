import fs from 'fs-extra'
import path from 'path'
import { Job, type IMultiJob } from '@bilbomd/mongodb-schema'
import type { MDEngine, MultiCombinedJobDTO } from '@bilbomd/bilbomd-types'
import { getEnvVar } from '../../config/config.js'
import { logger } from '../../middleware/loggers.js'
import {
  mapDiscriminatorToJobType,
  mapStatus
} from '../../controllers/jobs/utils/jobDTOMapper.js'

// The worker lists every FoXS profile it pools for MultiFoXS here, one path
// per line, each under the run's own job directory
export const PROFILE_LIST_FILENAME = 'multi_md_foxs_files.txt'

type CombinedJobDoc = {
  _id: { toString: () => string }
  __t?: string
  uuid: string
  title?: string
  status: string
  md_engine?: MDEngine
}

// Profiles per run in the pooled list: lines whose path holds the run's uuid
// as a directory
export const countConformations = (
  list: string,
  uuids: string[]
): Record<string, number> => {
  const counts: Record<string, number> = Object.fromEntries(
    uuids.map((uuid) => [uuid, 0])
  )
  for (const line of list.split('\n')) {
    if (!line.trim()) continue
    const uuid = uuids.find((id) => line.includes(`/${id}/`))
    if (uuid) counts[uuid] = (counts[uuid] ?? 0) + 1
  }
  return counts
}

// undefined until the worker has written the list
const readConformationCounts = async (
  multiJob: IMultiJob
): Promise<Record<string, number> | undefined> => {
  const listFile = path.join(
    getEnvVar('DATA_VOL'),
    multiJob.uuid,
    PROFILE_LIST_FILENAME
  )
  try {
    const list = await fs.readFile(listFile, 'utf8')
    return countConformations(list, multiJob.bilbomd_uuids)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.warn(`Cannot read ${listFile}: ${String(error)}`)
    }
    return undefined
  }
}

// The Multi job's owner id, whether `user` is populated or a bare ref
const ownerId = (multiJob: IMultiJob): unknown => {
  const user = multiJob.user as unknown
  if (user && typeof user === 'object' && '_id' in user) {
    return (user as { _id: unknown })._id
  }
  return user
}

// A summary of each run the Multi job combines, in bilbomd_uuids order.
// A Multi job can name any run's uuid, so a run's details (title, id, status,
// engine) are shown only for runs its owner owns, unless the viewer is an
// Admin or Manager, who may see every job. Other runs, and runs deleted
// since, keep their uuid (and conformation count, which comes from the Multi
// job's own files) only.
export const buildCombinedJobs = async (
  multiJob: IMultiJob,
  { privileged = false }: { privileged?: boolean } = {}
): Promise<MultiCombinedJobDTO[]> => {
  const owner = ownerId(multiJob)
  const filter = privileged
    ? { uuid: { $in: multiJob.bilbomd_uuids } }
    : { uuid: { $in: multiJob.bilbomd_uuids }, 'user._id': owner }
  const [docs, counts] = await Promise.all([
    privileged || owner
      ? Job.find(filter)
          .select('uuid title status md_engine __t')
          .lean<CombinedJobDoc[]>()
          .exec()
      : Promise.resolve([] as CombinedJobDoc[]),
    readConformationCounts(multiJob)
  ])
  const byUuid = new Map(docs.map((doc) => [doc.uuid, doc]))

  return multiJob.bilbomd_uuids.map((uuid) => {
    const doc = byUuid.get(uuid)
    const conformations = counts?.[uuid]
    return {
      uuid,
      ...(doc && {
        id: doc._id.toString(),
        title: doc.title,
        jobType: mapDiscriminatorToJobType(doc.__t),
        status: mapStatus(doc.status),
        md_engine: doc.md_engine
      }),
      ...(conformations !== undefined && { conformations })
    }
  })
}
