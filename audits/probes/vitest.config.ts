// Runs the Execute-tab audit probes (not part of `npm test`):
//   npx vitest run --config audits/probes/vitest.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  root: new URL('../..', import.meta.url).pathname,
  test: { include: ['audits/probes/**/*.probe.test.{ts,tsx}'], environment: 'node' },
});
