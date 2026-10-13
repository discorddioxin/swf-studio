// ABC (AVM2 bytecode) container reader and disassembler.
//
// An AS3 movie keeps its code in `DoABC` tags: one ABC "file" per tag, holding a
// constant pool, method signatures, class/instance/script definitions and the
// method bodies (the actual AVM2 instructions). This module reads that
// structure exactly as AVM2 spec §"ABC File Format" describes, so the studio can
// pull code out of a SWF the same way it already does for AVM1 — no external
// tool, no hand-supplied sources.
//
// What it does NOT do (yet): emit TypeScript or execute the instructions. It is
// the front half of that pipeline — the same role `decompiler/swf/binary.ts`
// plays for AVM1 before `transpiler/as2/avm1.ts` structures it.

// ------------------------------------------------------------------ reader

class AbcReader {
  pos = 0;
  constructor(readonly data: Uint8Array) {}

  need(n: number) {
    if (this.pos + n > this.data.length) {
      throw new Error(`ABC truncated at byte ${this.pos} (wanted ${n} more of ${this.data.length})`);
    }
  }
  u8(): number { this.need(1); return this.data[this.pos++]; }
  u16(): number { this.need(2); const v = this.data[this.pos] | (this.data[this.pos + 1] << 8); this.pos += 2; return v; }
  /** variable-length unsigned (LEB128, up to 32 bits) */
  u30(): number {
    let result = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.u8();
      result |= (b & 0x7f) << (7 * i);
      if ((b & 0x80) === 0) return result >>> 0;
    }
    throw new Error(`malformed u30 at byte ${this.pos}`);
  }
  /** variable-length signed (LEB128) */
  s32(): number {
    let result = 0;
    let shift = 0;
    let b = 0;
    do {
      b = this.u8();
      result |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80 && shift < 35);
    if (shift < 32 && (b & 0x40)) result |= -(1 << shift);
    return result | 0;
  }
  d64(): number { this.need(8); const v = new DataView(this.data.buffer, this.data.byteOffset + this.pos, 8).getFloat64(0, true); this.pos += 8; return v; }
  utf8(): string {
    const len = this.u30();
    this.need(len);
    const bytes = this.data.subarray(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  /** signed 24-bit little-endian (branch operand) */
  s24(): number {
    const v = this.u8() | (this.u8() << 8) | (this.u8() << 16);
    return (v << 8) >> 8;
  }
}

// ------------------------------------------------------------- exact shapes

const MULTINAME_KIND: Record<number, string> = {
  0x07: 'QName', 0x09: 'Multiname', 0x0d: 'QNameA', 0x0e: 'MultinameA',
  0x0f: 'RTQName', 0x10: 'RTQNameA', 0x11: 'RTQNameL', 0x12: 'RTQNameLA',
  0x1b: 'MultinameL', 0x1c: 'MultinameLA', 0x1d: 'TypeName',
};

const NAMESPACE_KIND: Record<number, string> = {
  0x05: 'private', 0x08: 'namespace', 0x16: 'package', 0x17: 'packageInternal',
  0x18: 'protected', 0x19: 'explicit', 0x1a: 'staticProtected',
};

const TRAIT_KIND: Record<number, string> = {
  0: 'slot', 1: 'method', 2: 'getter', 3: 'setter', 4: 'class', 5: 'function', 6: 'const',
};

const VALUE_KIND: Record<number, 'string' | 'number' | 'bool' | 'null' | 'raw'> = {
  0x01: 'string', 0x03: 'number', 0x04: 'number', 0x06: 'number',
  0x0a: 'bool', 0x0b: 'bool', 0x0c: 'null',
};

export interface AbcNamespace { kind: string; name: string }
export interface AbcMultiname {
  kind: string; name: string; ns?: string; nsSet?: string[]; params?: string[];
}
export interface AbcMethodInfo {
  name: string; returnType: string; paramTypes: string[]; paramNames: string[];
  optional: { kind: string; value: string | number | boolean | null }[];
  needArguments: boolean; needActivation: boolean; needRest: boolean;
}
export interface AbcTrait {
  name: string; kind: string; attr: { final: boolean; override: boolean; metadata: boolean };
  type?: string; slotId?: number; method?: number; classIndex?: number;
  value?: string | number | boolean | null; metadata: string[];
}
export interface AbcInstance {
  name: string; superName: string; interfaces: string[]; iinit: number; traits: AbcTrait[];
  sealed: boolean; isFinal: boolean; isInterface: boolean; protectedNs?: string;
}
export interface AbcClassDef { instance: AbcInstance; cinit: number; traits: AbcTrait[] }
export interface AbcScript { init: number; traits: AbcTrait[] }
export interface AbcMethodBody {
  method: number; maxStack: number; localCount: number;
  initScopeDepth: number; maxScopeDepth: number;
  code: Uint8Array;
  exceptions: { from: number; to: number; target: number; type: string; name: string }[];
  traits: AbcTrait[];
}
export interface AbcFile {
  version: string;
  strings: string[];
  namespaces: AbcNamespace[];
  nsSets: string[][];
  multinames: AbcMultiname[];
  methods: AbcMethodInfo[];
  classes: AbcClassDef[];
  scripts: AbcScript[];
  bodies: AbcMethodBody[];
  metadata: string[];
}

/** Resolve a multiname to its readable form (`com.foo.Bar`, `Bar`, `"*"` …). */
function multinameName(abc: AbcFile, index: number): string {
  const mn = abc.multinames[index];
  if (!mn) return `#${index}`;
  const suffix = mn.kind === 'MultinameL' || mn.kind === 'MultinameLA' ? '*'
    : mn.kind === 'RTQNameL' || mn.kind === 'RTQNameLA' ? '*' : mn.name;
  if (mn.ns && mn.ns !== '') return `${mn.ns}.${suffix}`;
  return suffix;
}

// ---------------------------------------------------------------- the parse

export function parseAbc(data: Uint8Array): AbcFile {
  const r = new AbcReader(data);
  const minor = r.u16();
  const major = r.u16();
  const version = `${major}.${minor}`;
  if (major < 40 || major > 70) {
    throw new Error(`not an ABC payload (major version ${major})`);
  }

  const ints: number[] = [0];
  for (let i = 1, n = r.u30(); i < n; i++) ints.push(r.s32());
  const uints: number[] = [0];
  for (let i = 1, n = r.u30(); i < n; i++) uints.push(r.u30());
  const doubles: number[] = [0];
  for (let i = 1, n = r.u30(); i < n; i++) doubles.push(r.d64());

  const strings: string[] = [''];
  for (let i = 1, n = r.u30(); i < n; i++) strings.push(r.utf8());

  const namespaces: AbcNamespace[] = [{ kind: '?', name: '' }];
  for (let i = 1, n = r.u30(); i < n; i++) {
    const kind = r.u8();
    const name = strings[r.u30()] ?? '';
    namespaces.push({ kind: NAMESPACE_KIND[kind] ?? `0x${kind.toString(16)}`, name });
  }

  const nsSets: string[][] = [[]];
  for (let i = 1, n = r.u30(); i < n; i++) {
    const set: string[] = [];
    for (let j = 0, c = r.u30(); j < c; j++) {
      const ns = namespaces[r.u30()];
      set.push(ns?.name ?? '');
    }
    nsSets.push(set);
  }

  const multinames: AbcMultiname[] = [{ kind: '?', name: '' }];
  for (let i = 1, n = r.u30(); i < n; i++) {
    const kind = r.u8();
    const label = MULTINAME_KIND[kind] ?? `0x${kind.toString(16)}`;
    switch (kind) {
      case 0x07: case 0x0d: {
        const ns = namespaces[r.u30()]?.name ?? '';
        multinames.push({ kind: label, name: strings[r.u30()] ?? '', ns });
        break;
      }
      case 0x0f: case 0x10:
        multinames.push({ kind: label, name: strings[r.u30()] ?? '' });
        break;
      case 0x11: case 0x12:
        multinames.push({ kind: label, name: '' });
        break;
      case 0x09: case 0x0e: {
        const name = strings[r.u30()] ?? '';
        multinames.push({ kind: label, name, nsSet: nsSets[r.u30()] ?? [] });
        break;
      }
      case 0x1b: case 0x1c:
        multinames.push({ kind: label, name: '', nsSet: nsSets[r.u30()] ?? [] });
        break;
      case 0x1d: {
        const name = strings[r.u30()] ?? '';
        const params: string[] = [];
        for (let j = 0, c = r.u30(); j < c; j++) params.push(`${r.u30()}`);
        multinames.push({ kind: label, name, params });
        break;
      }
      default:
        throw new Error(`unknown multiname kind 0x${kind.toString(16)} (#${i} of ${n - 1})`);
    }
  }

  const methods: AbcMethodInfo[] = [];
  for (let i = 0, n = r.u30(); i < n; i++) {
    const paramCount = r.u30();
    const returnType = multinameName({ multinames } as AbcFile, r.u30());
    const paramTypes = Array.from({ length: paramCount }, () => multinameName({ multinames } as AbcFile, r.u30()));
    const name = strings[r.u30()] ?? '';
    const flags = r.u8();
    const optional: AbcMethodInfo['optional'] = [];
    if (flags & 0x08) {
      for (let j = 0, c = r.u30(); j < c; j++) {
        const valueIndex = r.u30();
        const kind = r.u8();
        const shape = VALUE_KIND[kind] ?? 'raw';
        optional.push({
          kind: shape,
          value: shape === 'string' ? strings[valueIndex] ?? '' : shape === 'number'
            ? (kind === 0x03 ? ints[valueIndex] ?? 0 : kind === 0x04 ? uints[valueIndex] ?? 0 : doubles[valueIndex] ?? 0)
            : shape === 'bool' ? kind === 0x0b : shape === 'null' ? null : valueIndex,
        });
      }
    }
    const paramNames: string[] = [];
    if (flags & 0x80) for (let j = 0; j < paramCount; j++) paramNames.push(strings[r.u30()] ?? '');
    methods.push({
      name, returnType, paramTypes, paramNames, optional,
      needArguments: !!(flags & 0x01), needActivation: !!(flags & 0x02), needRest: !!(flags & 0x04),
    });
  }

  // metadata_info is a name (string index), a count, then 2*count string
  // indices as key/value pairs — no leading "kind" field. Checked against the
  // 1,149 metadata-bearing payloads of an independent 4,916-SWF corpus: none of
  // them parse when a kind field is assumed, 866 parse to their exact end here.
  const metadata: string[] = [];
  for (let i = 0, n = r.u30(); i < n; i++) {
    const name = strings[r.u30()] ?? '';
    for (let j = 0, c = r.u30(); j < c; j++) { r.u30(); r.u30(); }
    metadata.push(name);
  }

  const metadataIndex = (index: number) => metadata[index] ?? `#${index}`;

  const readTraits = (): AbcTrait[] => {
    const traits: AbcTrait[] = [];
    for (let i = 0, n = r.u30(); i < n; i++) {
      const name = multinameName({ multinames } as AbcFile, r.u30());
      const tag = r.u8();
      const kind = tag & 0x0f;
      const attr = tag >> 4;
      const trait: AbcTrait = {
        name, kind: TRAIT_KIND[kind] ?? `kind ${kind}`,
        attr: { final: !!(attr & 1), override: !!(attr & 2), metadata: !!(attr & 4) },
        metadata: [],
      };
      switch (kind) {
        case 0: case 6: {
          trait.slotId = r.u30();
          trait.type = `${r.u30()}`;
          const vindex = r.u30();
          if (vindex !== 0) {
            const vkind = r.u8();
            const shape = VALUE_KIND[vkind] ?? 'raw';
            trait.value = shape === 'string' ? strings[vindex] ?? ''
              : shape === 'number' ? (vkind === 0x03 ? ints[vindex] ?? 0 : vkind === 0x04 ? uints[vindex] ?? 0 : doubles[vindex] ?? 0)
                : shape === 'bool' ? vkind === 0x0b : shape === 'null' ? null : vindex;
          }
          break;
        }
        case 1: case 2: case 3:
          r.u30(); // disp_id
          trait.method = r.u30();
          break;
        case 4:
          trait.slotId = r.u30();
          trait.classIndex = r.u30();
          break;
        case 5:
          trait.slotId = r.u30();
          trait.method = r.u30();
          break;
        default:
          throw new Error(`unknown trait kind ${kind} for '${name}'`);
      }
      if (attr & 4) for (let j = 0, c = r.u30(); j < c; j++) trait.metadata.push(metadataIndex(r.u30()));
      traits.push(trait);
    }
    return traits;
  };

  // The file lists every instance_info first, then every class_info — one count
  // for the pair (AVM2 spec §class_info; the interleaved spelling parses garbage).
  const instances: AbcInstance[] = [];
  for (let i = 0, n = r.u30(); i < n; i++) {
    const name = multinameName({ multinames } as AbcFile, r.u30());
    const superName = multinameName({ multinames } as AbcFile, r.u30());
    const flags = r.u8();
    const protectedNs = (flags & 0x08) ? namespaces[r.u30()]?.name : undefined;
    const interfaces: string[] = [];
    for (let j = 0, c = r.u30(); j < c; j++) interfaces.push(multinameName({ multinames } as AbcFile, r.u30()));
    const iinit = r.u30();
    instances.push({
      name, superName, interfaces, iinit, traits: readTraits(),
      sealed: !!(flags & 0x01), isFinal: !!(flags & 0x02), isInterface: !!(flags & 0x04),
      protectedNs,
    });
  }

  const classes: AbcClassDef[] = [];
  for (let i = 0; i < instances.length; i++) {
    const cinit = r.u30();
    classes.push({ instance: instances[i], cinit, traits: readTraits() });
  }

  const scripts: AbcScript[] = [];
  for (let i = 0, n = r.u30(); i < n; i++) {
    const init = r.u30();
    scripts.push({ init, traits: readTraits() });
  }

  const bodies: AbcMethodBody[] = [];
  for (let i = 0, n = r.u30(); i < n; i++) {
    const method = r.u30();
    const maxStack = r.u30();
    const localCount = r.u30();
    const initScopeDepth = r.u30();
    const maxScopeDepth = r.u30();
    const codeLength = r.u30();
    r.need(codeLength);
    const code = data.subarray(r.pos, r.pos + codeLength);
    r.pos += codeLength;
    const exceptions: AbcMethodBody['exceptions'] = [];
    for (let j = 0, c = r.u30(); j < c; j++) {
      exceptions.push({
        from: r.u30(), to: r.u30(), target: r.u30(),
        type: multinameName({ multinames } as AbcFile, r.u30()),
        name: multinameName({ multinames } as AbcFile, r.u30()),
      });
    }
    bodies.push({
      method, maxStack, localCount, initScopeDepth, maxScopeDepth, code, exceptions,
      traits: readTraits(),
    });
  }

  return {
    version, strings, namespaces, nsSets, multinames, methods, classes, scripts, bodies, metadata,
  };
}

// ------------------------------------------------------------- disassembly

type OperandKind = 'u8' | 'u30' | 's24' | 'switch';

/** AVM2 instruction set: opcode → name and operand shape (AVM2 spec, ch. 4). */
const OPCODES: Record<number, [string, OperandKind[]]> = {
  // The AVM2 instruction set — every opcode the spec defines, with the operand
  // shapes it defines. The unused slots (0x00, 0x0a, 0x22, 0x33/0x34, 0x3f,
  // 0x4b, 0x4d, 0x54, 0x5b, 0x5c, 0x69, 0x6b, 0x79-0x7f, 0x8a-0x8f,
  // 0x98-0x9f, 0xb5-0xbf, 0xc8-0xcf, 0xd8-0xee, 0xf4-0xff) are absent on
  // purpose: a byte landing there is a desynchronised walk, not an instruction.
  0x01: ['bkpt', []],
  0x02: ['nop', []],
  0x03: ['throw', []],
  0x04: ['get_super', ['u30']],
  0x05: ['set_super', ['u30']],
  0x06: ['dxns', ['u30']],
  0x07: ['dxns_late', []],
  0x08: ['kill', ['u30']],
  0x09: ['label', []],
  0x0c: ['if_nlt', ['s24']],
  0x0d: ['if_nle', ['s24']],
  0x0e: ['if_ngt', ['s24']],
  0x0f: ['if_nge', ['s24']],
  0x10: ['jump', ['s24']],
  0x11: ['if_true', ['s24']],
  0x12: ['if_false', ['s24']],
  0x13: ['if_eq', ['s24']],
  0x14: ['if_ne', ['s24']],
  0x15: ['if_lt', ['s24']],
  0x16: ['if_le', ['s24']],
  0x17: ['if_gt', ['s24']],
  0x18: ['if_ge', ['s24']],
  0x19: ['if_strict_eq', ['s24']],
  0x1a: ['if_strict_ne', ['s24']],
  0x1b: ['lookup_switch', ['switch']],
  0x1c: ['push_with', []],
  0x1d: ['pop_scope', []],
  0x1e: ['next_name', []],
  0x1f: ['has_next', []],
  0x20: ['push_null', []],
  0x21: ['push_undefined', []],
  0x23: ['next_value', []],
  0x24: ['push_byte', ['u8']],
  0x25: ['push_short', ['u30']],
  0x26: ['push_true', []],
  0x27: ['push_false', []],
  0x28: ['push_na_n', []],
  0x29: ['pop', []],
  0x2a: ['dup', []],
  0x2b: ['swap', []],
  0x2c: ['push_string', ['u30']],
  0x2d: ['push_int', ['u30']],
  0x2e: ['push_uint', ['u30']],
  0x2f: ['push_double', ['u30']],
  0x30: ['push_scope', []],
  0x31: ['push_namespace', ['u30']],
  0x32: ['has_next2', ['u30', 'u30']],
  0x35: ['li8', []],
  0x36: ['li16', []],
  0x37: ['li32', []],
  0x38: ['lf32', []],
  0x39: ['lf64', []],
  0x3a: ['si8', []],
  0x3b: ['si16', []],
  0x3c: ['si32', []],
  0x3d: ['sf32', []],
  0x3e: ['sf64', []],
  0x40: ['new_function', ['u30']],
  0x41: ['call', ['u30']],
  0x42: ['construct', ['u30']],
  0x43: ['call_method', ['u30', 'u30']],
  0x44: ['call_static', ['u30', 'u30']],
  0x45: ['call_super', ['u30', 'u30']],
  0x46: ['call_property', ['u30', 'u30']],
  0x47: ['return_void', []],
  0x48: ['return_value', []],
  0x49: ['construct_super', ['u30']],
  0x4a: ['construct_prop', ['u30', 'u30']],
  0x4c: ['call_prop_lex', ['u30', 'u30']],
  0x4e: ['call_super_void', ['u30', 'u30']],
  0x4f: ['call_prop_void', ['u30', 'u30']],
  0x50: ['sxi1', []],
  0x51: ['sxi8', []],
  0x52: ['sxi16', []],
  0x53: ['apply_type', ['u30']],
  0x55: ['new_object', ['u30']],
  0x56: ['new_array', ['u30']],
  0x57: ['new_activation', []],
  0x58: ['new_class', ['u30']],
  0x59: ['get_descendants', ['u30']],
  0x5a: ['new_catch', ['u30']],
  0x5d: ['find_prop_strict', ['u30']],
  0x5e: ['find_property', ['u30']],
  0x5f: ['find_def', ['u30']],
  0x60: ['get_lex', ['u30']],
  0x61: ['set_property', ['u30']],
  0x62: ['get_local', ['u30']],
  0x63: ['set_local', ['u30']],
  0x64: ['get_global_scope', []],
  0x65: ['get_scope_object', ['u8']],
  0x66: ['get_property', ['u30']],
  0x67: ['get_outer_scope', ['u30']],
  0x68: ['init_property', ['u30']],
  0x6a: ['delete_property', ['u30']],
  0x6c: ['get_slot', ['u30']],
  0x6d: ['set_slot', ['u30']],
  0x6e: ['get_global_slot', ['u30']],
  0x6f: ['set_global_slot', ['u30']],
  0x70: ['convert_s', []],
  0x71: ['esc_x_elem', []],
  0x72: ['esc_x_attr', []],
  0x73: ['convert_i', []],
  0x74: ['convert_u', []],
  0x75: ['convert_d', []],
  0x76: ['convert_b', []],
  0x77: ['convert_o', []],
  0x78: ['check_filter', []],
  0x80: ['coerce', ['u30']],
  0x81: ['coerce_b', []],
  0x82: ['coerce_a', []],
  0x83: ['coerce_i', []],
  0x84: ['coerce_d', []],
  0x85: ['coerce_s', []],
  0x86: ['as_type', ['u30']],
  0x87: ['as_type_late', []],
  0x88: ['coerce_u', []],
  0x89: ['coerce_o', []],
  0x90: ['negate', []],
  0x91: ['increment', []],
  0x92: ['inc_local', ['u30']],
  0x93: ['decrement', []],
  0x94: ['dec_local', ['u30']],
  0x95: ['type_of', []],
  0x96: ['not', []],
  0x97: ['bit_not', []],
  0xa0: ['add', []],
  0xa1: ['subtract', []],
  0xa2: ['multiply', []],
  0xa3: ['divide', []],
  0xa4: ['modulo', []],
  0xa5: ['l_shift', []],
  0xa6: ['r_shift', []],
  0xa7: ['u_r_shift', []],
  0xa8: ['bit_and', []],
  0xa9: ['bit_or', []],
  0xaa: ['bit_xor', []],
  0xab: ['equals', []],
  0xac: ['strict_equals', []],
  0xad: ['less_than', []],
  0xae: ['less_equals', []],
  0xaf: ['greater_than', []],
  0xb0: ['greater_equals', []],
  0xb1: ['instance_of', []],
  0xb2: ['is_type', ['u30']],
  0xb3: ['is_type_late', []],
  0xb4: ['in', []],
  0xc0: ['increment_i', []],
  0xc1: ['decrement_i', []],
  0xc2: ['inc_local_i', ['u30']],
  0xc3: ['dec_local_i', ['u30']],
  0xc4: ['negate_i', []],
  0xc5: ['add_i', []],
  0xc6: ['subtract_i', []],
  0xc7: ['multiply_i', []],
  0xd0: ['get_local0', []],
  0xd1: ['get_local1', []],
  0xd2: ['get_local2', []],
  0xd3: ['get_local3', []],
  0xd4: ['set_local0', []],
  0xd5: ['set_local1', []],
  0xd6: ['set_local2', []],
  0xd7: ['set_local3', []],
  0xef: ['debug', ['u8', 'u30', 'u8', 'u30']],
  0xf0: ['debug_line', ['u30']],
  0xf1: ['debug_file', ['u30']],
  0xf2: ['bkpt_line', ['u30']],
  0xf3: ['timestamp', []],
};



export interface AbcInstruction {
  offset: number; op: number; name: string; size: number;
  operands: number[]; target?: number; targets?: number[];
}

export interface Disassembly {
  instructions: AbcInstruction[];
  /** byte 0..codeLength is fully covered by decoded instructions */
  complete: boolean;
  errors: string[];
}

export function disassemble(code: Uint8Array): Disassembly {
  const instructions: AbcInstruction[] = [];
  const errors: string[] = [];
  let p = 0;
  while (p < code.length) {
    const op = code[p];
    const entry = OPCODES[op];
    const start = p;
    p += 1;
    if (!entry) {
      errors.push(`unknown opcode 0x${op.toString(16)} at ${start}`);
      break;
    }
    const [name, kinds] = entry;
    const operands: number[] = [];
    let target: number | undefined;
    let targets: number[] | undefined;
    try {
      for (const kind of kinds) {
        if (kind === 'u30') operands.push(readU30(code, () => p, (v) => { p = v; }));
        else if (kind === 'u8') operands.push(code[p++]);
        else if (kind === 's24') {
          const v = code[p] | (code[p + 1] << 8) | (code[p + 2] << 16);
          p += 3;
          const signed = (v << 8) >> 8;
          operands.push(signed);
          target = p + signed;
        } else {
          // lookupswitch: s24 default offset, u30 caseCount, then caseCount+1 s24
          // case offsets. Unlike the branches, these are relative to the start of
          // the instruction, not to the one after it.
          const dv = code[p] | (code[p + 1] << 8) | (code[p + 2] << 16);
          p += 3;
          const dflt = (dv << 8) >> 8;
          let count = 0;
          let shift = 0;
          for (;;) {
            const b = code[p++];
            count |= (b & 0x7f) << shift;
            shift += 7;
            if ((b & 0x80) === 0) break;
          }
          const cases: number[] = [];
          for (let i = 0; i <= count; i++) {
            const v = code[p] | (code[p + 1] << 8) | (code[p + 2] << 16);
            p += 3;
            cases.push(start + ((v << 8) >> 8));
          }
          operands.push(dflt, count);
          target = start + dflt;
          targets = cases;
        }
      }
    } catch (e) {
      errors.push(`${name} at ${start}: ${(e as Error).message}`);
      break;
    }
    instructions.push({ offset: start, op, name, size: p - start, operands, target, targets });
  }
  return { instructions, complete: p === code.length && errors.length === 0, errors };
}

function readU30(code: Uint8Array, get: () => number, set: (v: number) => void): number {
  let p = get();
  let result = 0;
  let shift = 0;
  for (;;) {
    if (p >= code.length) throw new Error('truncated u30');
    const b = code[p++];
    result |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) break;
  }
  set(p);
  return result >>> 0;
}

