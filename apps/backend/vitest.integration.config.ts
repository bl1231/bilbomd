/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

console.log('*** USING apps/backend/vitest.integration.config.ts ***')

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    hookTimeout: 5000,
    testTimeout: 3000,
    pool: 'forks',
    sequence: { concurrent: false },
    setupFiles: ['./test/integration-setup.ts'],
    // Environment variables for integration tests
    env: {
      MONGODB_TEST_URI: 'mongodb://localhost:27017/bilbomd-test',
      SFAPI_URL: 'https://api.nersc.gov',
      BILBOMD_URL: 'http://localhost:3000',
      SCRIPT_DIR: '/app/scripts',
      UPLOAD_DIR: '/app/uploads',
      WORK_DIR: '/app/work',
      DATA_VOL: '/tmp/bilbomd-data',
      EXAMPLE_DATA: '/app/example_data',
      BILBOMD_LOGS: '/bilbomd/logs',
      CHARMM_TOPOLOGY: '/app/scripts/bilbomd_top_par_files.str',
      CHARMM_TEMPLATES: '/app/build/templates/bilbomd',
      CHARMM: '/app/charmm/exec/gnu/charmm',
      CHARMM_EXEC: '/app/charmm/exec/gnu/charmm',
      OPENMM_EXEC: 'python3',
      FOXS: '/app/foxs/bin/foxs',
      FOXS_EXEC: '/app/foxs/bin/foxs',
      MULTIFOXS: '/app/foxs/bin/multi_foxs',
      MULTIFOXS_EXEC: '/app/foxs/bin/multi_foxs',
      CRYSOL_EXEC: '/app/atsas/bin/crysol',
      DAT2SAXS_EXEC: '/app/atsas/bin/dat2saxs',
      PREPARE_CHARMM_SLURM_SCRIPT: '/app/scripts/prepare-charmm-slurm.sh',
      PREPARE_OMM_SLURM_SCRIPT: '/app/scripts/prepare-omm-slurm.sh',
      CP2CFS_SCRIPT: '/app/scripts/cp2cfs.sh',
      BILBOMD_ALPHAFOLD: 'false',
      ENABLE_BILBOMD_ALPHAFOLD: 'false',
      ENABLE_BILBOMD_SANS: 'false',
      ENABLE_BILBOMD_MULTI: 'false',
      ENABLE_BILBOMD_SCOPER: 'false',
      ACCESS_TOKEN_SECRET: 'your-secret-key',
      REFRESH_TOKEN_SECRET: 'your-refresh-secret-key',
      BCRYPT_WORK_FACTOR: '10',
      SENDGRID_API_KEY: 'mock-sendgrid-key',
      SENDGRID_FROM: 'test@bilbomd.io',
      LOG_LEVEL: 'error'
    }
  }
})
