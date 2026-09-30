import path from 'path'
import { Request } from 'express'
import { getFileStats } from './jobUtils.js'

export type ServerFileField =
  'pdb_file' | 'crd_file' | 'psf_file' | 'inp_file' | 'dat_file' | 'pae_file'

// Input files the server itself placed in the job directory (example data, or
// files reused by a resubmission). Kept off `req.body` so a client can never
// supply a file name that the handlers then open.
const serverFiles = new WeakMap<
  Request,
  Partial<Record<ServerFileField, string>>
>()

const isPlainFileName = (name: string) =>
  name.length > 0 &&
  name !== '.' &&
  name !== '..' &&
  path.basename(name) === name &&
  !name.includes('\\')

const setServerFile = (req: Request, field: ServerFileField, name: string) => {
  if (!isPlainFileName(name)) {
    throw new Error(`Refusing non-plain file name for ${field}: ${name}`)
  }
  serverFiles.set(req, { ...serverFiles.get(req), [field]: name })
}

// Builds the Multer-style file object handlers validate for a server-placed
// file, or undefined when the server did not place one for this field.
const serverFile = (
  req: Request,
  jobDir: string,
  field: ServerFileField
): Express.Multer.File | undefined => {
  const name = serverFiles.get(req)?.[field]
  if (!name) return undefined
  const filePath = path.join(jobDir, name)
  return {
    originalname: name,
    path: filePath,
    size: getFileStats(filePath).size
  } as Express.Multer.File
}

export { setServerFile, serverFile, isPlainFileName }
