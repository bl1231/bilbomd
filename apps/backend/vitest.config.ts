/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

console.log('*** USING apps/backend/vitest.config.ts ***')

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // (Optional but handy) provide minimal env so imports don't explode
    env: {
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
      CHARMM: '/usr/local/bin/charmm',
      FOXS: '/usr/bin/foxs',
      MULTIFOXS: '/usr/bin/multi_foxs',
      SCOPER_KGS_CONFORMERS: '1000',
      BULLMQ_ATTEMPTS: '2',
      PREPARE_CHARMM_SLURM_SCRIPT: 'gen-sbatch.sh',
      PREPARE_OMM_SLURM_SCRIPT: 'gen-sbatch-omm.py',
      CP2CFS_SCRIPT: 'copy2cfs.sh',
      ACCESS_TOKEN_SECRET: 'xxxxxxxxxxx',
      REFRESH_TOKEN_SECRET: 'xxxxxxxxxxx'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'build/', 'dist/', '**/*.d.ts']
    }
  }
})
