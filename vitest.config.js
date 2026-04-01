import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Sandbox-safe test config (Vitest auto-prefers this over vite.config.js).
//
// Intentionally omits:
//   - @tailwindcss/vite   — oxide .node binary fails in restricted envs
//   - @rolldown/plugin-babel — React Compiler unneeded; rolldown .node binary
//
// css: false prevents Vite from invoking LightningCSS (lightningcss .node
// binary) when test files import components that transitively touch CSS.
// None of the unit/component tests assert on styles, so this is safe.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    reporter: 'verbose',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/constants/**', 'src/hooks/**', 'src/components/**'],
    },
  },
})
