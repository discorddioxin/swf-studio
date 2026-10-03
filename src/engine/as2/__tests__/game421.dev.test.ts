// Scratch harness (delete before commit): boots bassken_game4.21 like the
// Execute tab does — bundled SWFs, GSI stub, guest boot script — and drives the
// player deterministically so a stall can be inspected without a browser.
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import { parseSwfBinary } from '@/lib/swf/binary';
import { buildAS2Program, type SourceInput } from '@/engine/as2/program';
import { AS2Player } from '@/engine/as2/player';
import { createExternalResolver, type ExternalSwf } from '@/engine/as2/externals';
import { gsiStubFetchText, phpSerialize, phpUnserialize, parseGatewayRequest } from '@/lib/gsiStub';
import { createGameServerStub } from '@/lib/gameServerStub';
import { $rt, _global as AS2_GLOBAL } from '@/runtime/as2';

const DIR = 'game-files/fish-full/swfs';
const NAMES = ['bassken_game4.21', 'bassken_overview', 'bassken_pier', 'bassken_fish4.20', 'bassken_scene', 'game_chat', 'gsecs2.9'];

async function load(name: string) {
  const buf = readFileSync(`${DIR}/${name}.swf`);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const { doc, files } = await parseSwfBinary(ab, `${name}.swf`);
  const sources: SourceInput[] = files
    .filter((f) => /\.as$/i.test(f.path))
    .map((f) => ({ path: f.path, text: new TextDecoder().decode(f.bytes) }));
  return { doc, files, sources };
}

