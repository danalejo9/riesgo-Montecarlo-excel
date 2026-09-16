import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // El motor no toca el DOM: Node basta y arranca mucho mas rapido.
    environment: 'node',
  },
});
