import fs from 'fs-extra'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  IMDConstraints,
  IFixedBody,
  IRigidBody,
  IChainMolType,
  ChainMolType
} from '@bilbomd/mongodb-schema'
import {
  PROTEIN_RESIDUES,
  DNA_RESIDUES,
  RNA_RESIDUES,
  CARBOHYDRATE_RESIDUES,
  constInpLengthMessage,
  duplicateShapeNamesMessage,
  findDisallowedConstInpLine,
  joinConstInpLines,
  parseConstInp,
  SEGID_MOL_TYPE_PREFIXES,
  wrapConstInpCommand
} from '@bilbomd/bilbomd-types'
import type { Logger } from './index.js'

// Create a default no-op logger for when none is provided
const defaultLogger: Logger = {
  info: () => {},
  error: () => {},
  debug: () => {},
  warn: () => {}
}

/**
 * Extracts constraints from YAML content, handling both wrapped and unwrapped formats
 */
export function extractConstraintsFromYaml(
  yamlContent: string
): IMDConstraints {
  const parsed = parseYaml(yamlContent)

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid YAML format')
  }

  // Handle both wrapped and unwrapped formats
  if ('constraints' in parsed && parsed.constraints) {
    return parsed.constraints as IMDConstraints
  } else {
    return parsed as IMDConstraints
  }
}

function classifyResidue(name: string): ChainMolType | null {
  if (PROTEIN_RESIDUES.has(name)) return 'PRO'
  if (DNA_RESIDUES.has(name)) return 'DNA'
  if (RNA_RESIDUES.has(name)) return 'RNA'
  if (CARBOHYDRATE_RESIDUES.has(name)) return 'CAR'
  return null
}

/**
 * Reads a PDB file and returns each chain's molecule type, classifying a chain
 * by its first recognized residue the same way pdb2crd.py does. Chains with no
 * recognized residue are left out.
 */
export async function buildChainMolTypes(
  pdbFilePath: string
): Promise<IChainMolType[]> {
  const content = await fs.readFile(pdbFilePath, 'utf8')
  const chainFirstType: Record<string, ChainMolType> = {}

  for (const line of content.split('\n')) {
    if (!line.startsWith('ATOM') && !line.startsWith('HETATM')) continue
    const chainId = line[21]
    if (!chainId || chainId === ' ') continue
    if (chainId in chainFirstType) continue

    const resName = line.slice(17, 20).trim()
    const molType = classifyResidue(resName)
    if (molType) {
      chainFirstType[chainId] = molType
    }
  }

  return Object.entries(chainFirstType).map(([chain_id, mol_type]) => ({
    chain_id,
    mol_type
  }))
}

/**
 * Reads a PDB file and returns a map of chain_id → CHARMM segid, mirroring
 * pdb2crd.py's naming convention ({MOL_TYPE}{chain_id}).
 * Used when converting YAML constraints → CHARMM INP so that DNA/RNA chains
 * get the correct segid (e.g. "DNAD") rather than defaulting to "PROD".
 */
export async function buildChainSegidMap(
  pdbFilePath: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const { chain_id, mol_type } of await buildChainMolTypes(pdbFilePath)) {
    result[chain_id] = `${mol_type}${chain_id}`
  }
  return result
}

/**
 * Reads each chain's molecule type from the pdb2crd-style segids in a CHARMM
 * INP constraint file (e.g. "DNAD" → chain D is DNA). For jobs with no PDB to
 * classify. Segids without a known prefix are left out.
 */
export async function buildChainMolTypesFromInp(
  inpFilePath: string
): Promise<IChainMolType[]> {
  const inpContent = await fs.readFile(inpFilePath, 'utf8')
  const content = joinConstInpLines(inpContent)
    .filter((line) => !/^\s*[!*]/.test(line))
    .join('\n')
  const chainTypes: Record<string, ChainMolType> = {}

  for (const [, segid] of content.matchAll(/\bsegid\s+(\w+)/gi)) {
    const prefix = SEGID_MOL_TYPE_PREFIXES.find(
      (pfx) => segid.startsWith(pfx) && segid.length > pfx.length
    )
    if (!prefix) continue
    const chainId = segid.slice(prefix.length)
    // CAL is pdb2crd's carbohydrate prefix for lowercase chain IDs
    chainTypes[chainId] ??= prefix === 'CAL' ? 'CAR' : prefix
  }

  return Object.entries(chainTypes).map(([chain_id, mol_type]) => ({
    chain_id,
    mol_type
  }))
}

