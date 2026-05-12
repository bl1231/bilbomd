import fs from 'fs-extra'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  IMDConstraints,
  ISegment,
  IFixedBody,
  IRigidBody
} from '@bilbomd/mongodb-schema'
import {
  PROTEIN_RESIDUES,
  DNA_RESIDUES,
  RNA_RESIDUES,
  CARBOHYDRATE_RESIDUES
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

// pdb2crd assigns segids as {MOL_TYPE}{chain_id} where MOL_TYPE is one of these prefixes.
// Carbohydrates use CAR (uppercase chain) or CAL (lowercase chain).
const MOL_TYPE_PREFIXES = ['PRO', 'DNA', 'RNA', 'CAR', 'CAL'] as const

function classifyResidue(name: string): 'PRO' | 'DNA' | 'RNA' | 'CAR' | null {
  if (PROTEIN_RESIDUES.has(name)) return 'PRO'
  if (DNA_RESIDUES.has(name)) return 'DNA'
  if (RNA_RESIDUES.has(name)) return 'RNA'
  if (CARBOHYDRATE_RESIDUES.has(name)) return 'CAR'
  return null
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
  const content = await fs.readFile(pdbFilePath, 'utf8')
  const chainFirstType: Record<string, 'PRO' | 'DNA' | 'RNA' | 'CAR'> = {}

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

  const result: Record<string, string> = {}
  for (const [chainId, molType] of Object.entries(chainFirstType)) {
    result[chainId] = `${molType}${chainId}`
  }
  return result
}

/**
 * Extracts the PDB chain ID from a pdb2crd-style CHARMM segid.
 * e.g. "DNAD" → "D", "PROP" → "P", "RNAB" → "B", "CARG" → "G"
 * Falls back to the raw segid if no known prefix matches.
 */
function segidToChainId(segid: string): string {
  for (const prefix of MOL_TYPE_PREFIXES) {
    if (segid.startsWith(prefix) && segid.length > prefix.length) {
      return segid.slice(prefix.length)
    }
  }
  return segid
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
    const constraints = parseInpConstraints(inpContent)

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

    logger.info('YAML constraints file validated successfully')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error validating YAML constraints: ${error}`)
    throw new Error(`Invalid YAML constraints file: ${errorMessage}`, {
      cause: error
    })
  }
}

const ALLOWED_INP_PREFIXES = [
  'define',
  'cons fix',
  'cons harm',
  'shape desc',
  'return',
  '!',
  '*'
]

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

    const lines = inpContent.split('\n').filter((line: string) => line.trim())

    // Allowlist check: reject any line that doesn't start with a permitted keyword.
    // Mirrors the backend isValidConstInpFile check to block CHARMM directives like
    // 'system', 'open', 'read', etc. that could execute OS commands or perform file I/O.
    for (const line of lines) {
      const lower = line.trim().toLowerCase()
      if (!ALLOWED_INP_PREFIXES.some((pfx) => lower.startsWith(pfx))) {
        throw new Error(
          `Disallowed keyword in constraint file: "${line.trim()}"`
        )
      }
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

    logger.info('INP constraints file validated successfully')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error validating INP constraints: ${error}`)
    throw new Error(`Invalid INP constraints file: ${errorMessage}`, {
      cause: error
    })
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

// Helper function to parse INP constraints
function parseInpConstraints(inpContent: string): IMDConstraints {
  const lines = inpContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('!') && line !== 'return')

  const constraints: IMDConstraints = {
    fixed_bodies: [],
    rigid_bodies: []
  }

  const definitions: Record<string, { segid: string; resid: string }[]> = {}
  let fixedBodyCounter = 1
  let rigidBodyCounter = 1

  // Parse definitions
  for (const line of lines) {
    const defineMatch = line.match(
      /define\s+(\w+)\s+sele\s+\(\s*resid\s+(\d+):(\d+)\s+\.and\.\s+segid\s+(\w+)\s*\)\s+end/
    )
    if (defineMatch) {
      const [, name, startRes, endRes, segid] = defineMatch
      definitions[name] = [
        {
          segid,
          resid: `${startRes}:${endRes}`
        }
      ]
    }
  }

  // Parse fixed constraints
  for (const line of lines) {
    const fixMatch = line.match(/cons\s+fix\s+sele\s+(.+)\s+end/)
    if (fixMatch) {
      const selectionExpr = fixMatch[1]
      const segments = parseSelectionExpression(selectionExpr, definitions)

      if (segments.length > 0) {
        constraints.fixed_bodies!.push({
          name: `FixedBody${fixedBodyCounter++}`,
          segments
        })
      }
    }
  }

  // Parse rigid constraints
  for (const line of lines) {
    const rigidMatch = line.match(
      /shape\s+desc\s+\w+\s+rigid\s+sele\s+(.+)\s+end/
    )
    if (rigidMatch) {
      const selectionExpr = rigidMatch[1]
      const segments = parseSelectionExpression(selectionExpr, definitions)

      if (segments.length > 0) {
        constraints.rigid_bodies!.push({
          name: `RigidBody${rigidBodyCounter++}`,
          segments
        })
      }
    }
  }

  return constraints
}

// Helper function to parse selection expressions (fixed1 .or. fixed2 .or. fixed3)
function parseSelectionExpression(
  expr: string,
  definitions: Record<string, { segid: string; resid: string }[]>
): ISegment[] {
  const segments: ISegment[] = []

  // Split by .or. and extract definition names
  const defNames = expr.split(/\s*\.or\.\s*/).map((name) => name.trim())

  for (const defName of defNames) {
    const definition = definitions[defName]
    if (definition) {
      for (const def of definition) {
        const chainId = segidToChainId(def.segid)
        const [start, stop] = def.resid.split(':').map(Number)

        segments.push({
          chain_id: chainId,
          residues: { start, stop }
        })
      }
    }
  }

  return segments
}

// Helper function to generate INP from constraints object
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
      lines.push(`cons fix sele ${defNames.join(' .or. ')} end`)
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
          `shape desc dock${dockCounter++} rigid sele ${defNames.join(' .or. ')} end`
        )
        lines.push('')
      }
    }
  }

  lines.push('return')

  return lines.join('\n') + '\n' // Add trailing newline
}
