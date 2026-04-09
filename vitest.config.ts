import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest config for unit tests. Currently focused on the CSV parser
 * since that's the biggest correctness-sensitive code path. Not wired
 * into the Next build — runs independently via `pnpm test`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/csv.ts', 'lib/csv/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
