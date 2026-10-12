// The default adapter: no game-specific knowledge at all.
//
// It claims nothing (score 0) so it is only ever selected as the fallback, and
// it adds nothing to the engine. That means a SWF set from an unknown game runs
// exactly as authored: no mocked gateway, no socket stand-in, no boot scripts,
// no URL filtering — a missing external is reported instead of silently
// swallowed. Add a real adapter when a game needs offline stand-ins.

import type { GameAdapter } from './types';

export const genericAdapter: GameAdapter = {
  id: 'generic',
  label: 'Generic SWF (no game-specific help)',
  description: 'Runs the SWF as authored. No offline server, boot script or URL filtering.',
  detect: () => 0,
};
