import { useEffect, useState } from 'react';
import type { AssetBundle, AssetFile } from '../../types';
import type { ProjectResult, TimelineNameIndex } from '../../../transpiler/as2/project';
import { buildAS2Program, generateAS2Project, type AS2Build, type SourceInput } from './program';

export type AS2BuildState =
  | { status: 'loading' }
  | { status: 'ready'; build: AS2Build; sources: SourceInput[] }
  | { status: 'failed'; error: string };

export type AS2ProjectState =
  | { status: 'loading' }
  | { status: 'ready'; project: ProjectResult; sources: SourceInput[] }
  | { status: 'failed'; error: string };

/** Read one exported script in both browser and test environments. */
export function readAS2Text(file: AssetFile['file']): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Collect the exact source inputs used by Execute's AS2 project builder. */
export async function readAS2Sources(assets: AssetBundle | null): Promise<SourceInput[]> {
  const files = (assets?.files ?? []).filter((file) => /\.as$/i.test(file.path));
  return Promise.all(files.map(async (file) => ({
    path: file.path,
    text: await readAS2Text(file.file),
    tagOrder: file.tagOrder,
    targetSpriteId: file.targetSpriteId,
  })));
}

/**
 * The Code workspace uses this pure project step: it shows the generated
 * TypeScript without compiling, linking, or evaluating the user's code.
 */
export function useAS2Project(assets: AssetBundle | null, timelineMetadata?: TimelineNameIndex): AS2ProjectState {
  const [state, setState] = useState<AS2ProjectState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    readAS2Sources(assets)
      .then((sources) => {
        if (!cancelled) setState({ status: 'ready', sources, project: generateAS2Project(sources, timelineMetadata) });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  }, [assets, timelineMetadata]);

  return state;
}

/**
 * Execute's full build: read the same AS2 inputs, transpile, compile and link
 * the resulting project into an AS2Program for the player.
 */
export function useAS2Build(assets: AssetBundle | null, timelineMetadata?: TimelineNameIndex): AS2BuildState {
  const [state, setState] = useState<AS2BuildState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    readAS2Sources(assets)
      .then((sources) => {
        if (!cancelled) setState({ status: 'ready', sources, build: buildAS2Program(sources, timelineMetadata) });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  }, [assets, timelineMetadata]);

  return state;
}