// ------------------------------------------------------------ what's inside

export interface AbcSurface {
  classes: number;
  interfaces: number;
  scripts: number;
  methods: number;
  bodies: number;
  metadata: string[];
  opcodes: [string, number][];
  /** method bodies whose bytecode does not decode to its exact length */
  walkErrors: string[];
  /**
   * Jump targets from verified (reachable) instruction streams that do not land
   * on an instruction start — the signature of a mis-sized operand.
   */
  badTargets: number;
  /** instructions no path reaches: dead code AVM2 never verifies */
  deadInstructions: number;
}

const BRANCH_TERMINATORS = new Set(['throw', 'return_void', 'return_value']);
const UNCONDITIONAL_JUMPS = new Set(['jump', 'lookup_switch']);

/**
 * Summarise an ABC module: sizes, the instruction mix and how faithfully the
 * disassembly covers every method body. The walk is the honest measure of
 * whether our opcode table matches the file — a wrong operand size desynchronises
 * the stream and shows up here rather than as a mystery later.
 *
 * Targets are only trusted from *reachable* instructions: AVM2 verifies a method
 * by walking it from the entry point (plus its exception handlers), so a bogus
 * jump inside dead code is not an error and must not fail this gate. Our own
 * corpus does contain such jumps (towns2), which is why the split exists.
 */
