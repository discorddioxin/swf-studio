// `for (k in o)` / `for each (v in o)`: what AVM2 enumerates.
//
// AS3 enumerates an object's *dynamic* properties only — never its declared
// traits. An instance of a sealed class (every class not declared `dynamic`,
// including subclasses of dynamic ones) has none, so a for-in over it runs zero
// times. JavaScript cannot tell the two apart: a declared field and a property
// added at run time are both own properties, and so is every field the engine's
// own classes keep. So the facts come from where they are known:
//
//   - a transpiled class declared `dynamic` registers itself with the slot names
//     it (and its ancestors) declare — `__dynamic(K, [...])`, emitted after the
//     class; every other program class is sealed
//   - the engine's classes are registered by packages.ts; which of them Flash
//     declares dynamic is listed here, and the fields the engine keeps on an
//     instance are read once from an instance made outside the movie
//   - anything else (Object, Array, an object literal) is dynamic, with no
//     declared fields
import { constructDetached } from './display';
import { dictionaryKeys, dictionaryValue } from './utils';

/** Program classes declared `dynamic` → the slot names declared on them and their ancestors. */
const dynamicClasses = new WeakMap<Function, ReadonlySet<string>>();
/** Every flash.* / top-level class the engine provides. */
const engineClasses = new WeakSet<Function>();
/** The engine classes Flash declares `dynamic` (and Vector, whose indices enumerate). */
const dynamicEngine = new WeakSet<Function>();
/** What the engine itself keeps on an instance of a class: never enumerated. */
const engineFields = new WeakMap<Function, ReadonlySet<string>>();
/** JavaScript's own classes: dynamic, nothing of the engine's on them. */
const BUILTINS = new Set<unknown>([Object, Array, Function, Error, Date, RegExp, String, Number, Boolean, Map, Set, Promise]);

const DYNAMIC_ENGINE_NAMES = ['MovieClip', 'Dictionary', 'URLVariables', 'Vector'];

/** Called by packages.ts with the definitions it exports. */
export function registerEngineClasses(definitions: Iterable<[string, unknown]>): void {
  for (const [name, value] of definitions) {
    if (typeof value !== 'function' || !value.prototype || BUILTINS.has(value)) continue;
    engineClasses.add(value);
    const simple = name.slice(name.lastIndexOf('.') + 1);
    if (DYNAMIC_ENGINE_NAMES.includes(simple) || value.prototype instanceof Error) dynamicEngine.add(value);
  }
}

/** Emitted after a class declared `dynamic`: its declared instance slots, ancestors' included. */
export function __dynamic(owner: Function, slots: string[] = []): void {
  dynamicClasses.set(owner, new Set(slots));
}

function fieldsOf(engine: Function): ReadonlySet<string> {
  let fields = engineFields.get(engine);
  if (!fields) {
    try {
      fields = new Set(Object.keys(constructDetached(engine as new () => object)));
    } catch {
      fields = new Set();
    }
    engineFields.set(engine, fields);
  }
  return fields;
}

/** The constructor a prototype belongs to (its own `constructor`, not an inherited one). */
function ownerOf(proto: object): unknown {
  return Object.getOwnPropertyDescriptor(proto, 'constructor')?.value;
}

/** The keys a for-in over `o` visits, in order. */
export function enumerableKeys(o: unknown): unknown[] {
  if (o == null || typeof o !== 'object' && typeof o !== 'function') return []; // String, Number, Boolean: sealed
  // a class object: its statics are traits
  if (typeof o === 'function' && /^class\b/.test(Function.prototype.toString.call(o))) return [];
  const dictionary = dictionaryKeys(o);
  if (dictionary) return dictionary;
  let dynamic: boolean | undefined;
  let engine: Function | undefined;
  const declared: ReadonlySet<string>[] = [];
  for (let p = Object.getPrototypeOf(o); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
    const owner = ownerOf(p);
    if (typeof owner !== 'function' || BUILTINS.has(owner)) break;
    if (engineClasses.has(owner)) {
      engine = owner;
      dynamic ??= dynamicEngine.has(owner);
      break;
    }
    // a program class: the most derived one decides, as AS3's `dynamic` is not inherited
    const slots = dynamicClasses.get(owner);
    dynamic ??= !!slots;
    if (slots) declared.push(slots);
  }
  if (dynamic === false) return [];
  let keys: string[] = Object.keys(o as object);
  if (engine) {
    const own = fieldsOf(engine);
    keys = keys.filter((k) => !own.has(k));
  }
  for (const slots of declared) keys = keys.filter((k) => !slots.has(k));
  return keys;
}

// The cursor: the compiler starts the cursor register at 0 and `hasnext2` moves
// it on. Here it holds the key itself (so `nextname` is the register), and the
// number 0 is "before the first key" — enumerated keys are strings or, for a
// Dictionary, the key objects, never the number 0.
const walks = new WeakMap<object, { keys: unknown[]; at: number }>();

/**
 * `hasnext2` + `nextname`: the key after `cursor`, or null when the object is
 * exhausted. The keys are read when the loop starts; a key deleted on the way is
 * skipped, as in AVM2.
 */
export function __iterAdvance(object: unknown, cursor: unknown): unknown {
  if (object == null) return null;
  const holder = Object(object) as object;
  let walk = walks.get(holder);
  let next: number;
  if (cursor === 0) {
    walk = { keys: enumerableKeys(object), at: -1 };
    walks.set(holder, walk);
    next = 0;
  } else {
    // Where the loop is: normally the key this walk returned last. Another loop
    // over the same object (nested, or one that finished) may have replaced or
    // dropped the walk; then the cursor is found among the keys again.
    if (!walk) {
      walk = { keys: enumerableKeys(object), at: -1 };
      walks.set(holder, walk);
    }
    const at = walk.keys[walk.at] === cursor ? walk.at : walk.keys.indexOf(cursor);
    if (at < 0) {
      // the key is gone: the loop cannot resume (restarting could never end), so it ends
      walks.delete(holder);
      return null;
    }
    next = at + 1;
  }
  for (; next < walk.keys.length; next++) {
    const key = walk.keys[next];
    if (stillThere(object, key)) { walk.at = next; return key; }
  }
  walks.delete(holder);
  return null;
}

function stillThere(object: unknown, key: unknown): boolean {
  if (dictionaryKeys(object)) return true;
  return typeof key !== 'string' || Object.prototype.hasOwnProperty.call(object, key);
}

/** `nextvalue` — the value the cursor is standing on (`for each`). */
export function __iterValue(object: unknown, cursor: unknown): unknown {
  if (object == null || cursor == null) return undefined;
  const fromDictionary = dictionaryValue(object, cursor);
  if (fromDictionary.found) return fromDictionary.value;
  return (object as Record<string, unknown>)[String(cursor)];
}
