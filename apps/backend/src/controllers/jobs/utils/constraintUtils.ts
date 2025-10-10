import fs from 'fs-extra'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { logger } from '../../../middleware/loggers.js'

// Interface definitions for constraint structures
interface ConstraintSegment {
  chain_id: string
  residues: {
    start: number
    stop: number
  }
}

interface ConstraintBody {
  name: string
  segments: ConstraintSegment[]
}

interface OpenMMConstraints {
  constraints: {
    fixed_bodies?: ConstraintBody[]
    rigid_bodies?: ConstraintBody[]
  }
}

// Mapping from CHARMM segment IDs to chain IDs
const SEGMENT_TO_CHAIN_MAP: Record<string, string> = {
  PROA: 'A',
  PROB: 'B',
  PROC: 'C',
  PROD: 'D',
  PROE: 'E'
  // Add more mappings as needed
}

// Reverse mapping for YAML to INP conversion
const CHAIN_TO_SEGMENT_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SEGMENT_TO_CHAIN_MAP).map(([seg, chain]) => [chain, seg])
)

/**
 * Converts CHARMM INP constraint file to YAML format for OpenMM
 */
export async function convertInpToYaml(inpFilePath: string): Promise<string> {
  try {
    const inpContent = await fs.readFile(inpFilePath, 'utf8')
    const constraints = parseInpConstraints(inpContent)

    const yamlContent = stringifyYaml(constraints, {
      indent: 2,
      lineWidth: 0 // No line wrapping
    })

    logger.info('Successfully converted INP to YAML')
    return yamlContent
  } catch (error) {
    logger.error('Error converting INP to YAML:', error)
    throw new Error(`Failed to convert INP to YAML: ${error}`)
  }
}

/**
 * Converts YAML constraint file to CHARMM INP format
 */
export async function convertYamlToInp(yamlFilePath: string): Promise<string> {
  try {
    const yamlContent = await fs.readFile(yamlFilePath, 'utf8')
    const constraints = parseYaml(yamlContent) as OpenMMConstraints

    const inpContent = generateInpFromConstraints(constraints)

    logger.info('Successfully converted YAML to INP')
    return inpContent
  } catch (error) {
    logger.error('Error converting YAML to INP:', error)
    throw new Error(`Failed to convert YAML to INP: ${error}`)
  }
}

/**
 * Validates YAML constraint file format
 */
export async function validateYamlConstraints(
  yamlFilePath: string
): Promise<void> {
  try {
    const yamlContent = await fs.readFile(yamlFilePath, 'utf8')
    const constraints = parseYaml(yamlContent) as OpenMMConstraints

    if (!constraints || typeof constraints !== 'object') {
      throw new Error('Invalid YAML constraint format')
    }

    if (!constraints.constraints) {
      throw new Error('Missing constraints section in YAML file')
    }

    // Validate structure
    const { fixed_bodies, rigid_bodies } = constraints.constraints

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
    logger.error('Error validating YAML constraints:', error)
    throw new Error(`Invalid YAML constraints file: ${error}`)
  }
}

/**
 * Validates INP constraint file format
 */
export async function validateInpConstraints(
  inpFilePath: string
): Promise<void> {
  try {
    const inpContent = await fs.readFile(inpFilePath, 'utf8')

    if (!inpContent.trim()) {
      throw new Error('Empty INP constraint file')
    }

    // Basic validation for CHARMM syntax
    const lines = inpContent
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('!'))

    // Check for required CHARMM commands
    const hasDefine = lines.some((line) => line.includes('define'))
    const hasConstraint = lines.some(
      (line) => line.includes('cons fix') || line.includes('shape desc')
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
    logger.error('Error validating INP constraints:', error)
    throw new Error(`Invalid INP constraints file: ${error}`)
  }
}

// Helper function to validate constraint bodies structure
function validateConstraintBodies(
  bodies: ConstraintBody[],
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
function parseInpConstraints(inpContent: string): OpenMMConstraints {
  const lines = inpContent
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('!') && line !== 'return')

  const constraints: OpenMMConstraints = {
    constraints: {
      fixed_bodies: [],
      rigid_bodies: []
    }
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
        constraints.constraints.fixed_bodies!.push({
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
        constraints.constraints.rigid_bodies!.push({
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
): ConstraintSegment[] {
  const segments: ConstraintSegment[] = []

  // Split by .or. and extract definition names
  const defNames = expr.split(/\s*\.or\.\s*/).map((name) => name.trim())

  for (const defName of defNames) {
    const definition = definitions[defName]
    if (definition) {
      for (const def of definition) {
        const chainId = SEGMENT_TO_CHAIN_MAP[def.segid] || def.segid
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
function generateInpFromConstraints(constraints: OpenMMConstraints): string {
  const lines: string[] = ['! Generated constraint file']
  let defCounter = 1

  const { fixed_bodies, rigid_bodies } = constraints.constraints

  // Generate definitions and fixed constraints
  if (fixed_bodies && fixed_bodies.length > 0) {
    const defNames: string[] = []

    for (const body of fixed_bodies) {
      for (const segment of body.segments) {
        const segid =
          CHAIN_TO_SEGMENT_MAP[segment.chain_id] || `PRO${segment.chain_id}`
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
        const segid =
          CHAIN_TO_SEGMENT_MAP[segment.chain_id] || `PRO${segment.chain_id}`
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

  return lines.join('\n')
}
