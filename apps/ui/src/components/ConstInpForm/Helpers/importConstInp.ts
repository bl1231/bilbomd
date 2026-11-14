import {
  readConstInp,
  segidToChainId,
  type ConstInpSelection
} from '@bilbomd/bilbomd-types'
import type { Chain, RigidBody, RigidDomain } from 'types/interfaces'
import { jiffySegid } from './constInpText'

export interface ConstInpImport {
  /** PRIMARY (fixed) first, then RIGID 1, RIGID 2, … */
  rigidBodies: RigidBody[]
  /** What the user should know: what was left out or doesn't match the PDB */
  notes: string[]
}

const range = ({ residues }: ConstInpSelection) =>
  residues ? `resid ${residues.start}:${residues.stop}` : 'the whole segment'

// A lowercase chain ID is written uppercased after a prefix ending in 'L':
// the jiffy does this for every type (PRLA = protein chain 'a'), pdb2crd for
// carbohydrates (CALG = carbohydrate chain 'g')
const LOWERCASE_CHAIN_PREFIXES: Record<string, string> = {
  PRL: 'PRO',
  DNL: 'DNA',
  RNL: 'RNA',
  CAL: 'CAR'
}
const MOL_TYPES = ['PRO', 'DNA', 'RNA', 'CAR']

/**
 * The chain ID and molecule type a segid names, read from the segid alone:
 * PROA → A (PRO), PROa → a (PRO), PRLA → a (PRO), DNLB → b (DNA),
 * CALG → g (CAR). Null for segids in no known form, such as HETA.
 */
export const decodeSegid = (
  segid: string
): { chainId: string; type: string } | null => {
  const prefix = segid.slice(0, 3)
  const rest = segid.slice(3)
  if (!rest) return null
  const lowercaseType = LOWERCASE_CHAIN_PREFIXES[prefix]
  if (lowercaseType) return { chainId: rest.toLowerCase(), type: lowercaseType }
  if (MOL_TYPES.includes(prefix)) return { chainId: rest, type: prefix }
  return null
}

/**
 * The PDB chain a const.inp segid selects: by the chain ID the segid names,
 * whatever molecule type it claims, or else by the segid the jiffy would
 * write for a chain (OTHERA for a chain of type Other).
 */
const findChain = (segid: string, chains: Chain[]): Chain | undefined => {
  const decoded = decodeSegid(segid)
  if (decoded) return chains.find((c) => c.id === decoded.chainId)
  return (
    chains.find((c) => jiffySegid(c.id, chains) === segid) ??
    chains.find((c) => c.id === segidToChainId(segid))
  )
}

/**
 * Turns an existing const.inp into the jiffy's rigid bodies for the uploaded
 * PDB, so the user can edit it instead of starting over.
 *
 * Every fixed selection goes into PRIMARY and every 'shape desc' becomes its
 * own rigid body. Selections on a chain the PDB doesn't have are dropped;
 * ranges outside a chain are kept for the next step's checks to flag. Each
 * thing that was left out or doesn't match the PDB gets a note. Returns null
 * when the file has no fixed or rigid body at all, so there is nothing to
 * start from.
 */
export const importConstInp = (
  text: string,
  chains: Chain[]
): ConstInpImport | null => {
  const report = readConstInp(text)
  if (report.fixed_bodies.length + report.rigid_bodies.length === 0) {
    return null
  }
  const notes: string[] = []

  const toDomains = (selections: ConstInpSelection[]): RigidDomain[] =>
    selections.flatMap((sel) => {
      const chain = findChain(sel.segid, chains)
      if (!chain) {
        notes.push(
          `segid ${sel.segid} matches no chain in the PDB, so ${range(sel)} was left out.`
        )
        return []
      }
      const claimed = decodeSegid(sel.segid)?.type
      if (claimed && claimed !== chain.type) {
        notes.push(
          `segid ${sel.segid} says chain ${chain.id} is ${claimed}, but in ` +
            `the PDB it is ${chain.type}. The new file uses ` +
            `${jiffySegid(chain.id, chains)}.`
        )
      }
      // A whole-segment selection ('segid HETA') covers the whole chain
      const { start, stop } = sel.residues ?? {
        start: chain.first_res,
        stop: chain.last_res
      }
      if (start < chain.first_res || stop > chain.last_res) {
        notes.push(
          `${range(sel)} on chain ${chain.id} is outside the PDB's residues ` +
            `${chain.first_res}–${chain.last_res}. Fix it in the next step.`
        )
      }
      return [{ chainid: chain.id, start, end: stop }]
    })

  if (report.fixed_bodies.length > 1) {
    notes.push(
      `The file has ${report.fixed_bodies.length} 'cons fix' commands. ` +
        'All their segments were put in the PRIMARY (fixed) body.'
    )
  }
  const primary: RigidBody = {
    id: 'PRIMARY',
    domains: toDomains(report.fixed_bodies.flatMap((b) => b.selections))
  }
  if (primary.domains.length === 0) {
    notes.push(
      'No fixed segments were imported. Add at least one to PRIMARY in the next step.'
    )
  }

  const rigid: RigidBody[] = []
  report.rigid_bodies.forEach((body, index) => {
    const domains = toDomains(body.selections)
    if (domains.length === 0) {
      notes.push(
        `Rigid body ${index + 1} has no segment on a chain in the PDB, so it was left out.`
      )
      return
    }
    rigid.push({ id: `RIGID ${rigid.length + 1}`, domains })
  })

  report.skipped.forEach((line) =>
    notes.push(`Not imported (the jiffy can't read this command): ${line}`)
  )
  report.undefined_names.forEach((name) =>
    notes.push(
      `'${name}' is used before any define sets it, so it was ignored.`
    )
  )

  return { rigidBodies: [primary, ...rigid], notes }
}

/**
 * A rigid-body ID not already in use: 'RIGID n' with n one more than the
 * highest so far. Counting bodies instead would reuse an ID after a delete,
 * and the overlap checks tell bodies apart by ID.
 */
export const nextRigidBodyId = (rigidBodies: RigidBody[]): string => {
  const numbers = rigidBodies.map((rb) => {
    const match = rb.id.match(/^RIGID (\d+)$/)
    return match ? Number(match[1]) : 0
  })
  return `RIGID ${Math.max(0, ...numbers) + 1}`
}