export function abcSurface(abc: AbcFile): AbcSurface {
  const counts = new Map<string, number>();
  const walkErrors: string[] = [];
  let badTargets = 0;
  let deadInstructions = 0;
  for (const body of abc.bodies) {
    const dis = disassemble(body.code);
    for (const ins of dis.instructions) counts.set(ins.name, (counts.get(ins.name) ?? 0) + 1);
    if (!dis.complete) {
      const method = abc.methods[body.method];
      walkErrors.push(`method ${body.method}${method ? ` '${method.name}'` : ''}: ${dis.errors.join('; ') || 'incomplete walk'}`);
      continue;
    }
    const byOffset = new Map(dis.instructions.map((i) => [i.offset, i]));
    const len = body.code.length;

    // Reachability: method entry, every exception range and every handler.
    const roots = [0];
    for (const ex of body.exceptions) {
      roots.push(ex.from, ex.target);
      for (const ins of dis.instructions) if (ins.offset >= ex.from && ins.offset < ex.to) roots.push(ins.offset);
    }
    const reachable = new Set<number>();
    const work = roots.filter((r) => byOffset.has(r));
    while (work.length) {
      const at = work.pop() as number;
      if (reachable.has(at)) continue;
      const ins = byOffset.get(at);
      if (!ins) continue;
      reachable.add(at);
      for (const t of [ins.target, ...(ins.targets ?? [])]) {
        if (t == null) continue;
        if (t === len || byOffset.has(t)) work.push(t);
      }
      if (!BRANCH_TERMINATORS.has(ins.name) && !UNCONDITIONAL_JUMPS.has(ins.name)) work.push(ins.offset + ins.size);
    }

    deadInstructions += dis.instructions.length - reachable.size;
    for (const ins of dis.instructions) {
      if (!reachable.has(ins.offset)) continue;
      for (const t of [ins.target, ...(ins.targets ?? [])]) {
        if (t == null) continue;
        if (t !== len && !byOffset.has(t)) badTargets++;
      }
    }
  }
  return {
    classes: abc.classes.length,
    interfaces: abc.classes.filter((c) => c.instance.isInterface).length,
    scripts: abc.scripts.length,
    methods: abc.methods.length,
    bodies: abc.bodies.length,
    metadata: abc.metadata,
    opcodes: [...counts].sort((a, b) => b[1] - a[1]),
    walkErrors,
    badTargets,
    deadInstructions,
  };
}

export function abcClassNames(abc: AbcFile): string[] {
  return abc.classes.map((c) => c.instance.name).filter(Boolean);
}