/**
 * Converts CHARMM INP constraint file to YAML format for OpenMM
 */
export async function convertInpToYaml(
  inpFilePath: string,
  logger: Logger = defaultLogger
): Promise<string> {
  try {
    const inpContent = await fs.readFile(inpFilePath, 'utf8')
    const constraints = parseConstInp(inpContent)

    // Wrap constraints under 'constraints' key for OpenMM config compatibility
    const wrappedConstraints = {
      constraints
    }

    const yamlContent = stringifyYaml(wrappedConstraints, {
      indent: 2,
      lineWidth: 0 // No line wrapping
    })

    logger.info('Successfully converted INP to YAML')
    return yamlContent
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error converting INP to YAML: ${error}`)
    throw new Error(`Failed to convert INP to YAML: ${errorMessage}`, {
      cause: error
    })
  }
}

/**
 * Converts YAML constraint file to CHARMM INP format.
 *
 * @param chainSegidMap - Optional map of chain_id → CHARMM segid (e.g. {"D": "DNAD", "P": "PROP"}).
 *   Build this from the PDB file when chains include DNA/RNA so that the generated
 *   segids match what pdb2crd will produce.  Without it, all chains are assumed to
 *   be protein (segid = "PRO" + chain_id).
 */
export async function convertYamlToInp(
  yamlFilePath: string,
  logger: Logger = defaultLogger,
  chainSegidMap?: Record<string, string>
): Promise<string> {
  try {
    const yamlContent = await fs.readFile(yamlFilePath, 'utf8')
    const parsed = parseYaml(yamlContent)

    // Handle both wrapped and unwrapped formats
    let constraints: IMDConstraints
    if (
      parsed &&
      typeof parsed === 'object' &&
      'constraints' in parsed &&
      parsed.constraints
    ) {
      constraints = parsed.constraints as IMDConstraints
    } else {
      constraints = parsed as IMDConstraints
    }

    const inpContent = generateInpFromConstraints(constraints, chainSegidMap)

    logger.info('Successfully converted YAML to INP')
    return inpContent
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error converting YAML to INP: ${error}`)
    throw new Error(`Failed to convert YAML to INP: ${errorMessage}`, {
      cause: error
    })
  }
}

/**
 * Validates YAML constraint file format
 */
