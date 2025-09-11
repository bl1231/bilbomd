import swaggerJsdoc from 'swagger-jsdoc'
// import { version } from '../../package.json'

const VERSION = process.env.npm_package_version

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'BilboMD API Docs',
      version: VERSION || 'w.t.f',
      description:
        'API for external programmatic access to BilboMD job submission and results'
    },
    servers: [
      {
        url: 'https://bilbomd.bl1231.als.lbl.gov/api/v1',
        description: 'Beamline 12.3.1'
      },
      {
        url: 'https://bilbomd-nersc.bl1231.als.lbl.gov/api/v1',
        description: 'NERSC'
      },
      {
        url: 'http://localhost:3501/api/v1',
        description: 'development'
      }
    ]
  },
  apis: ['src/routes/external.ts']
}

const swaggerSpecJson = swaggerJsdoc(options)

export default swaggerSpecJson
