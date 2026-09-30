import fs from 'fs-extra'
import path from 'path'
import { Request } from 'express'
import { Types } from 'mongoose'
import { Job, IUser } from '@bilbomd/mongodb-schema'
import { logger } from '../../../middleware/loggers.js'
import { config } from '../../../config/config.js'
import { setServerFile, ServerFileField } from './serverFiles.js'

const PRIVILEGED_ROLES = ['Admin', 'Manager']

// Form field name -> Job document field holding that file's name
const REUSABLE_FILES: Record<ServerFileField, string> = {
  pdb_file: 'pdb_file',
  crd_file: 'crd_file',
  psf_file: 'psf_file',
  inp_file: 'const_inp_file',
  dat_file: 'data_file',
  pae_file: 'pae_file'
}

type ResubmissionResult =
  { ok: true } | { ok: false; status: number; message: string }

const isTrue = (value: unknown) => value === true || value === 'true'

const isResubmitRequest = (req: Request) => isTrue(req.body.resubmit)

// Copies the original job's files that the resubmit form asked to reuse
// (`reuse_<field>=true`) into the new job directory and registers them as
// server files, so the job handlers treat them exactly like example-data
// files and run the same validation and constraint processing
// as a fresh submission. A newly uploaded file always wins over reuse.
const prepareResubmission = async (
  req: Request,
  user: IUser | undefined,
  jobDir: string
): Promise<ResubmissionResult> => {
  if (!isResubmitRequest(req)) return { ok: true }

  const originalJobId: unknown = req.body.original_job_id
  if (
    typeof originalJobId !== 'string' ||
    !Types.ObjectId.isValid(originalJobId)
  ) {
    return { ok: false, status: 400, message: 'Invalid original job ID' }
  }
  if (!user) {
    return {
      ok: false,
      status: 403,
      message: 'Resubmitting a job requires a signed-in user'
    }
  }

  const originalJob = await Job.findById(originalJobId)
  const isPrivileged = (user.roles ?? []).some((role) =>
    PRIVILEGED_ROLES.includes(role)
  )
  const ownerId = originalJob?.user?._id?.toString()
  if (!originalJob || (!isPrivileged && ownerId !== user._id.toString())) {
    return { ok: false, status: 404, message: 'Original job not found' }
  }

  const originalDir = path.join(config.uploadDir, originalJob.uuid)
  const uploads = req.files as Record<string, Express.Multer.File[]> | undefined

  for (const [field, jobField] of Object.entries(REUSABLE_FILES) as [
    ServerFileField,
    string
  ][]) {
    if (uploads?.[field]?.length) continue
    if (!isTrue(req.body[`reuse_${field}`])) continue

    const storedName: unknown = originalJob.get(jobField)
    if (typeof storedName !== 'string' || storedName.length === 0) {
      return {
        ok: false,
        status: 400,
        message: `The original job has no ${field} to reuse`
      }
    }

    const fileName = path.basename(storedName)
    const source = path.join(originalDir, fileName)
    if (!(await fs.pathExists(source))) {
      return {
        ok: false,
        status: 410,
        message: `The original ${fileName} is no longer available. Please upload it again.`
      }
    }

    await fs.copy(source, path.join(jobDir, fileName))
    setServerFile(req, field, fileName)
  }

  logger.info(
    `Resubmission: reused files from job ${originalJobId} in ${jobDir}`
  )
  return { ok: true }
}

export { prepareResubmission, isResubmitRequest }
