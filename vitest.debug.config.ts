// The developer dumpers in docs/debug/tools/vitest (see docs/debug/README.md):
// `npm run test:debug`, or `npm run test:debug -- zz_census` for one of them.
// Most need the uploaded game corpus (src/testing/corpus.ts).
import viteConfig from './vite.config';

// Not mergeConfig: it concatenates arrays, which would pull the main suite's include in.
export default {
  ...viteConfig,
  test: { ...viteConfig.test, include: ['docs/debug/tools/vitest/*.dev.test.ts'] },
};
