/**
 * The game framework a transcribed Flash game targets.
 *
 * A MovieClip-based game keeps its world in the timeline: each clip animates
 * itself, moves itself, reads the keyboard itself and reaches into the other
 * clips on its parent's stage. The same game expressed as actors and systems has
 * exactly one owner per concern:
 *
 *   material   what an actor looks like (a timeline's frames, without the timeline)
 *   actor      what exists in the world: a body, a look and behaviours
 *   script     the actor's behaviours, named, and what asks for them
 *   systems    motion, input, collision, spawning, animation, camera, audio, drawing
 *   signals    how anything tells anyone else that something happened
 *
 * Nothing here imports the Flash engine: a game built on this runs the same with
 * a canvas renderer, a WebGL renderer or no renderer at all.
 */
export { Actor, type ActorOptions, type Behaviour, type GameAction } from './core/Actor';
export { Material, MaterialLibrary, type MaterialFrame, type MaterialOptions, type LoopMode } from './core/Material';
export { Signal, Signals, type SignalListener } from './core/Signal';
export { Script, type Action } from './core/Script';
export { World, type WorldOptions } from './World';
export { PhysicsSystem, type Body, type WorldBounds } from './systems/PhysicsSystem';
export { InputSystem, type ActionState } from './systems/InputSystem';
export { AnimationSystem } from './systems/AnimationSystem';
export { CollisionSystem, overlap, type Hit } from './systems/CollisionSystem';
export { SpawnSystem, type ActorFactory } from './systems/SpawnSystem';
export { CameraSystem } from './systems/CameraSystem';
export { AudioSystem, SilentMixer, type Mixer } from './systems/AudioSystem';
export { RenderSystem, CanvasRenderer, type Renderer } from './systems/RenderSystem';
