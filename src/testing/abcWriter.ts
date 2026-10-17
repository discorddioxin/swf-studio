// Tests only: serialize an `AbcFile` (the model `parseAbc` returns) back to ABC
// bytes, so hand-assembled programs (transcom/transpiler/avm2/testAbc.ts) can be
// wrapped in a real SWF and read by the same reader the app uses.
//
// The model is partly resolved: method bodies refer to the constant pools by
// index, but class, trait and type names are already strings. So the pools are
// written exactly as given (every index a body uses stays valid) and a resolved
// name is looked up in them; only a name the pools do not hold is appended.
//
// Layout and encodings: AVM2 overview §4 ("abcFile"). Nothing in src/ imports
// this at run time.
import type { AbcFile, AbcMethodInfo, AbcMultiname, AbcTrait } from '../../transcom/decompiler/swf/abc';

const NAMESPACE_CODE: Record<string, number> = {
  private: 0x05, namespace: 0x08, package: 0x16, packageInternal: 0x17,
  protected: 0x18, explicit: 0x19, staticProtected: 0x1a,
};
const MULTINAME_CODE: Record<string, number> = {
  QName: 0x07, QNameA: 0x0d, RTQName: 0x0f, RTQNameA: 0x10, RTQNameL: 0x11, RTQNameLA: 0x12,
  Multiname: 0x09, MultinameA: 0x0e, MultinameL: 0x1b, MultinameLA: 0x1c, TypeName: 0x1d,
};
const TRAIT_CODE: Record<string, number> = { slot: 0, method: 1, getter: 2, setter: 3, class: 4, function: 5, const: 6 };

class Bytes {
  private out: number[] = [];
  u8(v: number) { this.out.push(v & 0xff); }
  u16(v: number) { this.u8(v); this.u8(v >> 8); }
  u30(v: number) {
    // (also the uint pool's u32, which uses the same encoding)
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new Error(`u30 out of range: ${v}`);
    do { const b = v & 0x7f; v >>>= 7; this.u8(v ? b | 0x80 : b); } while (v);
  }
  s32(v: number) {
    v |= 0;
    for (;;) {
      const b = v & 0x7f; v >>= 7;
      const done = (v === 0 && !(b & 0x40)) || (v === -1 && (b & 0x40));
      this.u8(done ? b : b | 0x80);
      if (done) return;
    }
  }
  d64(v: number) { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, v, true); for (let i = 0; i < 8; i++) this.u8(d.getUint8(i)); }
  utf8(s: string) { const b = new TextEncoder().encode(s); this.u30(b.length); this.raw(b); }
  raw(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.out.push(b[i]); }
  bytes(): Uint8Array { return Uint8Array.from(this.out); }
}

/** The readable name `parseAbc` gives multiname `mn` (mirrors its `multinameName`). */
function readable(mn: AbcMultiname): string {
  const suffix = /^(MultinameL|MultinameLA|RTQNameL|RTQNameLA)$/.test(mn.kind) ? '*' : mn.name;
  return mn.ns ? `${mn.ns}.${suffix}` : suffix;
}

