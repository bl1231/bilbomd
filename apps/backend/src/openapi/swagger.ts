/* eslint-disable @typescript-eslint/no-explicit-any */
import m2s from 'mongoose-to-swagger'
import swaggerSpecJson from './swaggerOptions.js'
import { User, BilboMdJob } from '@bl1231/bilbomd-mongodb-schema'
import { logger } from '../middleware/loggers.js'
import fs from 'fs-extra'
import path from 'path'

interface SwaggerSpec {
  openapi?: string
  info?: {
    title?: string
    version?: string
    description?: string
  }
  components?: {
    schemas?: {
      [key: string]: any // Adjust based on your actual schema objects
    }
    securitySchemes?: {
      [key: string]: any // Adjust according to your needs
    }
    responses?: {
      [key: string]: any
    }
  }
  security?: Array<{
    [key: string]: any // Adjust this part as necessary
  }>
}

const swaggerSpec: SwaggerSpec = swaggerSpecJson

// Generate the Swagger definition for Mongoose/MongoDB schema
const userSwaggerDefinition = m2s(User)
const bilboMdJobSwaggerDefinition = m2s(BilboMdJob)

// Add the generated definitions to the Swagger spec
swaggerSpec.components = swaggerSpec.components || {}
swaggerSpec.components.schemas = swaggerSpec.components.schemas || {}

// Merge the User and Job schema definition into your existing Swagger spec
swaggerSpec.components.schemas.User = userSwaggerDefinition
swaggerSpec.components.schemas.Jobs = bilboMdJobSwaggerDefinition

swaggerSpec.components.schemas.JobStatusResponse = {
  type: 'object',
  properties: {
    status: { type: 'string', example: 'Completed' },
    progress: { type: 'integer', example: 100 },
    title: { type: 'string', example: 'API Test Job PDB' },
    mode: { type: 'string', example: 'BilboMdPDB' },
    uuid: { type: 'string', example: '6a8d578c-99df-4845-8cbc-f362e9860eeb' },
    submittedAt: {
      type: 'string',
      format: 'date-time',
      example: '2025-04-24T21:00:37.583Z'
    },
    completedAt: {
      type: 'string',
      format: 'date-time',
      example: '2025-04-24T21:14:45.789Z'
    }
  }
}

swaggerSpec.components.schemas.EntitiesJson = {
  type: 'object',
  required: ['entities'],
  properties: {
    entities: {
      type: 'array',
      description:
        'List of entities to model, each with type, sequence, and number of copies.',
      items: {
        type: 'object',
        required: ['id', 'type', 'sequence', 'copies'],
        properties: {
          id: { type: 'integer', example: 1 },
          type: { type: 'string', enum: ['Protein', 'DNA', 'RNA'], example: 'Protein' },
          sequence: {
            type: 'string',
            example: 'MSEQNNTEMTFQIQRIYTKDISFEAPNAPHVFQKDWLD...'
          },
          copies: { type: 'integer', example: 2 }
        }
      }
    }
  }
}

swaggerSpec.components.securitySchemes = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT'
  },
  cookieAuth: {
    type: 'apiKey',
    in: 'cookie',
    name: 'jwt'
  }
}

swaggerSpec.components.responses = {
  UnauthorizedError: {
    description: 'BilboMD API Token is missing or invalid',
    content: {
      'application/json': {
        examples: {
          InvalidToken: {
            summary: 'Invalid API token',
            value: { message: 'Invalid API token' }
          },
          MissingHeader: {
            summary: 'Missing or invalid Authorization header',
            value: { message: 'Missing or invalid Authorization header' }
          }
        }
      }
    }
  },
  ValidationError: {
    description: 'Request failed validation',
    content: {
      'application/json': {
        example: {
          message: 'Validation failed',
          errors: [
            { path: 'dat_file', message: 'No valid SAXS data found' },
            { path: 'pae_file', message: 'A PAE *.json file is required' },
            { path: 'pae_file', message: 'Only accepts a *.json file.' },
            { path: 'pae_file', message: 'Max file size is 120MB' },
            {
              path: 'pae_file',
              message: 'Filename must be no longer than 30 characters.'
            }
          ]
        }
      }
    }
  },
  ForbiddenAlphaFold: {
    description: 'AlphaFold jobs are disabled due to configuration',
    content: {
      'application/json': {
        example: {
          message: 'AlphaFold jobs unavailable on this deployment.'
        }
      }
    }
  }
}

swaggerSpec.security = [{ bearerAuth: [] }]

export default swaggerSpec

// My understanding is that this json file is written purely as an archival or
// historical record of the API. It is not used by the application at runtime.
try {
  const outputPath = path.resolve('src/openapi/v1/swagger_v1.json')
  fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2))
  logger.info(`Swagger file written to ${outputPath}`)
} catch (err) {
  logger.error('Failed to write Swagger JSON:', err)
  process.exit(1)
}
