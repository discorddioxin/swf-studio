// ABC (AVM2) container reader + disassembler.
//
// Our AVM1 side has always lifted code out of the SWF itself (DoAction /
// DoInitAction → `avm1Actions(...)`). AVM2 keeps its code in a separate blob —
// the DoABC tag — so the reader below is the AVM2 counterpart: it walks the ABC
// file exactly as the AVM2 specification lays it out (version, constant pool,
// methods, metadata, instances *then* classes, scripts, method bodies) and
// disassembles every method body against the spec's instruction set.
//
// The structures are checked, not assumed: `abcSurface()` re-walks every method
// body and requires the decode to consume the bytecode exactly, with every jump
// target from reachable code landing on an instruction start. A wrong operand
// size desynchronises the stream and fails that gate instead of turning into a
// mystery downstream.
import { describe, expect, it } from 'vitest';
import { abcClassNames, abcSurface, disassemble, parseAbc } from './abc';

/**
 * A real DoABC payload from the uploaded corpus: `games-swfs/tiles-swfs/
 * standardDeck.swf`, tag body, offset 5 (past the 4-byte flags and the empty
 * name). 346 bytes, AVM2 46.16 — the timeline script of a deck of tiles:
 * one class `deck`, one script trait, four method bodies, and the strings
 * `frame1` / `stop` / `addFrameScript` the timeline is wired with.
 */
const STANDARD_DECK_ABC =
  'EAAuAAAAAA8ABGRlY2sNZmxhc2guZGlzcGxheQlNb3ZpZUNsaXAGZnJhbWUxBHN0b3AOYWRkRnJhbWVTY3JpcHQGT2JqZWN0DGZsYXNoLmV2ZW50cw9FdmVudERpc3BhdGNoZXINRGlzcGxheU9iamVjdBFJbnRlcmFjdGl2ZU9iamVjdBZEaXNwbGF5T2JqZWN0Q29udGFpbmVyBlNwcml0ZQYWARYDGAIXARYJAAwHAQIHAgQHBAUHAQYHAQcHAQgHBQoHAgsHAgwHAg0HAg4EAAAAAAAAAAAAAAAAAAAAAAABAQIIAwACAQMBAAEAAAEDAQEEAQAEAAEBCQoD0DBHAAABAQEKCwjQMF0ETwQARwAAAgMBCgsP0DDQSQBdBSQAYANPBQJHAAADAgEBCSfQMGUAYAYwYAcwYAgwYAkwYAowYAswYAIwYAJYAB0dHR0dHR1oAUcAAA==';

const deck = () => parseAbc(new Uint8Array(Buffer.from(STANDARD_DECK_ABC, 'base64')));

describe('parseAbc', () => {
  it('reads the header and the constant pool of a real payload', () => {
    const abc = deck();
    expect(abc.version).toBe('46.16');
    expect(abc.strings).toContain('addFrameScript');
    expect(abc.strings).toContain('frame1');
    expect(abc.strings).toContain('stop');
    expect(abc.strings.length).toBe(15);
    // Namespaces carry their kind, so the package of a class is visible.
    expect(abc.namespaces).toContainEqual({ kind: 'package', name: 'flash.display' });
    // 12 multinames for `deck`, its superclass and the Flash types it uses.
    expect(abc.multinames.length).toBe(12);
  });

  it('pairs instances with their classes and resolves their names', () => {
    const abc = deck();
    expect(abc.classes.length).toBe(1);
    expect(abc.scripts.length).toBe(1);
    // `deck extends flash.display.MovieClip` — the names come out of the
    // multiname pool, which only lines up when every instance_info is read
    // before the class_infos and both are then paired up.
    expect(abc.classes[0].instance.name).toBe('deck');
    expect(abc.classes[0].instance.superName).toBe('flash.display.MovieClip');
    expect(abc.classes[0].instance.protectedNs).toBe('deck');
    expect(abc.classes[0].instance.isInterface).toBe(false);
    expect(abc.classes[0].instance.sealed).toBe(false);
    expect(abcClassNames(abc)).toEqual(['deck']);
    // The script's trait is the class binding itself, and each class has one
    // method: the script init, the cinit, the instance init and nothing else.
    expect(abc.scripts[0].traits.map((t) => t.name)).toEqual(['deck']);
    expect(abc.scripts[0].traits[0].kind).toBe('class');
    expect(abc.scripts[0].traits[0].classIndex).toBe(0);
    expect(abc.scripts[0].init).toBe(3);
    expect(abc.classes[0].cinit).toBe(0);
    expect(abc.classes[0].instance.iinit).toBe(2);
  });

  it('maps every method body and disassembles it to its exact length', () => {
    const abc = deck();
    expect(abc.bodies.length).toBe(4);
    expect(abc.bodies.map((b) => b.code.length)).toEqual([3, 8, 15, 39]);
    expect(abc.bodies.map((b) => b.method)).toEqual([0, 1, 2, 3]);
    expect(abc.bodies.every((b) => b.exceptions.length === 0)).toBe(true);

    // Body 3 builds the class: seven getlex on the superclass and its
    // interfaces, then newclass, then initproperty bind it to the trait.
    const classBody = disassemble(abc.bodies[3].code);
    expect(classBody.complete).toBe(true);
    expect(classBody.instructions.map((i) => i.name)).toEqual([
      'get_local0', 'push_scope', 'get_scope_object', 'get_lex', 'push_scope', 'get_lex',
      'push_scope', 'get_lex', 'push_scope', 'get_lex', 'push_scope', 'get_lex', 'push_scope',
      'get_lex', 'push_scope', 'get_lex', 'push_scope', 'get_lex', 'new_class', 'pop_scope',
      'pop_scope', 'pop_scope', 'pop_scope', 'pop_scope', 'pop_scope', 'pop_scope',
      'init_property', 'return_void',
    ]);

    // Body 2 is the constructor: super() then one call (the `stop()` the
    // timeline script asks for is body 1).
    expect(disassemble(abc.bodies[2].code).instructions.map((i) => i.name)).toEqual([
      'get_local0', 'push_scope', 'get_local0', 'construct_super', 'find_prop_strict',
      'push_byte', 'get_lex', 'call_prop_void', 'return_void',
    ]);
    expect(disassemble(abc.bodies[1].code).instructions.map((i) => i.name)).toEqual([
      'get_local0', 'push_scope', 'find_prop_strict', 'call_prop_void', 'return_void',
    ]);
  });

  it('walks the whole module with no unverified jumps (abcSurface gate)', () => {
    const surface = abcSurface(deck());
    expect(surface.walkErrors).toEqual([]);
    expect(surface.badTargets).toBe(0);
    expect(surface.classes).toBe(1);
    expect(surface.scripts).toBe(1);
    expect(surface.methods).toBe(4);
    expect(surface.bodies).toBe(4);
    expect(surface.metadata).toEqual([]);
    expect(surface.deadInstructions).toBe(0);
    // The instruction mix is dominated by scope and property traffic.
    const mix = Object.fromEntries(surface.opcodes);
    expect(mix.get_local0).toBe(5);
    expect(mix.return_void).toBe(4);
    expect(mix.new_class).toBe(1);
  });
});

