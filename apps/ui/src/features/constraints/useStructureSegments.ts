import { useEffect, useState } from 'react'
import {
  readCifSegments,
  readPdbSegments,
  readPsfSegments,
  type StructureSegment
} from '@bilbomd/bilbomd-types'

export const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsText(file)
  })

/** Segments in a structure file, read the way the server reads them */
export const segmentsFromText = (
  text: string,
  fileName: string
): StructureSegment[] => {
  const name = fileName.toLowerCase()
  if (name.endsWith('.psf')) return readPsfSegments(text)
  if (name.endsWith('.cif')) return readCifSegments(text)
  return readPdbSegments(text)
}

export type StructureState =
  | { status: 'none' }
  | { status: 'reading' }
  | { status: 'ready'; segments: StructureSegment[] }
  | { status: 'error'; message: string }

/**
 * The CHARMM segments in the structure file picked in a job form: PDB/mmCIF
 * chains (named as pdb2crd names them) or PSF segments. Uses the same readers
 * as the server, so the constraints checked here are checked the same way
 * there.
 */
export const useStructureSegments = (file: File | string): StructureState => {
  const [state, setState] = useState<StructureState>(
    file instanceof File ? { status: 'reading' } : { status: 'none' }
  )
  const [current, setCurrent] = useState<File | string>(file)

  // Reset when the file changes (during render, so there is no stale frame)
  if (current !== file) {
    setCurrent(file)
    setState(file instanceof File ? { status: 'reading' } : { status: 'none' })
  }

  useEffect(() => {
    if (!(file instanceof File)) return
    let cancelled = false
    readFileText(file)
      .then((text) => {
        if (cancelled) return
        const segments = segmentsFromText(text, file.name)
        setState(
          segments.length > 0
            ? { status: 'ready', segments }
            : {
                status: 'error',
                message:
                  'No protein, DNA, RNA or carbohydrate chains were found in this file.'
              }
        )
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', message: 'The file could not be read.' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [file])

  return state
}
