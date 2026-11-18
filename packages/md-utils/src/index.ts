export {
  convertInpToYaml,
  validateYamlConstraints,
  extractConstraintsFromYaml,
  buildChainMolTypes,
  buildChainMolTypesFromInp,
  assertNoRigidBodyOverlaps
} from './constraintUtils.js'

export { toPipeline, discriminatorToPipeline } from './pipelineUtils.js'

// Re-export constraint interfaces from mongodb-schema for convenience
export type {
  IMDConstraints,
  ISegment,
  IFixedBody,
  IRigidBody,
  IChainMolType,
  ChainMolType
} from '@bilbomd/mongodb-schema'

// Export the Logger interface for type checking
export type Logger = {
  info: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debug?: (message: string, ...args: unknown[]) => void
  warn?: (message: string, ...args: unknown[]) => void
}
