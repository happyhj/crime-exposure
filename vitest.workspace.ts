import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['etl/__tests__/unit/**/*.test.ts', 'api/__tests__/unit/**/*.test.ts'],
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: 'integ',
      include: ['etl/__tests__/integration/**/*.test.ts', 'api/__tests__/integration/**/*.test.ts'],
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: 'contract',
      include: ['etl/__tests__/contract/**/*.test.ts'],
      passWithNoTests: true,
    },
  },
]);
