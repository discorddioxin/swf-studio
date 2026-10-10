#!/usr/bin/env node
// P8: codemod to move timeline frame actions into Behavior class
// Usage: node tools/codemod/moveTimelineAction.mjs timelines/fisher.ts --frame 1 --out actors/fisher/FisherBehavior.ts
import { readFileSync, writeFileSync } from 'node:fs';

const FLASH_PORTS = {
  '_x': 'sprite.x',
  '_y': 'sprite.y',
  '_xscale': 'sprite.scaleX*100',
  '_yscale': 'sprite.scaleY*100',
  '_rotation': 'sprite.rotation',
  '_alpha': 'sprite.opacity',
};

function transform(code) {
  let out = code;
  for (const [k,v] of Object.entries(FLASH_PORTS)) out = out.replaceAll(`this.${k}`, `this.${v}`);
  return out;
}

if (process.argv.length < 4) {
  console.log('usage: moveTimelineAction.mjs <timeline.ts> --frame <n> --out <behavior.ts>');
  process.exit(0);
}
console.log('stub: would move frame actions via flashActorPorts mapping', FLASH_PORTS);
