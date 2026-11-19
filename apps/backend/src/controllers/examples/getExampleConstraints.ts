import type { Request, Response } from 'express'
import path from 'path'
import fs from 'fs-extra'
import {
  importConstraintsFromConstInp,
  validateConstraintsInput,
  type ConstraintMode,
  type MDConstraintsDTO
} from '@bilbomd/bilbomd-types'
import { logger } from '../../middleware/loggers.js'
import { chainMolTypesOf, readStructure } from '../jobs/utils/constraints.js'

export type ClassicExampleKey = 'pdb' | 'crd'

interface ClassicExample {
  /** Folder under EXAMPLE_DATA, as used by applyExampleDataIfRequested */
  folder: string
  structure: string
  mode: ConstraintMode
  // The Classic form ties the engine to the mode
  engine: 'charmm' | 'openmm'
}

const classicExamples: Record<ClassicExampleKey, ClassicExample> = {
  pdb: {
    folder: 'pdb',
    structure: 'example.pdb',
    mode: 'pdb',
    engine: 'openmm'
  },
  crd: {
    folder: 'crd',
    structure: 'example.psf',
    mode: 'crd_psf',
    engine: 'charmm'
  }
}

const exampleRoot = () =>
  process.env.EXAMPLE_DATA && process.env.EXAMPLE_DATA.trim() !== ''
    ? process.env.EXAMPLE_DATA
    : '/app/examples'

/**
 * Reads a Classic example's own const.inp against its structure, the same
 * way an example job does (materializeConstraints), so the form shows the
 * constraints the job will store as md_constraints.
 */
export const loadClassicExampleConstraints = async (
  key: ClassicExampleKey
): Promise<MDConstraintsDTO> => {
  const example = classicExamples[key]
  const dir = path.join(exampleRoot(), example.folder)
  const [text, segments] = await Promise.all([
    fs.readFile(path.join(dir, 'example-const.inp'), 'utf8'),
    readStructure(path.join(dir, example.structure))
  ])

  const imported = importConstraintsFromConstInp(text, example.mode, {
    structure: segments
  })
  if (!imported.input || imported.problems.length > 0) {
    throw new Error(
      `Example constraints did not import: ${imported.problems.join('; ')}`
    )
  }
  const result = validateConstraintsInput(imported.input, {
    mode: example.mode,
    segments,
    engine: example.engine
  })
  if (!result.ok) {
    throw new Error(
      `Example constraints are not valid: ${result.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join('; ')}`
    )
  }
  return {
    ...result.constraints,
    chain_mol_types: chainMolTypesOf(segments)
  }
}

// The example files only change with a new image, so each is read once.
// A failed read is not kept, so it is tried again on the next request.
const cache = new Map<ClassicExampleKey, Promise<MDConstraintsDTO>>()

const cachedConstraints = (key: ClassicExampleKey) => {
  let pending = cache.get(key)
  if (!pending) {
    pending = loadClassicExampleConstraints(key)
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}

/** Test hook: forget the cached examples */
export const clearExampleConstraintsCache = () => cache.clear()

const sendExampleConstraints =
  (key: ClassicExampleKey) => async (_req: Request, res: Response) => {
    try {
      const md_constraints = await cachedConstraints(key)
      return res.json({ md_constraints })
    } catch (error) {
      logger.error(`Example constraints for ${key} unavailable: ${error}`)
      return res
        .status(404)
        .json({ message: 'Example constraints are not available' })
    }
  }

export const getClassicPdbExampleConstraints = sendExampleConstraints('pdb')
export const getClassicCrdExampleConstraints = sendExampleConstraints('crd')
