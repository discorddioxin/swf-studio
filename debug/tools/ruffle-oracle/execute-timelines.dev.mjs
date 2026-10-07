// Puppeteer smoke/visual check for the Execute running-timeline sidebar.
// It loads only repository-bundled SWFs. All non-local browser requests are
// intercepted and aborted so no game server or third party is contacted.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium, { inflate } from '@sparticuz/chromium';

const packageBin = path.resolve('debug/tools/ruffle-oracle/node_modules/@sparticuz/chromium/bin');
const libraryRoot = await inflate(path.join(packageBin, 'al2023.tar.br'));
process.env.LD_LIBRARY_PATH = [path.join(libraryRoot, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
process.env.FONTCONFIG_PATH ??= '/tmp/fonts';
const origin = process.env.APP_URL || 'http://127.0.0.1:5173/';
const swfName = process.env.TIMELINES_SWF || 'bassken_game4.21';
const outDir = process.argv[2] || 'debug/tools/e2e-output/execute-timelines';
await fs.mkdir(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  args: [...chromium.args.filter((arg) => arg !== '--single-process' && arg !== '--no-zygote'), '--disable-dev-shm-usage'],
  headless: true,
  defaultViewport: { width: 1600, height: 1000 },
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const blocked = [];
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.setRequestInterception(true);
page.on('request', (request) => {
  const url = new URL(request.url());
  if (['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
  else { blocked.push(url.href); request.abort(); }
});

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('select[aria-label="Bundled main SWF"]', { timeout: 30000 });
  await page.select('select[aria-label="Bundled main SWF"]', swfName);
  const started = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => /Use bundled SWFs/i.test(item.textContent ?? ''));
    button?.click();
    return !!button;
  });
  if (!started) throw new Error(`Could not start bundled SWF ${swfName}.`);
  await page.waitForSelector('.forge-bottom-dock', { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('select[aria-label="Bundled main SWF"]'), { timeout: 120000 });
  await page.evaluate(() => [...document.querySelectorAll('button')]
    .find((button) => (button.textContent ?? '').trim() === 'Execute')?.click());
  await page.waitForSelector('canvas[aria-label="Game stage"]', { timeout: 30000 });
  await page.waitForSelector('[data-running-timelines-sidebar="true"]', { timeout: 30000 });
  await page.waitForSelector('[aria-label="Console tabs"] [role="tab"]', { timeout: 30000 });

  // Let the SWF advance naturally first. Some bundled root timelines stop at
  // frame 1, so if it contains no currently-running multi-frame clips, start
  // its root timeline through the real MovieClip API for a deterministic view.
  let nudgedTimeline = false;
  await page.waitForFunction(() => document.querySelectorAll('[data-runtime-timeline]').length > 0, { timeout: 12000 }).catch(() => {});
  const firstRows = await page.$$('[data-runtime-timeline]');
  if (firstRows.length === 0) {
    const nudged = await page.evaluate(() => {
      const player = window.__as2player;
      const visit = (node) => {
        if (!node || node.removed) return null;
        if (node.kind === 'clip' && node.timeline && node.totalFrames > 1) return node;
        for (const child of node.children ?? []) {
          const result = visit(child);
          if (result) return result;
        }
        return null;
      };
      const target = visit(player?.root);
      if (!target) return false;
      target.obj.play();
      return true;
    });
    nudgedTimeline = nudged;
    if (!nudged) throw new Error(`No live multi-frame timeline appeared in ${swfName}, and no multi-frame clip could be started for the visual check.`);
  }
  await page.waitForFunction(() => document.querySelectorAll('[data-runtime-timeline]').length > 0, { timeout: 15000 });

  const initial = await page.$$eval('[data-runtime-timeline]', (rows) => rows.map((row) => ({
    id: row.getAttribute('data-runtime-timeline'),
    name: row.querySelector('div > div > span:last-child')?.textContent?.trim() ?? '',
    path: row.getAttribute('data-timeline-path'),
    frame: Number(row.getAttribute('data-current-frame')),
    stripCells: row.querySelectorAll('[data-frame-cell]').length,
    playhead: row.querySelector('[data-playhead]')?.getAttribute('aria-label') ?? null,
  })));
  const firstTimeline = initial[0];
  if (!firstTimeline?.id || firstTimeline.stripCells < 1 || !firstTimeline.playhead) {
    throw new Error('The running timeline row is missing a frame strip or current-frame playhead.');
  }

  const tabs = await page.$$eval('[aria-label="Console tabs"] [role="tab"]', (items) => items.map((item) => (item.textContent ?? '').trim()));
  const actionsTabPresent = tabs.some((label) => /^Actions\b/i.test(label));
  if (actionsTabPresent) throw new Error('The removed Actions report tab is still present in Execute.');
  for (const required of ['Logs', 'Req/Res', 'Problems']) {
    if (!tabs.some((label) => label.startsWith(required))) throw new Error(`Missing expected console tab: ${required}`);
  }

  // Exercise a real AVM1 ActionStop against the live MovieClip through the same
  // runtime entry point used by compiled SWF actions, then ensure it is silent.
  const avm1Execution = await page.evaluate(async () => {
    const player = window.__as2player;
    const { $rt } = await import('/src/runtime/as2/index.ts');
    player.root.playing = true;
    $rt.avm1Actions(player.root.obj, 'BwA=');
    const stopExecuted = player.root.playing === false;
    player.root.obj.play();
    return {
      stopExecuted,
      actionReporterInstalled: typeof player.onAvm1ActionCall === 'function',
    };
  });
  if (!avm1Execution.stopExecuted) throw new Error('The AVM1 ActionStop did not stop the live root MovieClip.');
  if (avm1Execution.actionReporterInstalled) throw new Error('Per-action report callback is still installed on the AS2 player.');

  // Record a real frame transition from the visible timeline and the frozen
  // playhead after the Execute-wide Pause control is used.
  const frameBeforeTransition = await page.evaluate((id) => {
    const row = [...document.querySelectorAll('[data-runtime-timeline]')]
      .find((item) => item.getAttribute('data-runtime-timeline') === id);
    if (!row) return -1;
    const frame = row.getAttribute('data-current-frame') ?? '';
    row.setAttribute('data-visual-check-initial-frame', frame);
    return Number(frame);
  }, firstTimeline.id);
  if (frameBeforeTransition < 0) throw new Error('The first runtime timeline disappeared before the transition check.');
  await page.waitForFunction((id) => {
    const row = [...document.querySelectorAll('[data-runtime-timeline]')]
      .find((item) => item.getAttribute('data-runtime-timeline') === id);
    return !!row && row.getAttribute('data-current-frame') !== row.getAttribute('data-visual-check-initial-frame');
  }, { timeout: 15000 }, firstTimeline.id);
  const rowSelector = `[data-runtime-timeline=${JSON.stringify(firstTimeline.id)}]`;
  const advanced = await page.$eval(rowSelector, (row) => ({
    frame: Number(row.getAttribute('data-current-frame')),
    playhead: row.querySelector('[data-playhead]')?.getAttribute('aria-label') ?? null,
  }));
  await page.screenshot({ path: path.join(outDir, 'running-timelines.png'), fullPage: false });

  await page.click('button[title="Play / pause the game"]');
  await page.waitForFunction(() => document.querySelector('[data-running-timelines-sidebar="true"]')?.textContent?.includes('PAUSED'), { timeout: 10000 });
  // Let a snapshot queued immediately before Pause commit before measuring the frozen frame.
  await new Promise((resolve) => setTimeout(resolve, 300));
  const pausedFrame = await page.$eval(rowSelector, (row) => Number(row.getAttribute('data-current-frame')));
  await new Promise((resolve) => setTimeout(resolve, 350));
  const stillPausedFrame = await page.$eval(rowSelector, (row) => Number(row.getAttribute('data-current-frame')));
  await page.screenshot({ path: path.join(outDir, 'paused-timelines.png'), fullPage: false });

  const consoleText = await page.$eval('#execution-console-panel', (panel) => panel.textContent ?? '');
  const noActionReports = !/avm1Actions call|ActionRecord trace|AVM1 instruction report/i.test(consoleText);
  const state = {
    swfName,
    tabs,
    actionsTabPresent,
    initialTimelines: initial,
    frameBeforeTransition,
    firstTimelineAdvanced: advanced.frame !== frameBeforeTransition,
    advanced,
    pausedFrame,
    stillPausedFrame,
    playheadFrozenOnPause: pausedFrame === stillPausedFrame,
    noActionReports,
    avm1Execution,
    nudgedTimeline,
    blockedNonLocalRequests: blocked.length,
    pageErrors,
  };
  await fs.writeFile(path.join(outDir, 'state.json'), JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state, null, 2));

  if (!state.firstTimelineAdvanced) throw new Error('The visible timeline playhead did not advance.');
  if (!state.playheadFrozenOnPause) throw new Error('The visible timeline playhead moved while Execute was paused.');
  if (!noActionReports) throw new Error('Per-call Action reports are still being added to the console.');
  if (blocked.length) throw new Error(`Unexpected non-local browser request(s) were blocked: ${blocked.join(', ')}`);
  if (pageErrors.length) throw new Error(`Browser page errors: ${pageErrors.join(' | ')}`);
} finally {
  await browser.close();
}
