/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    globals: true,
    env: {
      BILBOMD_URL: 'http://localhost:3000',
      SEND_EMAIL_NOTIFICATIONS: 'false',
      BULLMQ_ATTEMPTS: '3'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      exclude: ['node_modules/', 'build/', 'dist/', '**/*.d.ts']
    }
  }
})
