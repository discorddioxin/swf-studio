// Boots the bundled game to the room chooser and inspects the live UI with the
// troubleshooter: dumps the mChooser subtree, hit-tests every interactive node
// and prints the findings. This is the diagnosis harness for the "servers don't
// show / clicks go elsewhere" class of bugs, and the regression test for the
// chooser UI after the initActions fix.
//
//   npx vitest run src/adapters/gaiaFishing/__tests__/chooserUi.dev.test.ts
//
// Sample-scenario harness: the movie under test comes from the bundled set
// and is wired through its adapter (this folder).
//
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { itCorpus } from '@/testing/corpus';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { AS2Player, type DisplayNode } from '@/engine/as2/player';
import { createExternalResolver, type ExternalSwf } from '@/engine/as2/externals';
import { createFishingSession, gaiaFishingAdapter } from '..';
import { hasSample, SAMPLE_GAME_SET_ID, SAMPLE_MAIN, SAMPLE_SWF_NAMES, sampleSwfPath } from '../sample';
import { scanStage, snapshotStage, stageRect, type InspectablePlayer } from '@/components/uiTroubleshooter/scan';

const NAMES = SAMPLE_SWF_NAMES;

async function load(name: string) {
  const buf = readFileSync(sampleSwfPath(name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { doc, files } = await parseSwfBinary(ab, `${name}.swf`);
  // Every script is the SWF's own bytecode: nothing is substituted.
  const sources: SourceInput[] = files
    .filter((f) => /\.as$/i.test(f.path))
    .map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) }));
  return { doc, files, sources };
}

async function bootToChooser() {
  const main = await load(NAMES[0]);
  const ext = await Promise.all(NAMES.slice(1).map(async (n) => ({ n, ...(await load(n)) })));
  const build = buildAS2Program(main.sources);
  const externals: ExternalSwf[] = ext.map((e) => ({ name: e.n, doc: e.doc, assets: null, sources: () => e.sources }));
  // the same wiring the Execute tab uses for this game (src/adapters/gaiaFishing)
  const session = createFishingSession();
  const player = new AS2Player({
    doc: main.doc,
    program: build.program,
    assets: null,
    audio: null,
    resolveExternal: createExternalResolver(externals, {}),
    missingExternal: 'empty',
    ...session.playerOptions(),
    afterStart: (root) => gaiaFishingAdapter.onStart?.(root, player, {
      main: { name: SAMPLE_MAIN, doc: main.doc, paths: [] },
      externals: [],
      bundled: true,
      declaredId: SAMPLE_GAME_SET_ID,
    }, session.network),
  });
  const ticks = async (count: number) => {
    for (let i = 0; i < count; i++) { player.advanceTime(); player.runQueue(); await new Promise((r) => setTimeout(r, 2)); }
  };
  player.start();
  await ticks(80);
  const root: any = player.root.obj;
  root.gsecs.mc_ServerChooser.serverListing_lt.selectRow(0);
  root.gsecs.mc_ServerChooser.join_btn.onRelease();
  await ticks(60);
  return { player, mockServer: session.server };
}

const label = (n: DisplayNode): string => `${n.name || n.character?.exportName || n.kind}${n.character?.exportName && n.name !== n.character.exportName ? ` "${n.character.exportName}"` : ''}`;

function dumpNode(player: InspectablePlayer, node: DisplayNode, depth = 0, out: string[] = []): string[] {
  const rect = stageRect(player, node);
  const r = rect ? `x ${Math.round(rect.x)} y ${Math.round(rect.y)} ${Math.round(rect.w)}×${Math.round(rect.h)}` : 'no bounds';
  out.push(`${'  '.repeat(depth)}${node.kind} ${label(node)} #${node.id} d${node.depth} vis=${node.visible} ${r}${node.drawing?.length ? ` draw(${node.drawing.length})` : ''}`);
  for (const c of node.children) dumpNode(player, c, depth + 1, out);
  return out;
}

/** Every node the engine would route a click to, with its centre hit test. */
function hitTests(player: AS2Player, node: DisplayNode, out: { path: string; at: string; target: string | null }[] = []) {
  if (player.isMouseTarget(node)) {
    const rect = stageRect(player, node);
    if (rect && rect.w > 0 && rect.h > 0) {
      const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
      const target = player.mouseTarget(x, y);
      out.push({ path: player.describe(node), at: `${Math.round(x)},${Math.round(y)}`, target: target ? player.describe(target) : null });
    }
  }
  for (const c of node.children) hitTests(player, c, out);
  return out;
}