describe('disassemble branch offsets', () => {
  // AVM2 resolves the two kinds of offsets differently: branches are relative
  // to the instruction that follows, lookupswitch cases and default relative to
  // the start of the lookupswitch itself.
  it('resolves if/jump offsets from the end of the instruction', () => {
    //  0: push_byte 0    24 00
    //  2: if_false +5    12 05 00 00   -> 6 + 5 = 11
    //  6: jump +1        10 01 00 00   -> 10 + 1 = 11
    // 10: return_value   48
    // 11: return_value   48
    const code = new Uint8Array([0x24, 0x00, 0x12, 0x05, 0x00, 0x00, 0x10, 0x01, 0x00, 0x00, 0x48, 0x48]);
    const dis = disassemble(code);
    expect(dis.complete).toBe(true);
    expect(dis.instructions.map((i) => [i.offset, i.name, i.size, i.target])).toEqual([
      [0, 'push_byte', 2, undefined],
      [2, 'if_false', 4, 11],
      [6, 'jump', 4, 11],
      [10, 'return_value', 1, undefined],
      [11, 'return_value', 1, undefined],
    ]);
  });

  it('resolves lookupswitch case offsets from the start of the instruction', () => {
    // 0: nop
    // 1: push_byte 0                 (the index the switch dispatches on)
    // 3: nop
    // 4: lookup_switch default -2, cases -3, -2  -> 2, 1, 2
    // 15: return_value
    const code = new Uint8Array([
      0x02, 0x24, 0x00, 0x02,
      0x1b, 0xfe, 0xff, 0xff, 0x01, 0xfd, 0xff, 0xff, 0xfe, 0xff, 0xff,
      0x48,
    ]);
    const dis = disassemble(code);
    expect(dis.complete).toBe(true);
    const sw = dis.instructions.find((i) => i.name === 'lookup_switch')!;
    expect(sw.offset).toBe(4);
    expect(sw.size).toBe(11);
    expect(sw.operands).toEqual([-2, 1]);
    expect(sw.target).toBe(2);
    expect(sw.targets).toEqual([1, 2]);
  });
});

describe('abcSurface honesty gate', () => {
  it('reports a body whose bytecode does not decode to its exact length', () => {
    const abc = deck();
    // A body whose last operand is missing: `get_lex` wants a u30 that is not
    // there, so the walk cannot consume the body — the gate must say so.
    const broken = { ...abc, bodies: abc.bodies.map((b, i) => (i === 3 ? { ...b, code: new Uint8Array([0x60]) } : b)) };
    const surface = abcSurface(broken);
    expect(surface.walkErrors.length).toBe(1);
    expect(surface.walkErrors[0]).toContain('method 3');
  });
});
