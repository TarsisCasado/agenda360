import { defineConfig } from 'vitest/config'

// Config isolada do Vitest (nao carrega o plugin PWA do vite.config).
// Ambiente 'node': os testes do agente sao logica pura com mocks injetados.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
    globals: false,
  },
})
