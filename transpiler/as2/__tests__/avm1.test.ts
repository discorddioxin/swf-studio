import { describe, expect, it } from 'vitest';
import { transform } from 'sucrase';
import { decodeAVM1Actions, transpileScript, transpileProject } from '..';
import { $rt } from '../../../src/runtime/as2';
import { runActionsBase64, setAvm1Env } from '../../../src/runtime/as2/avm1';

const text = (s: string) => [...new TextEncoder().encode(s), 0];
const record = (op: number, payload: number[]) => [op, payload.length & 255, payload.length >> 8, ...payload];
const push = (...values: (string | number | boolean)[]) => record(0x96, values.flatMap((v) =>
  typeof v === 'string' ? [0, ...text(v)] : typeof v === 'boolean' ? [5, Number(v)] : [7, v & 255, v >> 8 & 255, v >> 16 & 255, v >> 24 & 255]));
const reg = (r: number) => record(0x96, [4, r]);
const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
class Asm {
  bytes: number[] = [];
  labels = new Map<string, number>();
  fixups: [number, string][] = [];
  add(...bytes: number[]) { this.bytes.push(...bytes); return this; }
  label(name: string) { this.labels.set(name, this.bytes.length); return this; }
  branch(op: number, label: string) { this.fixups.push([this.bytes.length, label]); return this.add(...record(op, [0, 0])); }
  finish() {
    for (const [at, label] of this.fixups) {
      const delta = this.labels.get(label)! - at - 5;
      this.bytes[at + 3] = delta & 255; this.bytes[at + 4] = delta >> 8 & 255;
    }
    return base64([...this.bytes, 0]);
  }
}
function execute(payload: string, clip: Record<string, any>) {
  const decoded = decodeAVM1Actions(payload);
  expect(decoded.diagnostics).toEqual([]);
  expect(decoded.code).not.toBeNull();
  const js = transform(decoded.code!, { transforms: ['typescript'] }).code;
  new Function('$t', '$rt', js)(clip, $rt);
  return decoded.code!;
}
function compare(payload: string, make: () => Record<string, any>, inspect: (clip: Record<string, any>) => unknown) {
  const a = make(), b = make();
  setAvm1Env({ global: {} });
  runActionsBase64(a, payload);
  const code = execute(payload, b);
  expect(inspect(b)).toEqual(inspect(a));
  return code;
}
const SAMPLE = 'lg4AAAAHAQAAAABfcm9vdAAclgYAAG1haW4ATpYMAABzZXRNZXNzYWdlAFIXAA==';

