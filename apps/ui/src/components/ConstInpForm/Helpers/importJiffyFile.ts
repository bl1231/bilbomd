import { parse as parseYaml } from 'yaml'
import {
  importConstraintsFromData,
  readConstInp,
  type ConstraintSegmentInput
} from '@bilbomd/bilbomd-types'
import type { Chain, RigidBody, RigidDomain } from 'types/interfaces'
import { importConstInp, type ConstInpImport } from './importConstInp'

/** The constraints files the jiffy can start from */
export const JIFFY_FILE_ACCEPT = '.inp,.txt,.yml,.yaml,.json'

/** YAML and JSON go by the file extension; anything else is a const.inp */
export const isDataFile = (fileName: string) =>
  /\.(ya?ml|json)$/i.test(fileName)

type Parsed = { ok: true; data: unknown } | { ok: false }

const parseData = (text: string): Parsed => {
  try {
    // YAML reads JSON too
    return { ok: true, data: parseYaml(text, { maxAliasCount: 0 }) }
  } catch {
    return { ok: false }
  }
}

const rangeOf = ({ residues }: ConstraintSegmentInput) =>
  residues ? `residues ${residues.start}–${residues.stop}` : 'the whole chain'

/**
 * Turns an OpenMM constraints YAML or constraints JSON (openmm_const.yml,
 * openmm_config.yaml, bilbomd_job.json, the API's `constraints`) into the
 * jiffy's rigid bodies for the uploaded PDB. It is read the way the job
 * forms read it; the fixed body becomes PRIMARY and each rigid body a RIGID
 * n. As for a const.inp, segments on a chain the PDB doesn't have are dropped
 * and ranges outside a chain are kept for the next step to flag, each with a
 * note. Null when the file holds no usable fixed body.
 */
const importConstraintsData = (
  text: string,
  chains: Chain[]
): ConstInpImport | null => {
  const parsed = parseData(text)
  if (!parsed.ok) return null
  const imported = importConstraintsFromData(parsed.data, 'pdb')
  if (!imported.input) return null
  const notes = [
    ...imported.problems.map((p) => `Not imported: ${p}`),
    ...imported.notes
  ]

  const toDomains = (segments: ConstraintSegmentInput[]): RigidDomain[] =>
    segments.flatMap((segment) => {
      const chain = chains.find((c) => c.id === segment.chain_id)
      if (!chain) {
        notes.push(
          `Chain ${segment.chain_id ?? segment.segid} is not in the PDB, so ${rangeOf(segment)} was left out.`
        )
        return []
      }
      // No residues selects the whole chain
      const { start, stop } = segment.residues ?? {
        start: chain.first_res,
        stop: chain.last_res
      }
      if (start < chain.first_res || stop > chain.last_res) {
        notes.push(
          `Residues ${start}–${stop} on chain ${chain.id} are outside the ` +
            `PDB's residues ${chain.first_res}–${chain.last_res}. Fix them in ` +
            'the next step.'
        )
      }
      return [{ chainid: chain.id, start, end: stop }]
    })

  const primary: RigidBody = {
    id: 'PRIMARY',
    domains: toDomains(
      imported.input.fixed_bodies.flatMap((body) => body.segments)
    )
  }
  if (primary.domains.length === 0) {
    notes.push(
      'No fixed segments were imported. Add at least one to PRIMARY in the next step.'
    )
  }
  const rigid: RigidBody[] = []
  ;(imported.input.rigid_bodies ?? []).forEach((body, index) => {
    const domains = toDomains(body.segments)
    if (domains.length === 0) {
      notes.push(
        `Rigid body ${index + 1} has no segment on a chain in the PDB, so it was left out.`
      )
      return
    }
    rigid.push({ id: `RIGID ${rigid.length + 1}`, domains })
  })

  return { rigidBodies: [primary, ...rigid], notes }
}

/**
 * Starts the jiffy from an existing constraints file: a const.inp, an OpenMM
 * constraints YAML, or constraints JSON. Null when there is nothing in it to
 * start from.
 */
export const importJiffyFile = (
  text: string,
  fileName: string,
  chains: Chain[]
): ConstInpImport | null =>
  isDataFile(fileName)
    ? importConstraintsData(text, chains)
    : importConstInp(text, chains)

/**
 * Why a picked constraints file can't be started from, or null when it can.
 * Checked before the PDB is read, so only the file itself.
 */
export const constraintsFileProblem = (
  text: string,
  fileName: string
): string | null => {
  if (isDataFile(fileName)) {
    const parsed = parseData(text)
    if (!parsed.ok) return 'The file could not be read as YAML or JSON.'
    const imported = importConstraintsFromData(parsed.data, 'pdb')
    return imported.input ? null : 'No fixed body could be read from this file.'
  }
  const { fixed_bodies, rigid_bodies } = readConstInp(text)
  return fixed_bodies.length + rigid_bodies.length > 0
    ? null
    : 'No fixed or rigid bodies could be read from this file.'
}
