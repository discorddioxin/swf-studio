/** SWF readers/decompilers used by SWF Studio and its bundled-game pipeline. */
export { parseSwfXml, actionFileCandidates, classify, kindOfTag, isSpecialTag } from './parser';
export type { ParseOptions } from './parser';
export { parseSwfBinary, parseTags, decodeDoInitAction, TAG_NAMES } from './swf/binary';
export type { DecodedDoInitAction } from './swf/binary';
export type { ParsedBinarySwf, SwfFile } from './swf/binary';
export { BitReader, avm1ActionSource, hexToBytes, isLikelyActionStream, latin1, bytesToBase64 } from './swf/bitio';
export { parseAbc, disassemble, abcSurface, abcClassNames } from './swf/abc';
export type { AbcFile, AbcClassDef, AbcInstance, AbcMethodBody, AbcMethodInfo, AbcMultiname, AbcNamespace, AbcScript, AbcSurface, AbcTrait, AbcInstruction, Disassembly } from './swf/abc';
export { shapeToSvg } from './swf/shapeSvg';
export type { SvgBitmapInfo, SvgFillStyle, SvgLineStyle, SvgMatrix, SvgShapeRecord } from './swf/shapeSvg';
