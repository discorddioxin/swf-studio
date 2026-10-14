// Drawing is a system too, and the only one that knows about the screen. It walks
// the actors in depth order and hands each one to a renderer; how a material's
// art becomes pixels is the renderer's business, not an actor's.

import type { Actor } from '../core/Actor';
import type { CameraSystem } from './CameraSystem';

export interface Renderer {
  /** Start a frame; `camera` is where the world is being looked at from. */
  begin(camera: CameraSystem): void;
  /** Draw one actor with the art of its material's current frame. */
  draw(actor: Actor, art: unknown, screen: { x: number; y: number }): void;
  end(): void;
}

export class RenderSystem {
  renderer?: Renderer;
  /** Draw order: depth first, then id, so two actors at the same depth are stable. */
  actors: Actor[] = [];

  constructor(readonly camera: CameraSystem, renderer?: Renderer) { this.renderer = renderer; }

  /** The actor list is rebuilt from the world's set each step (cheap, and sorts once). */
  collect(world: Iterable<Actor>): void {
    this.actors = [...world].filter((actor) => actor.visible);
    this.actors.sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  step(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.begin(this.camera);
    for (const actor of this.actors) {
      const material = actor.material;
      if (!material) continue;
      renderer.draw(actor, material.frame?.art, this.camera.toScreen(actor));
    }
    renderer.end();
  }
}

/** Renders through a canvas 2d context: sprites, rects and text. */
export class CanvasRenderer implements Renderer {
  constructor(readonly context: CanvasRenderingContext2D, readonly art: Map<string, CanvasImageSource> = new Map()) {}

  begin(camera: CameraSystem): void {
    const { context } = this;
    context.save();
    context.clearRect(0, 0, camera.width, camera.height);
  }

  draw(actor: Actor, art: unknown, screen: { x: number; y: number }): void {
    const { context } = this;
    const width = actor.body.width;
    const height = actor.body.height;
    const x = screen.x - width / 2;
    const y = screen.y - height / 2;
    const image = typeof art === 'string' ? this.art.get(art) : (art as CanvasImageSource | undefined);
    context.save();
    context.globalAlpha = actor.visible ? 1 : 0;
    if (actor.facing === -1) {
      context.translate(screen.x, 0);
      context.scale(-1, 1);
      context.translate(-screen.x, 0);
    }
    if (image) context.drawImage(image, x, y, width, height);
    else { context.fillStyle = actor.kind.startsWith('ui.') ? '#8ab4f8' : '#f6c85f'; context.fillRect(x, y, width, height); }
    context.restore();
  }

  end(): void { this.context.restore(); }
}