export async function validateYamlConstraints(
  yamlFilePath: string,
  logger: Logger = defaultLogger
): Promise<void> {
  try {
    const yamlContent = await fs.readFile(yamlFilePath, 'utf8')
    const parsed = parseYaml(yamlContent)

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid YAML constraint format')
    }

    // Handle both wrapped and unwrapped formats
    let constraints: IMDConstraints
    if ('constraints' in parsed && parsed.constraints) {
      constraints = parsed.constraints as IMDConstraints
    } else {
      constraints = parsed as IMDConstraints
    }

    // Validate structure
    const { fixed_bodies, rigid_bodies } = constraints

    if (fixed_bodies) {
      validateConstraintBodies(fixed_bodies, 'fixed_bodies')
    }

    if (rigid_bodies) {
      validateConstraintBodies(rigid_bodies, 'rigid_bodies')
    }

    if (!fixed_bodies && !rigid_bodies) {
      throw new Error('No constraint bodies found in YAML file')
    }

    assertNoRigidBodyOverlaps(constraints)
    assertNoFixedRigidOverlaps(constraints)

    logger.info('YAML constraints file validated successfully')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error validating YAML constraints: ${error}`)
    throw new Error(`Invalid YAML constraints file: ${errorMessage}`, {
      cause: error
    })
  }
}

/**
 * Validates INP constraint file format
 */
export async function validateInpConstraints(
  inpFilePath: string,
  logger: Logger = defaultLogger
): Promise<void> {
  try {
    const inpContent = await fs.readFile(inpFilePath, 'utf8')

    if (!inpContent.trim()) {
      throw new Error('Empty INP constraint file')
    }

    // One entry per command, with '-' continuation lines joined as CHARMM
    // reads them
    const lines = joinConstInpLines(inpContent).filter((line: string) =>
      line.trim()
    )

    // Allowlist check: reject any command that doesn't start with a permitted
    // keyword. Uses the same check as the job forms and the backend upload
    // check to block CHARMM directives like 'system', 'open', 'read', etc. that
    // could execute OS commands or perform file I/O.
    const disallowed = findDisallowedConstInpLine(inpContent)
    if (disallowed !== null) {
      throw new Error(`Disallowed keyword in constraint file: "${disallowed}"`)
    }

    const tooLong = constInpLengthMessage(inpContent)
    if (tooLong !== null) {
      throw new Error(tooLong)
    }

    // Check for required CHARMM commands (skip comment lines)
    const nonCommentLines = lines.filter((line: string) => {
      const t = line.trim()
      return !t.startsWith('!') && !t.startsWith('*')
    })

    const hasDefine = nonCommentLines.some((line: string) =>
      line.toLowerCase().includes('define')
    )
    const hasConstraint = nonCommentLines.some(
      (line: string) =>
        line.toLowerCase().includes('cons fix') ||
        line.toLowerCase().includes('shape desc')
    )

    if (!hasDefine) {
      throw new Error('INP file must contain at least one "define" statement')
    }

    if (!hasConstraint) {
      throw new Error(
        'INP file must contain at least one constraint command ("cons fix" or "shape desc")'
      )
    }

    const duplicateShapes = duplicateShapeNamesMessage(inpContent)
    if (duplicateShapes !== null) {
      throw new Error(duplicateShapes)
    }

    // Rigid bodies are numbered in the order of the 'shape desc' lines
    const parsed = parseConstInp(inpContent)
    assertNoRigidBodyOverlaps(parsed)
    assertNoFixedRigidOverlaps(parsed)

    logger.info('INP constraints file validated successfully')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error validating INP constraints: ${error}`)
    throw new Error(`Invalid INP constraints file: ${errorMessage}`, {
      cause: error
    })
  }
}

/**
 * Lists every place where two rigid bodies share residues. OpenMM turns most
 * atoms of a rigid body into virtual sites tied to that body, so an atom in two
 * rigid bodies makes the simulation fail ("Virtual site has nonzero mass").
 * Residue ranges are inclusive, as in the OpenMM scripts.
 */
export const findRigidBodyOverlaps = (
  constraints: IMDConstraints
): string[] => {
  const bodies = constraints.rigid_bodies ?? []
  const overlaps: string[] = []

  bodies.forEach((a, i) => {
    bodies.slice(i + 1).forEach((b) => {
      for (const sa of a.segments ?? []) {
        for (const sb of b.segments ?? []) {
          if (sa.chain_id !== sb.chain_id) continue
          const start = Math.max(sa.residues.start, sb.residues.start)
          const stop = Math.min(sa.residues.stop, sb.residues.stop)
          if (start <= stop) {
            overlaps.push(
              `${a.name} and ${b.name} both include chain ${sa.chain_id} residues ${start}-${stop}`
            )
          }
        }
      }
    })
  })

  return overlaps
}

/**
 * Throws if any residue belongs to more than one rigid body.
 */
export const assertNoRigidBodyOverlaps = (
  constraints: IMDConstraints
): void => {
  const overlaps = findRigidBodyOverlaps(constraints)
  if (overlaps.length > 0) {
    throw new Error(
      `Rigid bodies must not overlap: ${overlaps.join('; ')}. ` +
        'A residue can belong to only one rigid body. Merge the overlapping ' +
        'rigid bodies into one, or remove the shared residues from one of them.'
    )
  }
}

/**
 * Lists every place where a fixed body and a rigid body share residues. Such
 * a residue would be both held in place and moved with the rigid body, which
 * is never what a constraint file means. OpenMM runs it anyway, so this is an
 * upload check, not a worker one. Residue ranges are inclusive.
 */
