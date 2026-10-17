// The uploaded game corpus, for tests only: where it is (./corpusPaths) and a
// `describe` that skips, naming the clone command, when it is not checked out.
// Nothing in the app imports this module, so it is never bundled.
import { describe, it } from 'vitest';
import { CORPUS_CLONE, hasCorpus } from './corpusPaths';

export * from './corpusPaths';

/**
 * `describe` for tests that need the corpus: skipped when it is absent, and the
 * skipped suite's name says how to get it.
 */
export function describeCorpus(name: string, fn: () => void, needs: () => boolean = () => hasCorpus): void {
  const available = needs();
  describe.skipIf(!available)(available ? name : `${name} (skipped: no game corpus — ${CORPUS_CLONE})`, fn);
}

/** `it` for a single test that needs the corpus, skipped the same way. */
export function itCorpus(name: string, fn: () => unknown, timeout?: number, needs: () => boolean = () => hasCorpus): void {
  const available = needs();
  it.skipIf(!available)(available ? name : `${name} (skipped: no game corpus — ${CORPUS_CLONE})`, fn, timeout);
}
