// Offline stub for Gaia's GSI service (www.<gsiUrl>.gaiaonline.com).
//
// Two protocols show up in the bundled Gaia games:
//
// 1. LoadVars-style requests (the inventory/shop helpers) — answered with
//    plain `key=value&key=value` text.
// 2. The GSI gateway (`/chat/gsi/gateway.php`), used by bassken_game4.21 +
//    gsecs2.9. The request body is `m=<urlencoded PHP-serialized method
//    call>&v=phpobject&X=<ms>`, `GSItools.GSIGateway` posts it through
//    `LoadVars.sendAndLoad`, and the reply is read back with
//    `reciever.toString()` -> `unescape()` -> `GSItools.serializers
//    .PHPSerializer.unserialize()`.
//
//    The reply parser trims everything from `=&onLoad=` on, so the serialized
//    payload has to be the whole body (a valueless `LoadVars` property whose
//    name is the payload) — see `LoadVars.prototype.toString` in
//    src/engine/as2/builtins.ts. Value layout, from the GSIGateway bytecode:
//
//      [ <row per method call> ]  row = [<echo>, <noError>, <callback data>]
//
//    and each callback is invoked as `cb.call(scope, noError, data)`.

/** Grade F / D / A Fish Bait — the three baits of the Gaia fishing shops. */
export const GUEST_BAITS = ['gradeF', 'gradeD', 'gradeA'] as const;
/** Basic / Strength / Performance / Distance rods + their PLUS upgrades. */
export const GUEST_RODS = [
  'basic', 'strength', 'performance', 'distance',
  'basic_plus', 'strength_plus', 'performance_plus', 'distance_plus',
] as const;

export function isGsiUrl(url: string): boolean {
  return /gaiaonline\.com\b/i.test(url) || /(^|[/?&.])gsi([/?&.=]|$)/i.test(url);
}

// --------------------------------------------------------------- PHP objects

/** A PHP value as far as the games use it: arrays (lists) and objects (maps). */
export type PhpValue = null | boolean | number | string | PhpValue[] | { [key: string]: PhpValue };

/** PHP `serialize()` for the subset the GSI gateway speaks. */
export function phpSerialize(value: PhpValue): string {
  if (value === null || value === undefined) return 'N;';
  if (typeof value === 'boolean') return `b:${value ? 1 : 0};`;
  if (typeof value === 'number') return Number.isInteger(value) ? `i:${value};` : `d:${value};`;
  if (typeof value === 'string') return `s:${utf8Length(value)}:"${value}";`;
  const entries = Array.isArray(value)
    ? value.map((v, i) => [`${i}`, v] as const)
    : Object.entries(value);
  const parts = entries.map(([k, v]) => `${phpSerialize(isNaN(Number(k)) || k === '' || String(Number(k)) !== k ? k : Number(k))}${phpSerialize(v)}`);
  return `a:${parts.length}:{${parts.join('')}}`;
}

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.codePointAt(0)! > 0x7f ? (ch.codePointAt(0)! > 0x7ff ? 3 : 2) : 1;
  return n;
}

/** PHP `unserialize()` for the same subset (used to read the request body). */
export function phpUnserialize(src: string): PhpValue {
  let i = 0;
  const parse = (): PhpValue => {
    const type = src[i];
    if (type === 'N') { i += 2; return null; } // N;
    if (type === 'b' || type === 'i' || type === 'd') {
      i += 2; // b:/i:/d:
      const end = src.indexOf(';', i);
      const raw = src.slice(i, end);
      i = end + 1;
      if (type === 'b') return raw !== '0';
      return Number(raw);
    }
    if (type === 's') {
      i += 2; // s:
      const colon = src.indexOf(':', i);
      const len = Number(src.slice(i, colon));
      const start = colon + 2; // :"
      const out = src.substr(start, len);
      i = start + len + 2; // ";
      return out;
    }
    if (type === 'a' || type === 'O') {
      i += 2; // a:/O:
      if (type === 'O') i = src.indexOf(':', i) + 1; // "<name>":<count>
      const colon = src.indexOf(':', i);
      const count = Number(src.slice(i, colon));
      i = colon + 2; // :{
      const keys: PhpValue[] = [];
      const vals: PhpValue[] = [];
      for (let k = 0; k < count; k++) { keys.push(parse()); vals.push(parse()); }
      i++; // }
      const numeric = keys.every((k) => typeof k === 'number' && Number.isInteger(k));
      if (numeric) { const arr: PhpValue[] = []; for (let k = 0; k < count; k++) arr[keys[k] as number] = vals[k]; return arr; }
      const obj: { [key: string]: PhpValue } = {};
      for (let k = 0; k < count; k++) obj[String(keys[k])] = vals[k];
      return obj;
    }
    throw new Error(`php unserialize: unexpected '${type}' at ${i}`);
  };
  try { return parse(); } catch { return null; }
}

