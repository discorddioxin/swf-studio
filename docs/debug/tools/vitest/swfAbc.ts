// The ABC payloads of a SWF file, for the dev harnesses: the shared test helper
// (`src/testing/abcPayloads.ts`) under the names the harnesses use.
import { abcFrom, abcPayloads } from '@/testing/abcPayloads';
import { corpusFile } from '@/testing/corpus';

export const payloads = abcPayloads;
export const abcOf = abcFrom;

/** The SWF the harnesses read: SWF_FILE, else pinball's game.swf from the corpus. */
export const swfFile = () => process.env.SWF_FILE ?? corpusFile('pinball-swfs', 'game.swf') ?? 'pinball-swfs/game.swf (no corpus: set SWF_FILE or SWF_CORPUS)';