export const findFixedRigidOverlaps = (
  constraints: IMDConstraints
): string[] => {
  const overlaps: string[] = []
  for (const fixed of constraints.fixed_bodies ?? []) {
    for (const rigid of constraints.rigid_bodies ?? []) {
      for (const sf of fixed.segments ?? []) {
        for (const sr of rigid.segments ?? []) {
          if (sf.chain_id !== sr.chain_id) continue
          const start = Math.max(sf.residues.start, sr.residues.start)
          const stop = Math.min(sf.residues.stop, sr.residues.stop)
          if (start <= stop) {
            overlaps.push(
              `${fixed.name} and ${rigid.name} both include chain ${sf.chain_id} residues ${start}-${stop}`
            )
          }
        }
      }
    }
  }
  return overlaps
}

/**
 * Throws if any residue is in both a fixed body and a rigid body.
 */
export const assertNoFixedRigidOverlaps = (
  constraints: IMDConstraints
): void => {
  const overlaps = findFixedRigidOverlaps(constraints)
  if (overlaps.length > 0) {
    throw new Error(
      `Fixed and rigid bodies must not overlap: ${overlaps.join('; ')}. ` +
        'A residue is either held in place (fixed) or moves with one rigid ' +
        'body. Remove the shared residues from one of them.'
    )
  }
}

// Helper function to validate constraint bodies structure
function validateConstraintBodies(
  bodies: IFixedBody[] | IRigidBody[],
  type: string
): void {
  if (!Array.isArray(bodies)) {
    throw new Error(`${type} must be an array`)
  }

  for (const body of bodies) {
    if (!body.name || typeof body.name !== 'string') {
      throw new Error(`Each ${type} entry must have a valid name`)
    }

    if (!body.segments || !Array.isArray(body.segments)) {
      throw new Error(`Each ${type} entry must have a segments array`)
    }

    for (const segment of body.segments) {
      if (!segment.chain_id || typeof segment.chain_id !== 'string') {
        throw new Error(`Each segment must have a valid chain_id`)
      }

      if (!segment.residues || typeof segment.residues !== 'object') {
        throw new Error(`Each segment must have a residues object`)
      }

      if (
        typeof segment.residues.start !== 'number' ||
        typeof segment.residues.stop !== 'number'
      ) {
        throw new Error(`Residues must have numeric start and stop values`)
      }

      if (segment.residues.start > segment.residues.stop) {
        throw new Error(`Residue start must be less than or equal to stop`)
      }
    }
  }
}

// Helper function to generate INP from constraints object. Long 'cons fix' and
// 'shape desc' commands are wrapped, since CHARMM cuts lines over 200 characters
function generateInpFromConstraints(
  constraints: IMDConstraints,
  chainSegidMap?: Record<string, string>
): string {
  const lines: string[] = ['! Generated constraint file']
  let defCounter = 1

  const { fixed_bodies, rigid_bodies } = constraints

  const resolveSegid = (chain_id: string): string =>
    chainSegidMap?.[chain_id] ?? `PRO${chain_id}`

  // Generate definitions and fixed constraints
  if (fixed_bodies && fixed_bodies.length > 0) {
    const defNames: string[] = []

    for (const body of fixed_bodies) {
      for (const segment of body.segments) {
        const segid = resolveSegid(segment.chain_id)
        const defName = `fixed${defCounter++}`

        lines.push(
          `define ${defName} sele ( resid ${segment.residues.start}:${segment.residues.stop} .and. segid ${segid} ) end`
        )
        defNames.push(defName)
      }
    }

    if (defNames.length > 0) {
      lines.push(
        ...wrapConstInpCommand(`cons fix sele ${defNames.join(' .or. ')} end`)
      )
      lines.push('')
    }
  }

  // Generate rigid body constraints
  if (rigid_bodies && rigid_bodies.length > 0) {
    let dockCounter = 1

    for (const body of rigid_bodies) {
      const defNames: string[] = []

      for (const segment of body.segments) {
        const segid = resolveSegid(segment.chain_id)
        const defName = `rigid${defCounter++}`

        lines.push(
          `define ${defName} sele ( resid ${segment.residues.start}:${segment.residues.stop} .and. segid ${segid} ) end`
        )
        defNames.push(defName)
      }

      if (defNames.length > 0) {
        lines.push(
          ...wrapConstInpCommand(
            `shape desc dock${dockCounter++} rigid sele ${defNames.join(' .or. ')} end`
          )
        )
        lines.push('')
      }
    }
  }

  lines.push('return')

  return lines.join('\n') + '\n' // Add trailing newline
}