// ------------------------------------------------------------ gateway answers

/** `[methodId, params]` pair, as encoded in the `m=` parameter. */
export type GatewayCall = [string, PhpValue];

/**
 * Replies for the fishing app's GSI methods. The server list comes back as one
 * row per server; gsecs2.9 reads `sl[i].ip` and only offers the "choose a game
 * server" screen (or auto-connects) based on how many entries there are.
 */
export const GSI_SERVER_LIST: { ip: string; port: number; name: string }[] = [
  { ip: '127.0.0.1', port: 8080, name: 'Angelic Fishing' },
  { ip: '127.0.0.2', port: 8080, name: 'Demonic Fishing' },
];

export function gsiGatewayAnswer(method: string): PhpValue {
  switch (method) {
    case '50': // server listing for a game application
      return GSI_SERVER_LIST.map((s) => ({ ip: s.ip, port: s.port, name: s.name }));
    case '109': // "checking Gaia session" — a guest session is good enough
      return ['gaiafishing_guest'];
    default:
      return [];
  }
}

/**
 * Body of a `gateway.php` reply: one row per method call, url-encoded so that
 * a single `LoadVars` property carries the whole payload (see file header).
 */
export function gsiGatewayResponse(calls: GatewayCall[]): string {
  const rows: PhpValue[] = calls.map(([method]) => [0, true, gsiGatewayAnswer(method)]);
  return encodeURIComponent(phpSerialize(rows));
}

/** Parse the `m=` parameter of a gateway request into method calls. */
export function parseGatewayRequest(body: string | null): GatewayCall[] {
  if (!body) return [];
  const raw = new URLSearchParams(body).get('m');
  if (!raw) return [];
  const value = phpUnserialize(raw);
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): GatewayCall[] => {
    if (!Array.isArray(entry) || entry.length < 2) return [];
    return [[String(entry[0]), entry[1] as PhpValue]];
  });
}

/** LoadVars-style reply: 25 of every bait, every rod unlocked. */
export function gsiInventoryResponse(): string {
  const parts = ['error=0', 'success=1', 'status=ok', 'guest=1'];
  for (const bait of GUEST_BAITS) parts.push(`bait_${bait}=25`, `${bait}_bait=25`);
  for (const rod of GUEST_RODS) parts.push(`rod_${rod}=1`);
  parts.push(`baits=${GUEST_BAITS.join(',')}`, `rods=${GUEST_RODS.join(',')}`);
  return parts.join('&');
}

const INVENTORY_RE = /inventor|item|bait|rod|loadout|bucket|gear|equipped|(^|[^a-z])inv([^a-z]|$)/i;

export interface GsiStubLogger {
  (level: 'info' | 'warn', message: string, detail?: string): void;
}

/**
 * fetchText replacement: answers GSI/inventory requests offline, warns on
 * every other network attempt (nothing is reachable from the sandbox anyway).
 */
export async function gsiStubFetchText(
  url: string,
  method: string,
  body: string | null,
  log?: GsiStubLogger,
): Promise<string | null> {
  const base = typeof location !== 'undefined' && location.href ? location.href : 'http://localhost/';
  const target = (() => { try { return new URL(url, base).href; } catch { return url; } })();
  if (!isGsiUrl(target)) {
    log?.('warn', `network request not available offline: ${method} ${target}`, body ?? undefined);
    return null;
  }
  // GSI gateway: PHP-object protocol (gsecs2.9 asks for the game server list).
  if (/gateway\.php/i.test(target) || /(^|&)m=[a-z0-9%]/i.test(body ?? '')) {
    const calls = parseGatewayRequest(body);
    const label = calls.map(([id, params]) => `${id}(${phpSerialize(params).slice(0, 40)})`).join(', ') || 'no calls';
    log?.('info', `GSI gateway ${method} ${target} → ${label}`, body ?? undefined);
    return gsiGatewayResponse(calls);
  }
  const probe = `${target} ${body ?? ''}`;
  const inventory = INVENTORY_RE.test(probe);
  log?.('info', `GSI stub ${method} ${target}${inventory ? ' → inventory reply (25× bait, all rods)' : ' → ok reply'}`, body ?? undefined);
  if (inventory) return gsiInventoryResponse();
  return 'error=0&success=1&status=ok';
}