export function writeAbc(abc: AbcFile): Uint8Array {
  // Working copies of the pools: index 0 is each pool's implicit entry.
  const ints = abc.ints.slice();
  const uints = abc.uints.slice();
  const doubles = abc.doubles.slice();
  const strings = abc.strings.slice();
  const namespaces = abc.namespaces.slice();
  const nsSets = abc.nsSets.slice();
  const multinames = abc.multinames.slice();

  const intern = <T>(pool: T[], value: T, same: (a: T, b: T) => boolean = Object.is): number => {
    for (let i = 1; i < pool.length; i++) if (same(pool[i], value)) return i;
    pool.push(value);
    return pool.length - 1;
  };
  const string = (s: string) => (s === '' ? 0 : intern(strings, s));
  const namespace = (kind: string, name: string) =>
    intern(namespaces, { kind, name }, (a, b) => a.kind === b.kind && a.name === b.name);
  const nsSet = (names: string[]) =>
    intern(nsSets, names, (a, b) => a.length === b.length && a.every((n, i) => n === b[i]));
  /** A resolved name (`com.foo.Bar`, `Bar`, `*`) back to a multiname index. */
  const name = (resolved: string | undefined): number => {
    if (!resolved || resolved === '*') return 0;
    let fallback = 0;
    for (let i = 1; i < multinames.length; i++) {
      if (readable(multinames[i]) !== resolved) continue;
      if (multinames[i].kind === 'QName') return i;
      fallback ||= i;
    }
    if (fallback) return fallback;
    const dot = resolved.lastIndexOf('.');
    multinames.push({ kind: 'QName', name: resolved.slice(dot + 1), ns: dot < 0 ? '' : resolved.slice(0, dot), nsKind: 'package' });
    return multinames.length - 1;
  };
  /** `vindex` for a constant of kind `vkind` (§4.5.1); true/false/null carry their kind. */
  const constant = (vkind: number, value: unknown): number => {
    switch (vkind) {
      case 0x01: return intern(strings, String(value ?? ''));
      case 0x03: return intern(ints, Number(value));
      case 0x04: return intern(uints, Number(value));
      case 0x06: return intern(doubles, Number(value)); // (not 0 for NaN: a trait reads vindex 0 as "no value")
      case 0x0a: case 0x0b: case 0x0c: return vkind;
      case 0x00: return 0;
      default: {
        const kind = Object.keys(NAMESPACE_CODE).find((k) => NAMESPACE_CODE[k] === vkind) ?? 'namespace';
        return namespace(kind, String(value ?? ''));
      }
    }
  };
  const optionalKind = (o: AbcMethodInfo['optional'][number]): number => {
    switch (o.kind) {
      case 'string': return 0x01;
      case 'number': {
        // The model keeps only "number": reuse the pool that already holds it.
        const v = o.value as number;
        if (abc.ints.some((x, i) => i > 0 && Object.is(x, v))) return 0x03;
        if (abc.uints.some((x, i) => i > 0 && x === v)) return 0x04;
        if (abc.doubles.some((x, i) => i > 0 && Object.is(x, v))) return 0x06;
        return Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff ? 0x03 : 0x06;
      }
      case 'bool': return o.value ? 0x0b : 0x0a;
      case 'null': return 0x0c;
      case 'undefined': return 0x00;
      default: return 0x08;
    }
  };

  // Everything after the constant pool first: writing it interns names.
  const tail = new Bytes();
  const traits = (list: AbcTrait[]) => {
    tail.u30(list.length);
    for (const t of list) {
      const kind = TRAIT_CODE[t.kind];
      if (kind === undefined) throw new Error(`unknown trait kind '${t.kind}' for '${t.name}'`);
      const hasMetadata = t.metadata.length > 0;
      const attr = (t.attr.final ? 1 : 0) | (t.attr.override ? 2 : 0) | (hasMetadata ? 4 : 0);
      tail.u30(name(t.name));
      tail.u8(kind | (attr << 4));
      switch (kind) {
        case 0: case 6:
          tail.u30(t.slotId ?? 0);
          tail.u30(name(t.type));
          if (t.valueKind === undefined) tail.u30(0);
          else { tail.u30(constant(t.valueKind, t.value)); tail.u8(t.valueKind); }
          break;
        case 1: case 2: case 3: tail.u30(0); tail.u30(t.method ?? 0); break; // disp_id 0
        case 4: tail.u30(t.slotId ?? 0); tail.u30(t.classIndex ?? 0); break;
        case 5: tail.u30(t.slotId ?? 0); tail.u30(t.method ?? 0); break;
      }
      if (hasMetadata) {
        tail.u30(t.metadata.length);
        for (const m of t.metadata) {
          const index = abc.metadata.indexOf(m);
          if (index < 0) throw new Error(`trait '${t.name}' names unknown metadata '${m}'`);
          tail.u30(index);
        }
      }
    }
  };

  tail.u30(abc.methods.length);
  for (const m of abc.methods) {
    tail.u30(m.paramTypes.length);
    tail.u30(name(m.returnType));
    for (const p of m.paramTypes) tail.u30(name(p));
    tail.u30(string(m.name));
    const named = m.paramNames.length > 0;
    tail.u8((m.needArguments ? 0x01 : 0) | (m.needActivation ? 0x02 : 0) | (m.needRest ? 0x04 : 0)
      | (m.optional.length ? 0x08 : 0) | (named ? 0x80 : 0));
    if (m.optional.length) {
      tail.u30(m.optional.length);
      for (const o of m.optional) { const vkind = optionalKind(o); tail.u30(constant(vkind, o.value)); tail.u8(vkind); }
    }
    if (named) for (const p of m.paramNames) tail.u30(string(p));
  }

  tail.u30(abc.metadata.length);
  for (const m of abc.metadata) { tail.u30(string(m)); tail.u30(0); } // names only: the model keeps no items

  tail.u30(abc.classes.length);
  for (const { instance: i } of abc.classes) {
    tail.u30(name(i.name));
    tail.u30(name(i.superName));
    tail.u8((i.sealed ? 0x01 : 0) | (i.isFinal ? 0x02 : 0) | (i.isInterface ? 0x04 : 0) | (i.protectedNs !== undefined ? 0x08 : 0));
    if (i.protectedNs !== undefined) tail.u30(namespace('protected', i.protectedNs));
    tail.u30(i.interfaces.length);
    for (const n of i.interfaces) tail.u30(name(n));
    tail.u30(i.iinit);
    traits(i.traits);
  }
  for (const c of abc.classes) { tail.u30(c.cinit); traits(c.traits); }

  tail.u30(abc.scripts.length);
  for (const s of abc.scripts) { tail.u30(s.init); traits(s.traits); }

  tail.u30(abc.bodies.length);
  for (const b of abc.bodies) {
    tail.u30(b.method); tail.u30(b.maxStack); tail.u30(b.localCount);
    tail.u30(b.initScopeDepth); tail.u30(b.maxScopeDepth);
    tail.u30(b.code.length); tail.raw(b.code);
    tail.u30(b.exceptions.length);
    for (const e of b.exceptions) { tail.u30(e.from); tail.u30(e.to); tail.u30(e.target); tail.u30(name(e.type)); tail.u30(name(e.name)); }
    traits(b.traits);
  }

  // Multinames can intern strings, namespaces and sets: encode them before the pools.
  const names = new Bytes();
  for (let i = 1; i < multinames.length; i++) {
    const mn = multinames[i];
    const code = MULTINAME_CODE[mn.kind];
    if (code === undefined) throw new Error(`unknown multiname kind '${mn.kind}' (#${i})`);
    names.u8(code);
    switch (code) {
      case 0x07: case 0x0d: names.u30(namespace(mn.nsKind ?? 'package', mn.ns ?? '')); names.u30(string(mn.name)); break;
      case 0x0f: case 0x10: names.u30(string(mn.name)); break;
      case 0x11: case 0x12: break;
      case 0x09: case 0x0e: names.u30(string(mn.name)); names.u30(nsSet(mn.nsSet ?? [])); break;
      case 0x1b: case 0x1c: names.u30(nsSet(mn.nsSet ?? [])); break;
      case 0x1d: names.u30(string(mn.name)); names.u30(mn.params?.length ?? 0); for (const p of mn.params ?? []) names.u30(Number(p)); break;
    }
  }
  // A set is stored as names; a member the pool lacks is a public package namespace.
  const setBytes = new Bytes();
  for (let i = 1; i < nsSets.length; i++) {
    setBytes.u30(nsSets[i].length);
    for (const n of nsSets[i]) {
      const found = namespaces.findIndex((ns, j) => j > 0 && ns.name === n);
      setBytes.u30(found > 0 ? found : namespace('package', n));
    }
  }
  // Namespaces can intern strings last of all.
  const nsBytes = new Bytes();
  for (let i = 1; i < namespaces.length; i++) {
    const code = NAMESPACE_CODE[namespaces[i].kind];
    if (code === undefined) throw new Error(`unknown namespace kind '${namespaces[i].kind}' (#${i})`);
    nsBytes.u8(code);
    nsBytes.u30(string(namespaces[i].name));
  }

  const [major, minor] = abc.version.split('.').map(Number);
  const out = new Bytes();
  out.u16(minor); out.u16(major);
  const pool = <T>(list: T[], write: (v: T) => void) => { out.u30(list.length > 1 ? list.length : 0); for (let i = 1; i < list.length; i++) write(list[i]); };
  pool(ints, (v) => out.s32(v));
  pool(uints, (v) => out.u30(v));
  pool(doubles, (v) => out.d64(v));
  pool(strings, (v) => out.utf8(v));
  out.u30(namespaces.length > 1 ? namespaces.length : 0); out.raw(nsBytes.bytes());
  out.u30(nsSets.length > 1 ? nsSets.length : 0); out.raw(setBytes.bytes());
  out.u30(multinames.length > 1 ? multinames.length : 0); out.raw(names.bytes());
  out.raw(tail.bytes());
  return out.bytes();
}
