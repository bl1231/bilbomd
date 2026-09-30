import path from 'path'
import multer from 'multer'

// Hard ceiling enforced while the request is streaming, before anything is
// validated. Per-field limits (e.g. 2 MB for *.dat) are still applied later by
// the yup schemas; this cap only has to cover the largest one we accept, which
// is the 120 MB AlphaFold PAE *.json (see validation/autoJobSchema.ts).
export const MAX_UPLOAD_FILE_SIZE = 120_000_000

const UPLOAD_LIMITS = {
  files: 10,
  fields: 50,
  fieldSize: 1_000_000,
  parts: 60
}

type FilenameFn = (file: Express.Multer.File) => string

interface CreateUploadOptions {
  destination: string
  filename?: FilenameFn
  maxFileSize?: number
}

// busboy already strips client-supplied directories from upload names;
// basename again so the saved file can never land outside `destination`.
const defaultFilename: FilenameFn = (file) =>
  path.basename(file.originalname.replace(/\\/g, '/')).toLowerCase()

export const createUpload = ({
  destination,
  filename = defaultFilename,
  maxFileSize = MAX_UPLOAD_FILE_SIZE
}: CreateUploadOptions) =>
  multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, destination),
      filename: (req, file, cb) => cb(null, filename(file))
    }),
    limits: { ...UPLOAD_LIMITS, fileSize: maxFileSize }
  })

interface UploadErrorResponse {
  status: number
  message: string
}

export const getUploadErrorResponse = (err: unknown): UploadErrorResponse => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const which = err.field ? `File ${err.field}` : 'File'
      return {
        status: 413,
        message: `${which} exceeds the maximum upload size`
      }
    }
    return { status: 400, message: `File upload error: ${err.message}` }
  }
  return { status: 500, message: 'Failed to upload one or more files' }
}
