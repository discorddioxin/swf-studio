// AVM2 (ActionScript 3 / ABC) front end of the transpiler.
//
// `transpileAbc` turns a parsed ABC block into TypeScript modules; the AS3 engine
// in `src/engine/flash` links them like any other project source.

export { transpileAbc, emitClassModule, classPath, simpleName } from './emit';
export type { EmitDiagnostic, EmitResult, EmittedFile, AbcModuleOptions, ClassModuleOptions, ClassModuleResult } from './emit';
export { liftMethod } from './lift';
export type { LiftDiagnostic, LiftResult, MethodContext } from './lift';
