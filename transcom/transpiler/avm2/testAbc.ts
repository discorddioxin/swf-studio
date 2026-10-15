// Builders for hand-assembled ABC fixtures (tests only).
import type { AbcMethodBody, AbcMethodInfo, AbcTrait } from '../../decompiler/swf/abc';

export const method = (paramTypes: string[] = [], optional: AbcMethodInfo['optional'] = []): AbcMethodInfo => ({
  name: '', returnType: '', paramTypes, paramNames: [], optional, needArguments: false, needActivation: false, needRest: false,
});
export const body = (index: number, bytes: number[]): AbcMethodBody => ({
  method: index, maxStack: 4, localCount: 4, initScopeDepth: 0, maxScopeDepth: 1, code: new Uint8Array(bytes), exceptions: [], traits: [],
});
export const attr = { final: false, override: false, metadata: false };
export const slot = (name: string, type: string, value?: { kind: number; value: number | string | boolean | null }): AbcTrait => ({
  name, kind: 'slot', attr, type, metadata: [], ...(value ? { valueKind: value.kind, value: value.value } : {}),
});
export const fn = (name: string, index: number): AbcTrait => ({ name, kind: 'method', attr, method: index, metadata: [] });

// getlocal0 pushscope … returnvoid, the frame every body here starts and ends with.
export const OPEN = [0xd0, 0x30];
export const RETURN_VOID = 0x47;
