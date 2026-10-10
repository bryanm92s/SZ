import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    // Nota: no hay setupFiles — el archivo que apuntaba aquí (src/test/setup.ts)
    // nunca existió y rompía `npm test` con "Failed to load url".
    globals: true,
  },
})