itCorpus('room chooser: display list, hit tests and troubleshooter findings', async () => {
  const { player } = await bootToChooser();
  const root: any = player.root.obj;
  expect(root.gsecs?._currentframe).toBe(45);
  const chooser = player.root.children.find((c) => c.name === 'mLoginHolder')?.children.find((c) => c.name === 'mChooser');
  expect(chooser, 'mChooser').toBeTruthy();

  console.error('--- mChooser subtree');
  console.error(dumpNode(player, chooser!).join('\n'));

  console.error('--- hit tests (interactive nodes)');
  for (const h of hitTests(player, chooser!)) console.error(`  ${h.at}  ${h.path}  ->  ${h.target}`);

  const bar = player.root.children.find((c) => c.name === 'mLoginHolder')?.children.find((c) => c.name === 'bar');
  if (bar) { console.error('--- bar subtree'); console.error(dumpNode(player, bar).join('\n')); }
  const holder = player.root.children.find((c) => c.name === 'mLoginHolder');
  const loading = holder?.children.find((c) => c.name === 'mc_loading_bar');
  if (loading) { console.error('--- loading bar subtree'); console.error(dumpNode(player, loading).join('\n')); }
  if (holder) {
    console.error('--- mLoginHolder direct children');
    for (const c of holder.children) {
      const rect = stageRect(player, c);
      console.error(`  ${c.kind} ${label(c)} #${c.id} vis=${c.visible} ${rect ? `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.w)}×${Math.round(rect.h)}` : 'no bounds'} clipDepth=${c.clipDepth} mask=${!!c.mask} maskedBy=${c.maskedBy ? label(c.maskedBy) : '-'}`);
    }
  }

  const { nodes } = snapshotStage(player, player.root);
  const components = nodes.filter((n) => n.component);
  console.error('--- components');
  for (const c of components) {
    console.error(`  ${c.path}: class=${c.component!.className} items=${c.component!.itemCount} rows=${c.component!.rows} rowCount=${c.component!.rowCount} broken=[${c.component!.brokenMetrics.join(', ')}] rect=${c.rect ? `${Math.round(c.rect.w)}×${Math.round(c.rect.h)}` : 'none'}`);
  }

  const result = scanStage(player, { probe: false, maxNodes: 4000 });
  const byArea = new Map<string, number>();
  for (const f of result.findings) byArea.set(`${f.severity}/${f.area}`, (byArea.get(`${f.severity}/${f.area}`) ?? 0) + 1);
  console.error(`--- findings: ${result.findings.length} total — ${[...byArea].map(([k, v]) => `${k}=${v}`).join(' ')}`);
  for (const f of result.findings.slice(0, 400)) console.error(`  [${f.severity}/${f.area}] ${f.title}  @ ${f.path ?? ''}`);
  player.dispose();

  // ---------------------------------------------------------------- regression
  // The chooser UI after the initActions fix: every server/room row exists and
  // is filled, every control answers its own clicks, and the troubleshooters's
  // report is clean. This is what "the servers show up and the buttons work"
  // means to the player.
  expect(result.findings.filter((f) => f.severity === 'error'), 'no error findings').toHaveLength(0);
  expect(result.findings.filter((f) => f.severity === 'warn'), 'no warnings').toHaveLength(0);
  expect(result.findings.filter((f) => f.severity === 'info'), 'no info findings').toHaveLength(0);

  // The hidden clips on this screen (the List's hover skins, its mask, the
  // bounding-box skins the halo theme disables, the loading bar that is done,
  // the password display, the room lock button, the Omniture tracker hiding
  // itself) are the movie's own state, not defects: every `_visible = false`
  // here was written by the movie's ActionScript. The regression is that the
  // engine never hides a clip on its own — if it ever does, the scan reports it
  // again and this fails.
  const hiddenNodes = snapshotStage(player, player.root).nodes.filter((n) => !n.visible);
  expect(hiddenNodes.length).toBeGreaterThan(10);
  expect(hiddenNodes.filter((n) => !n.hiddenReason).map((n) => n.path)).toEqual([]);
  const stateFinding = result.findings.find((f) => f.id === 'stage/hidden-state');
  expect(stateFinding?.severity).toBe('pass');
  expect(stateFinding?.evidence).toMatchObject({
    clips: hiddenNodes.length,
    hiddenByScript: hiddenNodes.filter((n) => n.hiddenReason === 'script').length,
    masks: hiddenNodes.filter((n) => n.hiddenReason === 'mask').length,
  });
  expect(result.stats.explainedHidden).toBe(hiddenNodes.length);

  // the two clips the report used to flag, with the attribution that resolved them
  const lockButton = snapshotStage(player, player.root).nodes.find((n) => n.name === 'mc_LockButon');
  expect(lockButton?.hiddenReason).toBe('script');         // bar.mc_LockButon._visible = false in initGSECS()
  expect(lockButton?.visibleSource).toBe('script');        // the multiplayer room shows it again (creationCheck)
  const mask = snapshotStage(player, player.root).nodes.find((n) => n.name === 'mask_mc');
  expect(mask?.usedAsMask, 'the List mask is structural').toBe(true); // listContent.setMask(mask_mc)
  expect(mask?.hiddenReason).toBe('mask');                 // ScrollView hides it *and* setMask()'es it
  // everything inside the hidden lock button is invisible for the same reason,
  // not because the engine lost it
  const lockChildren = snapshotStage(player, player.root).nodes.filter((n) => n.path.includes('mc_LockButon') && !n.visible);
  expect(lockChildren.length).toBeGreaterThan(0);
  expect(lockChildren.every((n) => n.hiddenReason === 'script')).toBe(true);

  const rows = chooser!.children.find((c) => c.name === 'gameListing_lt')!.children.find((c) => c.name === 'content_mc')!.children;
  expect(rows.length).toBe(11);
  const labels = rows.map((r) => (r.children.find((c) => c.kind === 'text') as any)?.obj?.text ?? '');
  expect(labels[0]).toContain("dracogenius's Room");
  expect(labels[1]).toContain("Princess Lethe's Room");

  // every interactive node in the chooser answers its own centre
  const misrouted = hitTests(player, chooser!).filter((h) => h.target !== h.path);
  expect(misrouted, JSON.stringify(misrouted, null, 2)).toHaveLength(0);
}, 120000, hasSample);