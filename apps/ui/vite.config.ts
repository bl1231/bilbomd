/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

console.log('Starting Vite configuration...')
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true
  },
  server: {
    host: 'localhost',
    port: 3002,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:3501',
        changeOrigin: true,
        secure: false
      },
      '/admin/bullmq': {
        target: 'http://localhost:3501',
        changeOrigin: true,
        secure: false
      },
      '/sfapi': {
        target: 'http://localhost:3501',
        changeOrigin: true,
        secure: false
      },
      '/api-docs': {
        target: 'http://localhost:3501',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'build'
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts', './vitest.setup.coverage.ts'],
    reporters: ['default'],
    globals: true,
    css: true,
    pool: 'forks', // Use forks pool for single-threaded execution to avoid IPC issues
    server: {
      deps: {
        inline: ['@mui/x-data-grid']
      }
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      exclude: [
        'node_modules/',
        'build/',
        'dist/',
        '**/*.d.ts',
        '**/*.{png,jpg,jpeg,gif,svg,webp,ico,json}'
      ]
    }
  }
})