describe('executable AVM1 decoder', () => {
  it('turns the supplied setMessage block into an editable method invocation', () => {
    const calls: string[] = [];
    const main = { setMessage(this: unknown, value: string) { expect(this).toBe(main); calls.push(value); } };
    const code = execute(SAMPLE, { _root: { main } });
    expect(code).toBe('$rt.invoke($t._root?.main, "setMessage", "");');
    expect(calls).toEqual(['']);
    const script = transpileScript(`avm1Actions("${SAMPLE}");`);
    expect(script.code).toContain(code);
    expect(script.code).not.toContain(SAMPLE);
    expect(script.diagnostics).toEqual([]);
  });

  it('decodes raw wrappers in frames, init scripts and event handlers', () => {
    const p = transpileProject([
      { path: 'scripts/frame_1/DoAction.as', content: 'avm1Actions("BwA=");' },
      { path: 'scripts/DefineSprite_5/DoInitAction.as', content: `avm1Actions("${SAMPLE}");` },
      { path: 'scripts/DefineButton2_7/on(release).as', content: `on(release) { avm1Actions("${SAMPLE}"); }` },
    ]);
    expect([...p.files.values()].join('\n')).not.toContain('avm1Actions(');
    expect(p.files.get('timelines/root.ts')).toContain('$t.stop();');
    expect(p.files.get('buttons/button_7.ts')).toContain('"setMessage", ""');
  });

  it('resolves UTF-8 constants and both constant index widths', () => {
    const payload = base64([
      ...record(0x88, [2, 0, ...text('message'), ...text('héllo 魚')]),
      ...record(0x96, [8, 0, 9, 1, 0]), 0x1d, 0,
    ]);
    expect(compare(payload, () => ({}), (c) => c.message)).toContain('$t.message = "héllo 魚";');
  });

  it('preserves registers, duplicates, getters and reversed call arguments', () => {
    const payload = base64([
      ...push('result', 'next'), 0x1c, 0x4c,
      ...record(0x87, [1]), 0x17, ...reg(1), 0x47, 0x1d,
      ...push(0, 'getSecond'), 0x3d,
      ...push(0, 'getFirst'), 0x3d,
      ...push(2, 'capture'), 0x3d, 0x17, 0,
    ]);
    const make = () => ({
      log: [] as unknown[], result: 0,
      get next() { this.log.push('getter'); return 4; },
      getSecond() { this.log.push('second'); return 2; },
      getFirst() { this.log.push('first'); return 1; },
      capture(...args: number[]) { this.log.push(args); },
    });
    compare(payload, make, (c) => [c.result, c.log]);
  });

  it.each([true, false])('reconstructs if/else and assignments (condition %s)', (condition) => {
    const a = new Asm().add(...push('condition'), 0x1c).branch(0x9d, 'yes')
      .add(...push('result', 'no'), 0x1d).branch(0x99, 'end')
      .label('yes').add(...push('result', 'yes'), 0x1d).label('end');
    const code = compare(a.finish(), () => ({ condition }), (c) => c.result);
    expect(code).toContain('if (!($t.condition))'); expect(code).toContain('} else {');
  });

  it('reconstructs a while loop with reevaluated condition and an execution budget', () => {
    const a = new Asm().add(...push('i', 0), 0x1d).label('test')
      .add(...push('i'), 0x1c, ...push(3), 0x48, 0x12).branch(0x9d, 'end')
      .add(...push('i', 'i'), 0x1c, 0x50, 0x1d).branch(0x99, 'test').label('end');
    const code = compare(a.finish(), () => ({}), (c) => c.i);
    expect(code).toContain('while ('); expect(code).toContain('loop budget exceeded');
  });

  it('emits functions with local parameters, return values and dynamic this', () => {
    const body = [...push('this'), 0x1c, ...push('base'), 0x4e, ...push('n'), 0x1c, 0x47, 0x3e];
    const payload = base64([
      ...record(0x9b, [...text('add'), 1, 0, ...text('n'), body.length, 0]), ...body,
      ...push('result', 2, 1, 'add'), 0x3d, 0x1d, 0,
    ]);
    const code = compare(payload, () => ({ base: 10 }), (c) => c.result);
    expect(code).toContain('function (this: any, n?: any)'); expect(code).toContain('(this ?? $t)?.base');
  });

  it('decodes DefineFunction2 parameter registers and preload-this', () => {
    const body = [...reg(1), ...push('base'), 0x4e, ...reg(2), 0x47, 0x3e];
    const payload = base64([
      ...record(0x8e, [...text('add'), 1, 0, 3, 1, 0, 2, ...text('n'), body.length, 0]), ...body,
      ...push('result', 5, 1, 'add'), 0x3d, 0x1d, 0,
    ]);
    compare(payload, () => ({ base: 10 }), (c) => c.result);
  });

  it('decodes SWF word-swapped doubles, floats, booleans and null without losing negative zero', () => {
    const double = new Uint8Array(8);
    new DataView(double.buffer).setFloat64(0, -0, true);
    const payload = base64([
      ...push('zero'), ...record(0x96, [6, ...double.slice(4), ...double.slice(0, 4)]), 0x1d,
      ...push('float'), ...record(0x96, [1, 0, 0, 192, 63]), 0x1d,
      ...push('flag', true), 0x1d, ...push('nil'), ...record(0x96, [2]), 0x1d, 0,
    ]);
    compare(payload, () => ({}), (c) => [Object.is(c.zero, -0), c.float, c.flag, c.nil]);
  });

  it('builds arrays and objects in AVM1 pop order', () => {
    const payload = base64([
      ...push('array', 3, 2, 1, 3), 0x42, 0x1d,
      ...push('object', 'a', 1, 'b', 2, 2), 0x43, 0x1d, 0,
    ]);
    compare(payload, () => ({}), (c) => [c.array, c.object]);
  });

  it('keeps closure locals distinct from nested function locals', () => {
    const innerBody = [...push('y', 5), 0x3c, ...push('x'), 0x1c, ...push('y'), 0x1c, 0x47, 0x3e];
    const inner = [...record(0x9b, [...text(''), 0, 0, innerBody.length, 0]), ...innerBody];
    const outerBody = [...push('x', 7), 0x3c, ...inner, 0x3e];
    const payload = base64([
      ...record(0x9b, [...text('outer'), 0, 0, outerBody.length, 0]), ...outerBody,
      ...push('inner', 0, 'outer'), 0x3d, 0x1d,
      ...push('result', 0, 'inner'), 0x3d, 0x1d, 0,
    ]);
    compare(payload, () => ({}), (c) => c.result);
  });

  it('shares one iteration budget across nested loops', () => {
    const a = new Asm().add(...push('i', 0), 0x1d).label('outer')
      .add(...push('i'), 0x1c, ...push(2), 0x48, 0x12).branch(0x9d, 'done')
      .add(...push('j', 0), 0x1d).label('inner')
      .add(...push('j'), 0x1c, ...push(3), 0x48, 0x12).branch(0x9d, 'next')
      .add(...push('j', 'j'), 0x1c, 0x50, 0x1d).branch(0x99, 'inner')
      .label('next').add(...push('i', 'i'), 0x1c, 0x50, 0x1d).branch(0x99, 'outer').label('done');
    const code = compare(a.finish(), () => ({}), (c) => [c.i, c.j]);
    expect(code.match(/let \$iterations = 0/g)).toHaveLength(1);
    expect(code.match(/\+\+\$iterations/g)).toHaveLength(2);
  });

  it('uses one-based frame numbers and keeps animation commands visible', () => {
    const code = decodeAVM1Actions(base64([...record(0x81, [4, 0]), 6, 7, 0])).code;
    expect(code).toBe('$t.gotoAndStop(5);\n$t.play();\n$t.stop();');
  });

  it.each([
    [0x07, 0xff, 0, 0, 0], // unsupported after valid prefix
    [0x96, 20, 0, 0], // truncated record
    [...record(0x96, [0, 97])], // unterminated string
    [0x1d], // underflow
    [...record(0x96, [8, 0]), 0], // missing pool
    [...record(0x99, [0xff, 0xff]), 0], // target inside record
    [...record(0x94, [0, 0]), 0], // with
  ])('falls back atomically for unsafe or malformed actions: %j', (...bytes) => {
    const payload = base64(bytes);
    const decoded = decodeAVM1Actions(payload);
    expect(decoded.code).toBeNull(); expect(decoded.diagnostics).toHaveLength(1);
    const ts = transpileScript(`avm1Actions("${payload}");`);
    expect(ts.code).toContain(`$rt.avm1Actions($t, "${payload}")`);
    expect(ts.code).not.toContain('$t.stop();');
    expect(ts.diagnostics[0].message).toContain('byte ');
  });

  it('does not rewrite comments, strings, shadowed functions or arbitrary calls', () => {
    expect(transpileScript('trace("avm1Actions(\\"BwA=\\")");').code).toContain('trace(');
    expect(transpileScript('function f(avm1Actions) { avm1Actions("BwA="); }').code).not.toContain('Decoded AVM1');
    expect(transpileScript('other.avm1Actions("BwA=");').code).not.toContain('Decoded AVM1');
  });

  it('allows explicit interpreter-only export', () => {
    expect(transpileScript(`avm1Actions("${SAMPLE}");`, { avm1: 'interpret' }).code).toContain(SAMPLE);
    expect(decodeAVM1Actions('not base64!').code).toBeNull();
  });
});
