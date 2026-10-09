#!/usr/bin/env node
// P8: Actor lint — no double-dispatch, no runtime internals
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let errors = 0;
function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.isFile() && p.endsWith('.ts') && p.includes('actors/')) {
      const c = readFileSync(p, 'utf8');
      if (c.includes('clip.gotoAndPlay') && !c.includes('animation.play')) {
        console.error(`lint: ${p} uses clip.gotoAndPlay without animation.play port`);
        errors++;
      }
      if (c.includes('from \"../../../runtime/as2\"') || c.includes('from \"@/runtime/as2\"')) {
        // allowlist: TimelineActor import is ok, but not internals
        if (c.includes('$rt') || c.includes('ModuleEmitter')) {
          console.error(`lint: ${p} imports runtime internals, use sprite/animation/graphics ports`);
          errors++;
        }
      }
      if (c.includes('runFrameAction') && c.includes('host') && c.includes('frames[')) {
        console.error(`lint: ${p} possible double-dispatch (runFrameAction while host playing)`);
        errors++;
      }
    }
  }
}
try { walk('transpiler/as2'); } catch {}
try { walk('src'); } catch {}
if (errors) { console.error(`actor lint: ${errors} error(s)`); process.exit(1); }
console.log('actor lint: ok');
