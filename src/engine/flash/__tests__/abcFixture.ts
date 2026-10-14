// A real AVM2 code fixture for the flash engine: the DoABC payload of
// `games-swfs/tiles-swfs/standardDeck.swf`, a deck of tiles whose timeline
// script is one class `deck` with `addFrameScript(0, this.frame1)` and `stop()`.
//
// It is kept as base64 so a test can hand the engine the same bytes the SWF
// reader hands it: a flags word, the tag's name, then the ABC file.
const STANDARD_DECK_ABC =
  'EAAuAAAAAA8ABGRlY2sNZmxhc2guZGlzcGxheQlNb3ZpZUNsaXAGZnJhbWUxBHN0b3AOYWRkRnJhbWVTY3JpcHQGT2JqZWN0DGZsYXNoLmV2ZW50cw9FdmVudERpc3BhdGNoZXINRGlzcGxheU9iamVjdBFJbnRlcmFjdGl2ZU9iamVjdBZEaXNwbGF5T2JqZWN0Q29udGFpbmVyBlNwcml0ZQYWARYDGAIXARYJAAwHAQIHAgQHBAUHAQYHAQcHAQgHBQoHAgsHAgwHAg0HAg4EAAAAAAAAAAAAAAAAAAAAAAABAQIIAwACAQMBAAEAAAEDAQEEAQAEAAEBCQoD0DBHAAABAQEKCwjQMF0ETwQARwAAAgMBCgsP0DDQSQBdBSQAYANPBQJHAAADAgEBCSfQMGUAYAYwYAcwYAgwYAkwYAowYAswYAIwYAJYAB0dHR0dHR1oAUcAAA==';

/**
 * The DoABC tag body for that movie: `flags(u32)`, then the tag name (here
 * empty) and the ABC file — the same shape `doc.abc` carries.
 */
export function deckAbcPayload(name = ''): Uint8Array {
  const abc = new Uint8Array(Buffer.from(STANDARD_DECK_ABC, 'base64'));
  const named = new TextEncoder().encode(name);
  const payload = new Uint8Array(4 + named.length + 1 + abc.length);
  payload.set(named, 4);
  payload[4 + named.length] = 0; // SWF string terminator
  payload.set(abc, 5 + named.length);
  return payload;
}
