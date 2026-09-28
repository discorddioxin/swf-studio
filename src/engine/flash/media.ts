// flash.media: Sound / SoundChannel / SoundTransform / SoundMixer.
//
// Linked Sound subclasses (SymbolClass → DefineSound) play the sound file the
// asset bundle has for that character. Playback goes through the player's
// audio backend (HTMLAudioElement in the browser; silent in tests).

import { runtime } from './context';
import { Event, EventDispatcher } from './events';

export interface AudioHandle { stop(): void; setVolume(v: number): void; readonly position: number; onended: (() => void) | null }
export interface AudioBackend { play(characterId: number | null, url: string | null, startMs: number, loops: number, volume: number): AudioHandle | null }
interface SoundHost { audio: AudioBackend | null; symbolForClass(ctor: Function): number | 'root' | undefined; soundLength(id: number): number; activeChannels: Set<SoundChannel> }
const soundHost = () => runtime.player as unknown as SoundHost | null;

export class SoundTransform {
  volume: number; pan: number;
  leftToLeft = 1; leftToRight = 0; rightToLeft = 0; rightToRight = 1;
  constructor(volume = 1, pan = 0) { this.volume = volume; this.pan = pan; }
}

export class SoundChannel extends EventDispatcher {
  /** @internal */ _handle: AudioHandle | null = null;
  private _transform = new SoundTransform();
  get position() { return this._handle?.position ?? 0; }
  get leftPeak() { return 0; }
  get rightPeak() { return 0; }
  get soundTransform() { return this._transform; }
  set soundTransform(t: SoundTransform) {
    this._transform = t;
    this._handle?.setVolume(t.volume * SoundMixer.soundTransform.volume);
  }
  stop() { this._handle?.stop(); this._handle = null; soundHost()?.activeChannels.delete(this); }
}

export class Sound extends EventDispatcher {
  /** @internal */ _characterId: number | null = null;
  /** @internal */ _url: string | null = null;
  constructor(stream: { url?: string } | null = null) {
    super();
    const symbol = soundHost()?.symbolForClass(new.target);
    if (typeof symbol === 'number') this._characterId = symbol;
    if (stream?.url) this._url = stream.url;
  }
  get length() { return this._characterId != null ? soundHost()?.soundLength(this._characterId) ?? 0 : 0; }
  get bytesLoaded() { return 1; }
  get bytesTotal() { return 1; }
  get isBuffering() { return false; }
  get url() { return this._url; }
  load(stream: { url?: string }) { this._url = stream?.url ?? null; }
  close() {}
  play(startTime = 0, loops = 0, sndTransform: SoundTransform | null = null): SoundChannel | null {
    const host = soundHost();
    const channel = new SoundChannel();
    if (sndTransform) channel.soundTransform = sndTransform;
    const volume = (sndTransform?.volume ?? 1) * SoundMixer.soundTransform.volume;
    const handle = host?.audio?.play(this._characterId, this._url, startTime, loops, volume) ?? null;
    channel._handle = handle;
    if (handle) {
      host!.activeChannels.add(channel);
      handle.onended = () => {
        host!.activeChannels.delete(channel);
        runtime.guard(() => channel.dispatchEvent(new Event(Event.SOUND_COMPLETE)), 'soundComplete');
      };
    }
    return channel;
  }
}

export class SoundMixer {
  static soundTransform = new SoundTransform();
  static bufferTime = 1000;
  static stopAll() { for (const c of [...(soundHost()?.activeChannels ?? [])]) c.stop(); }
  static computeSpectrum() {}
  static areSoundsInaccessible() { return false; }
}

export class Microphone { static getMicrophone() { return null; } }
export class Camera { static getCamera() { return null; } }
export class Video {}