it('boots the bundled game and reports where it stops', async () => {
  const main = await load(NAMES[0]);
  const ext = await Promise.all(NAMES.slice(1).map(async (n) => ({ n, ...(await load(n)) })));

  const build = buildAS2Program(main.sources);
  console.log('main sources', main.sources.length, 'errors', build.errors.slice(0, 4));

  const externals: ExternalSwf[] = ext.map((e) => ({
    name: e.n, doc: e.doc, assets: null,
    sources: () => e.sources,
  }));
  const logs: string[] = [];
  const resolver = createExternalResolver(externals, {
    onBuild: (swf, b, ms) => logs.push(`[build] ${swf.name}: ${b.files.size} modules in ${ms}ms, ${b.errors.length} error(s)`),
    onError: (swf, e) => logs.push(`[build-error] ${swf.name}: ${e.message}`),
  });

  const player = new AS2Player({
    doc: main.doc,
    program: build.program,
    assets: null,
    audio: null,
    resolveExternal: resolver,
    missingExternal: 'empty',
    onLog: (e) => logs.push(`[${e.level}] ${e.message}${e.detail ? `\n   ${e.detail}` : ''}`),
    fetchText: (url, method, body) => {
      logs.push(`[fetch] ${method} ${url}\n  body=${body ?? ''}`);
      return gsiStubFetchText(url, method, body, (level, message) => logs.push(`[stub:${level}] ${message}`));
    },
    gameServer: createGameServerStub((level, message) => logs.push(`[${level}] ${message}`)),
    afterStart: (root, p) => {
      p.log('info', 'running boot script');
      // eslint-disable-next-line no-new-func
      new Function('_root', 'player', '_global', '_root.playAsGuest = true;\n_root.startGameSingle();')(root, p, AS2_GLOBAL);
    },
  });

  (globalThis as any).__TRACE_PLACE = 1;
  (globalThis as any).__DEBUG_LIST = 1;
  (globalThis as any).__DEBUG_CLIP = 1;
  (globalThis as any).__dbgInstances = [];
  (globalThis as any).__TRACE_FRAMES = 1;
  player.start();
  const t0 = Date.now();
  const frames: number[] = [];
  const listInstances = new Map<any, string>();
  // Give the game real time: loadMovie/MovieClipLoader resolve through promises,
  // and the GSI stub replies asynchronously.
  let joined = false;
  let wrapped = false;
  for (let i = 0; i < 400; i++) {
    if (!wrapped) {
      const g: any = (await import('@/runtime/as2'))._global as any;
      if (g?.mx?.controls?.List?.prototype?.init) {
        wrapped = true;
        const wrap = (cls: any, tag: string) => {
          const orig = cls?.prototype?.[tag];
          if (typeof orig !== 'function') { console.log(`[iwrap] ${tag} missing`); return; }
          cls.prototype[tag] = function (this: any, ...a: any[]) {
            const pre = this?.__dataProvider === undefined ? 'none' : `dp${this.__dataProvider?.length}`;
            const nm = this?._name;
            let out: any;
            try { out = orig.apply(this, a); } catch (e) { console.log(`[iwrap] ${tag}(${nm}) threw ${(e as Error).message}`); throw e; }
            const post = this?.__dataProvider === undefined ? 'none' : `dp${this.__dataProvider?.length}`;
            console.log(`[iwrap] ${tag}(${nm}) ${pre} -> ${post} this_is_lb=${this?._name === 'serverListing_lt'}`);
            return out;
          };
        };
        const origInit: any = g.mx.controls.List.prototype.init;
        g.mx.controls.List.prototype.init = function (this: any, ...a: any[]) {
          const set: Set<any> = ((globalThis as any).__lbs ??= new Set());
          set.add(this);
          set.add(this.watch?.('x') ? this : this);
          return origInit.apply(this, a);
        };
        const tap = (cls: any, tag: string) => {
          const orig = cls?.prototype?.[tag];
          if (typeof orig !== 'function') { console.log(`[tap] ${tag} missing`); return; }
          cls.prototype[tag] = function (this: any, ...a: any[]) {
            const gsecs = (player.root.obj as any)?.gsecs;
            console.log(`[tap] ${tag}(${JSON.stringify(a).slice(0, 60)}) on ${this?._name} dp=${this?.__dataProvider === undefined ? 'undef' : `len${this.__dataProvider?.length}`} @gsecs${gsecs?._currentframe}`);
            const r = orig.apply(this, a);
            console.log(`[tap]   -> len=${(() => { try { return this.getLength(); } catch (e) { return 'threw ' + (e as Error).message; } })()}`);
            return r;
          };
        };
        tap(g.mx.controls.List, 'addItem');
        tap(g.mx.controls.List, 'removeAll');
        wrap(g.mx.controls.List, 'init');
        wrap(g.mx.controls.listclasses?.ScrollSelectList, 'init');
        wrap(g.mx.core?.UIObject, 'constructObject');
        const cc: any = g.mx.core?.UIObject?.prototype?.constructObject;
        console.log('[iwrap] installed', typeof cc);
      }
    }
    player.tick();
    player.runQueue();
    if (frames[frames.length - 1] !== player.root.frame + 1) frames.push(player.root.frame + 1);
    const l = (player.root.obj as any).gsecs?.mc_ServerChooser?.serverListing_lt;
    if (l && !listInstances.has(l)) listInstances.set(l, `frame ${(player.root.obj as any).gsecs?._currentframe}`);
    {
      const t: string[] = ((globalThis as any).__dpTrace ??= []);
      const fr = (player.root.obj as any).gsecs?._currentframe;
      const state = l ? (l.__dataProvider === undefined ? 'none' : `dp${l.__dataProvider?.length}`) : (player.root.obj as any).gsecs ? 'nolist' : 'nogsecs';
      if (t[t.length - 1] !== `${fr}:${state}`) t.push(`${fr}:${state}`);
    }
    (globalThis as any).__listInstances = listInstances;
    const g: any = (player.root.obj as any).gsecs;
    const fr = g?._currentframe;
    const trace: string[] = ((globalThis as any).__trace ??= []);
    const last = (globalThis as any).__traceFrame;
    if (fr !== last) {
      (globalThis as any).__traceFrame = fr;
      const ch = g?.mc_ServerChooser;
      const li = ch?.serverListing_lt;
      let len = '-';
      try { len = String(li?.getLength?.()); } catch { len = 'throw'; }
      trace.push(`f${fr} chooser=${!!ch} list=${!!li} len=${len}`);
    }
    if (!joined && i > 60) {
      const game: any = (player.root.obj as any).gsecs;
      const btn = game?.mc_ServerChooser?.join_btn;
      if (btn && typeof btn.onRelease === 'function') {
        joined = true;
        try { btn.onRelease(); } catch (e) { logs.push(`[join] threw ${(e as Error).message}`); }
        player.runQueue();
      }
    }
    await new Promise((r) => setTimeout(r, 5));
  }
  console.log('ticks done in ms', Date.now() - t0, 'frames visited', frames.join(' '));
  const root: any = player.root.obj;
  console.log('root frame', player.root.frame + 1, '/', player.root.totalFrames, 'label', main.doc.root.frames[player.root.frame]?.label);
  const keys = Object.keys(root).filter((k) => !k.startsWith('__') && !['_x', '_y', '_width', '_height', '_xscale', '_yscale', '_visible', '_alpha', '_name', '_target', '_parent', '_root', '_level0', '_rotation', '_framesloaded', '_totalframes', '_currentframe', '_droptarget', '_focusrect', '_quality', '_soundbuftime', '_url', '_lockroot', '_highquality'].includes(k));
  console.log('root keys sample:', keys.slice(0, 30).join(', '));
  for (const k of ['playAsGuest', 'gsiUserData', 'session', 'gaiaID', 'choosenSushiServer', 'serverNameScheme', 'whichLake', 'splashScreen', 'gameAlertText', 'userWantsHelp', 'startGameSingle']) {
    const v = root[k];
    console.log(`  root.${k} =`, typeof v === 'function' ? 'function' : JSON.stringify(v)?.slice(0, 80));
  }
  for (const k of ['serverListing', 'gsecs_currentServer', 'GSECS_SelectedServerIP', 'noChat', 'dynamicServerListing', 'gsiMethod', 'sushi']) {
    const v = root[k];
    let text = '';
    try { text = typeof v === 'function' ? 'function' : JSON.stringify(v)?.slice(0, 200) ?? String(v); } catch { text = '[circular]'; }
    console.log(`  root.${k} =`, text);
  }
  {
    const set: Set<any> = (globalThis as any).__lbs ?? new Set();
    const arr = [...set];
    const cur = root.gsecs?.mc_ServerChooser?.serverListing_lt;
    console.log('  LB objects:', arr.length, 'current in set:', arr.includes(cur));
    for (const o of arr.concat([cur]).filter(Boolean)) {
      console.log('    obj', o === cur ? '(current)' : '(wrapped)', 'name=', JSON.stringify(o._name), 'own=', Object.getOwnPropertyNames(o).slice(0, 10).join(','),
        'dp=', String(o.__dataProvider), 'protoHasDP=', '__dataProvider' in Object.getPrototypeOf(o) ? 'yes' : 'no');
    }
  }
  console.log('  dataProvider trace:', ((globalThis as any).__dpTrace ?? []).join(' '));
  {
    const g: any = (await import('@/runtime/as2'))._global as any;
    for (const n of ['SushiAPI', 'SushiSocket', 'SushiSerializer', 'Serializer', 'SushiHTTP']) {
      const c = g?.com?.rawfishsoftware?.sushi?.[n];
      console.log(`  class ${n}:`, typeof c, c ? Object.getOwnPropertyNames(c.prototype ?? {}).slice(0, 40).join(',') : '');
    }
    const proto: any = g?.com?.rawfishsoftware?.sushi?.SushiAPI?.prototype;
    if (proto) console.log('  SushiAPI statics:', Object.getOwnPropertyNames(g.com.rawfishsoftware.sushi.SushiAPI).join(','));
  }
  console.log('  gsecs trace:', ((globalThis as any).__trace ?? []).filter((l: string) => {
    const n = Number(/^f(\d+)/.exec(l)?.[1] ?? 0); return n >= 55 && n <= 80;
  }).join(' | '));
  const gsecs: any = root.gsecs;
  if (gsecs) {
    console.log('  gsecs._currentframe', gsecs._currentframe, '/', gsecs._totalframes, 'bar.maintitle =', JSON.stringify(gsecs.bar?.maintitle));
    const chooser = gsecs.mc_ServerChooser;
    const lb = chooser?.serverListing_lt;
    console.log('  chooser visible', chooser?._visible, 'children', Object.keys(chooser ?? {}).filter((k) => !k.startsWith('__')).slice(0, 25).join(','));
    if (lb) {
      const num = (v: any) => (typeof v === 'number' ? v : typeof v === 'function' ? 'fn' : String(v));
      console.log('  listbox frames', lb._currentframe, '/', lb._totalframes, '_visible', lb._visible, '_alpha', lb._alpha);
      console.log('  listbox getLength', num(lb.getLength?.()), 'dataProvider', num(lb.dataProvider?.getLength?.()), 'items', JSON.stringify(lb.__items)?.slice(0, 120));
      console.log('  listbox keys', Object.keys(lb).filter((k) => !k.startsWith('__')).slice(0, 40).join(','));
    }
    console.log('  savedList', JSON.stringify(gsecs.savedList ?? gsecs.aCuteServerNames ?? null)?.slice(0, 120));
  }
  console.log('  root.serverListing', JSON.stringify(root.serverListing));
  {
    const lb: any = root.gsecs?.mc_ServerChooser?.serverListing_lt;
    if (lb) {
      console.log('  lb._name =', JSON.stringify(lb._name), 'childrenCreated =', lb.childrenCreated, 'invalidateFlag =', lb.invalidateFlag);
      const g2 = (await import('@/runtime/as2'))._global as any;
      const has = (cls: any, target: any) => { let p = cls?.prototype; while (p) { if (p === target?.prototype) return true; p = Object.getPrototypeOf(p); } return false; };
      console.log('  proto chain has ScrollSelectList:', has(g2.mx?.controls?.List, g2.mx?.controls?.listclasses?.ScrollSelectList),
        'ScrollView:', has(g2.mx?.controls?.List, g2.mx?.core?.ScrollView), 'UIComponent:', has(g2.mx?.controls?.List, g2.mx?.core?.UIComponent),
        'MovieClip:', has(g2.mx?.controls?.List, (await import('@/runtime/as2')).MovieClip));
      console.log('  proto inits:', typeof g2.mx?.controls?.List?.prototype?.init, typeof g2.mx?.controls?.listclasses?.ScrollSelectList?.prototype?.init, typeof g2.mx?.controls?.List?.prototype?.createChildren);
      try { console.log('  game left getLength =', String(lb.getLength?.())); } catch (e) { console.log('  getLength threw:', (e as Error).message); }
      console.log('  gsecs.listServers =', typeof root.gsecs?.listServers, 'savedList =', JSON.stringify(root.gsecs?.savedList)?.slice(0, 60));
      try { root.gsecs?.listServers?.(); console.log('  after manual listServers(): getLength =', String(lb.getLength?.())); } catch (e) { console.log('  listServers threw:', (e as Error).message); }
      {
        const g3 = (await import('@/runtime/as2'))._global as any;
        const SSL = g3.mx?.controls?.listclasses?.ScrollSelectList;
        const ListC = g3.mx?.controls?.List;
        const UIObject = g3.mx?.core?.UIObject;
        console.log('  List head:', String(ListC).slice(0, 100).replace(/\n/g, ' '));
        console.log('  List.prototype hasOwn init:', Object.prototype.hasOwnProperty.call(ListC?.prototype, 'init'), 'proto===SSL.prototype:', Object.getPrototypeOf(ListC?.prototype) === SSL?.prototype);
        console.log('  List.init src:', String(ListC?.prototype?.init).replace(/\s+/g, ' ').slice(0, 260));
        console.log('  SSL.prototype hasOwn init:', Object.prototype.hasOwnProperty.call(SSL?.prototype, 'init'), 'SSL.init src:', String(SSL?.prototype?.init).replace(/\s+/g, ' ').slice(0, 260));
        const wrap = (cls: any, tag: string) => {
          const orig = cls?.prototype?.init;
          if (typeof orig !== 'function') { console.log(`  ${tag}.init not a function`); return; }
          cls.prototype.init = function (this: any, ...a: any[]) {
            console.log(`  -> ${tag}.init called (this===lb ${this === lb})`);
            const r = orig.apply(this, a);
            console.log(`     <- ${tag}.init done __dataProvider=${String(this.__dataProvider)}`);
            return r;
          };
        };
        wrap(UIObject, 'UIObject'); wrap(SSL, 'ScrollSelectList'); wrap(ListC, 'List');
        try { lb.init(); console.log('  manual lb.init returned ok'); } catch (e) { console.log('  manual lb.init threw:', (e as Error).message, ((e as Error).stack ?? '').split('\n').slice(0, 5).join(' | ')); }
        console.log('  after manual init: __dataProvider =', String(lb.__dataProvider), 'getLength', String(lb.getLength?.()));
      }
      try { root.gsecs?.removeLoadingBar?.(); console.log('  removeLoadingBar() ok'); } catch (e) { console.log('  removeLoadingBar threw:', (e as Error).message); }
      console.log('  root.server =', JSON.stringify(root.server), 'isAutoConnect =', JSON.stringify((await import('@/runtime/as2'))._global.isAutoConnect), 'isChooseNewRoom =', JSON.stringify((await import('@/runtime/as2'))._global.isChooseNewRoom));
      const gsecsNode2: any = player.root.children.find((c: any) => c.obj === root.gsecs);
      console.log('  chooser visible =', gsecsNode2?.children?.find((c: any) => c.name === 'mc_ServerChooser')?.obj?._visible);
    }
  }
  console.log('  mx.controls.List class =', typeof $rt.classByName('mx.controls.List'), 'linked("List") main scope =', typeof $rt.linkedClass('List'));
  const gsources = ext.find((e) => e.n === 'gsecs2.9')!.sources;
  const gb = (await import('@/engine/as2/program')).buildAS2Program(gsources);
  const ckeys = Object.keys(gb.program?.classes ?? {});
  console.log('  gsecs classes:', ckeys.length, ckeys.slice(0, 6).join(', '), 'errors', gb.errors.slice(0, 3));
  console.log('  gsecs initByName:', Object.keys(gb.program!.initByName ?? {}).length, Object.keys(gb.program!.initByName ?? {}).slice(0, 8).join(', '));
  console.log('  gsecs timelines:', Object.keys(gb.program!.timelines ?? {}).length);
  const RT2 = await import('@/runtime/as2');
  const g = RT2._global as any;
  console.log('  _global.mx =', typeof g.mx, 'mx.controls.List =', typeof g.mx?.controls?.List, 'UIComponent =', typeof g.mx?.core?.UIComponent);
  const chain = (o: any) => { const out: string[] = []; let p = o; for (let i = 0; i < 8 && p; i++) { out.push(p?.constructor?.name ?? '?'); p = Object.getPrototypeOf(p); } return out.join(' -> '); };
  console.log('  UIObject.prototype chain:', chain(g.mx?.core?.UIObject?.prototype));
  console.log('  List.prototype chain:', chain(g.mx?.controls?.List?.prototype));
  console.log('  List.prototype instanceof MovieClip:', g.mx?.controls?.List?.prototype instanceof RT2.MovieClip);
  const walk = (obj: any, path: string, depth: number): void => {
    if (!obj || depth > 4) return;
    const names = Object.keys(obj).filter((k) => !k.startsWith('__') && typeof obj[k] === 'object' && obj[k]);
    for (const n of names.slice(0, 25)) {
      const child = obj[n];
      const proto: any = Object.getPrototypeOf(child ?? {});
      const kind = proto?.constructor?.name ?? '?';
      if (kind !== 'Object' || typeof child.addItem === 'function' || typeof child.getLength === 'function') {
        console.log(`  tree ${path}.${n} :: ${kind} addItem=${typeof child.addItem} getLength=${typeof child.getLength} frames=${child._currentframe}/${child._totalframes} visible=${child._visible}`);
      }
      walk(child, `${path}.${n}`, depth + 1);
    }
  };
  walk(root.gsecs, 'gsecs', 0);
  const nodes: string[] = [];
  const visit = (n: any, d: number) => {
    if (d > 6) return;
    const cls = n.obj ? (Object.getPrototypeOf(n.obj)?.constructor?.name ?? '?') : '-';
    if (n.name || typeof n.obj?.addItem === 'function' || typeof n.obj?.getLength === 'function') {
      nodes.push(`${'  '.repeat(d)}${n.name ?? '(anon)'} char=${n.characterId} frame=${n.frame + 1}/${n.timeline?.frames.length ?? '?'} cls=${cls} addItem=${typeof n.obj?.addItem} getLength=${typeof n.obj?.getLength}`);
    }
    for (const c of n.children ?? []) visit(c, d + 1);
  };
  const gsecsNode = player.root.children.find((c: any) => c.name === 'gsecs' || c.obj === root.gsecs);
  visit(gsecsNode ?? player.root, 0);
  console.log('  display tree:\n' + nodes.slice(0, 40).map((l) => '   ' + l).join('\n'));
  console.log('  MovieClip ctor calls =', (globalThis as any).__mcCtor, 'hook fires =', (globalThis as any).__mcHook);
  const li = (globalThis as any).__listInstances as Map<any, string> | undefined;
  if (li) console.log('  list instances seen:', li.size, [...li.values()].join(' | '), 'lengths', [...li.keys()].map((l) => { try { return String((l as any).getLength?.()); } catch { return 'throw'; } }).join(','));
  const gdoc = ext.find((e) => e.n === 'gsecs2.9')!.doc;
  const labels = gdoc.root.frames.map((f, i) => (f.label ? `${i + 1}:${f.label}` : null)).filter(Boolean);
  console.log('  gsecs labels:', labels.join(' '));
  console.log('  gsecs frame count:', gdoc.root.frames.length);
  console.log('--- logs ---');
  for (const l of logs) console.log(l.slice(0, 200));
  console.log('--- warnings/timeouts ---', logs.filter((l) => /too long/.test(l)).length);
}, 120000);

it('php codec round trips', () => {
  const payload = 'a:1:{i:0;a:2:{i:0;s:2:"50";i:1;a:1:{i:0;s:1:"1";}}}';
  console.log('unserialized:', JSON.stringify(phpUnserialize(payload)));
  console.log('parsed request:', JSON.stringify(parseGatewayRequest(`m=${encodeURIComponent(payload)}&v=phpobject&X=1`)));
  console.log('rows serialize:', phpSerialize([[0, true, [{ ip: '127.0.0.1' }]]]));
});
