// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { GameSocket } from '../engine/as2/player';
import {
  FishPlugin,
  MockServer,
  SUSHI_END,
  SUSHI_FIELD,
  SushiDecoder,
  SushiServer,
  createMockServer,
  createSushiServer,
  decodeMessage,
  encodeMessage,
  parseHandshake,
  type SushiPluginInterface,
} from './gameServerStub';
import { phpSerialize, phpUnserialize } from './gsiStub';

function createTestSocket(host = '127.0.0.1', port = 8080): {
  socket: GameSocket;
  delivered: string[];
  closed: boolean[];
} {
  const delivered: string[] = [];
  const closed: boolean[] = [];
  const socket: GameSocket = {
    host,
    port,
    deliver(data: string) {
      delivered.push(data);
    },
    close(error = false) {
      closed.push(error);
    },
  };
  return { socket, delivered, closed };
}

describe('SushiServer & MockServer', () => {
  it('decodes fragmented Sushi wire frames and handshakes', () => {
    const decoder = new SushiDecoder();
    const chunk1 = `S55${SUSHI_FIELD}FLASH${SUSHI_FIELD}1${SUSHI_FIELD}0${SUSHI_FIELD}2${SUSHI_FIELD}15${SUSHI_END}2${SUSHI_FIELD}`;
    const chunk2 = `15${SUSHI_END}29${SUSHI_FIELD}1${SUSHI_FIELD}fishing${SUSHI_END}`;

    const first = decoder.push(chunk1);
    expect(first).toHaveLength(1);
    expect(Number.isNaN(first[0].tag)).toBe(true);
    expect(parseHandshake(first[0].raw)).toEqual({
      banner: 'S55',
      product: 'FLASH',
      version: '1',
      limit: '0',
      subVersion: '2',
      clientSpeed: '15',
    });

    const second = decoder.push(chunk2);
    expect(second).toHaveLength(2);
    expect(second[0]).toEqual({ tag: 2, fields: ['15'], raw: `2${SUSHI_FIELD}15` });
    expect(second[1]).toEqual({ tag: 29, fields: ['1', 'fishing'], raw: `29${SUSHI_FIELD}1${SUSHI_FIELD}fishing` });
  });

  it('handles Sushi handshake, session list, joining session, and room navigation', () => {
    const server = createSushiServer();
    const { socket, delivered } = createTestSocket();

    server.connect('127.0.0.1', 8080, socket);
    server.send(socket, `S55${SUSHI_FIELD}FLASH${SUSHI_FIELD}1${SUSHI_FIELD}0${SUSHI_FIELD}2${SUSHI_FIELD}15${SUSHI_END}`);
    expect(delivered).toHaveLength(0);

    // Client hello (tag 2) -> assigns member ID 1 + server ready (2)
    server.send(socket, encodeMessage(2, 15));
    expect(delivered.at(-1)).toBe(encodeMessage(1, 1) + encodeMessage(2));

    // loadSessionList (tag 29) -> opcode 44
    server.send(socket, encodeMessage(29, 1, 'fishing'));
    const sessionReply = decodeMessage(delivered.at(-1)!.slice(0, -1));
    expect(sessionReply?.tag).toBe(44);
    expect(sessionReply?.fields[0]).toBe('1');
    expect(sessionReply?.fields[2]).toBe('fishing');

    // joinSession (tag 45) -> rooms (35) + members (33) + callback (32) + member updates (6)
    server.send(socket, encodeMessage(45, 2, 1, 0, 1, '', 'GaiaPlayer', ''));
    const joinFrames = new SushiDecoder().push(delivered.at(-1)!);
    expect(joinFrames.map((f) => f.tag)).toEqual([35, 33, 32, 6, 6, 6, 6, 6, 6]);
    expect(server.getMember(1)?.name).toBe('GaiaPlayer');
    expect(server.getMember(1)?.roomId).toBe(1);

    // changeRoom (tag 20) into room 2 ("dracogenius's Room|10001")
    server.send(socket, encodeMessage(20, 3, 1, 2, '', '', 2, 1, 180, 150, 1, 'baita', 0, 0));
    const changeFrames = new SushiDecoder().push(delivered.at(-1)!);
    expect(changeFrames.map((f) => f.tag)).toEqual([32, 8]);
    expect(changeFrames[0].fields).toEqual(['3', '0']);
    expect(server.getMember(1)?.roomId).toBe(2);
    expect(server.getRoom(2)?.memberIds).toContain(1);
  });

  it('supports creating rooms, locking rooms, password validation, and chat', () => {
    const server = new SushiServer();
    const { socket, delivered } = createTestSocket();
    server.connect('127.0.0.1', 8080, socket);
    server.send(socket, encodeMessage(45, 1, 1, 0, 1, '', 'GaiaPlayer', ''));

    // Create a password-protected room (tag 22)
    server.send(socket, encodeMessage(22, 10, 1, 'secret123', "GaiaPlayer's Room|10002", 'default'));
    const createFrames = new SushiDecoder().push(delivered.at(-1)!);
    expect(createFrames.map((f) => f.tag)).toEqual([30, 32]);
    const newRoomId = Number(createFrames[0].fields[0]);
    expect(newRoomId).toBe(4);
    expect(server.getRoom(newRoomId)?.hasPassword).toBe(true);

    // Joining with wrong password returns status 14 ("wrong password")
    server.send(socket, encodeMessage(20, 11, 1, newRoomId, 'wrongpw'));
    const wrongPw = new SushiDecoder().push(delivered.at(-1)!);
    expect(wrongPw[0].fields).toEqual(['11', '14']);

    // Joining with correct password succeeds (status 0 + masterClient 8)
    server.send(socket, encodeMessage(20, 12, 1, newRoomId, 'secret123'));
    const rightPw = new SushiDecoder().push(delivered.at(-1)!);
    expect(rightPw.map((f) => f.tag)).toEqual([32, 8]);
    expect(rightPw[0].fields).toEqual(['12', '0']);

    // Locking room (tag 39) prevents subsequent joins (status 6)
    server.send(socket, encodeMessage(39, newRoomId, 1));
    expect(server.getRoom(newRoomId)?.locked).toBe(true);
    server.send(socket, encodeMessage(20, 13, 2, newRoomId, 'secret123'));
    const lockedReply = new SushiDecoder().push(delivered.at(-1)!);
    expect(lockedReply[0].fields).toEqual(['13', '6']);

    // Chat message (tag 10) broadcasts back to room
    server.send(socket, encodeMessage(10, 1, 1, 0, 'hello lake!'));
    const chatReply = new SushiDecoder().push(delivered.at(-1)!);
    expect(chatReply[0].tag).toBe(10);
    expect(chatReply[0].fields).toEqual(['1', '1', '0', 'hello lake!']);
  });

  it('handles G_FISH_PLUGIN calls and custom plugins', () => {
    const plugin = new FishPlugin({ baitA: 10, baitD: 5, baitF: 1 });
    expect(plugin.pluginId).toBe('G_FISH_PLUGIN');
    const server = new SushiServer({ fishState: { baitA: 10, baitD: 5, baitF: 1 } });
    const { socket, delivered } = createTestSocket();
    server.connect('127.0.0.1', 8080, socket);

    // 501 loadGetData
    server.send(socket, encodeMessage(19, 1, 'G_FISH_PLUGIN', '501'));
    const getData = new SushiDecoder().push(delivered.at(-1)!)[0];
    expect(getData.tag).toBe(19);
    expect(getData.fields[1]).toBe('G_FISH_PLUGIN');
    expect(getData.fields[2]).toContain('100003:10|100002:5|100001:1');

    // 500 loadFishData decrements baitA and returns MD5 tokens
    server.send(socket, encodeMessage(19, 2, 'G_FISH_PLUGIN', '500', '100003', '2', 'gaiafishing_guest'));
    const fishData = new SushiDecoder().push(delivered.at(-1)!)[0];
    expect(fishData.fields[2]).toContain('c90b2f8da134c0889936adec6466d290');
    expect(server.fishState.baitA).toBe(9);

    // Custom plugin registration
    const customPlugin: SushiPluginInterface = {
      pluginId: 'CUSTOM_PLUGIN',
      handleCall: (_callId, subOp, params) => `${subOp}:${params.join(',')}`,
    };
    server.registerPlugin(customPlugin);
    server.send(socket, encodeMessage(19, 3, 'CUSTOM_PLUGIN', 'ping', 'a', 'b'));
    const customReply = new SushiDecoder().push(delivered.at(-1)!)[0];
    expect(customReply.fields).toEqual(['3', 'CUSTOM_PLUGIN', 'ping:a,b']);
  });

  it('MockServer unifies GSI HTTP gateway responses and SushiServer socket rooms', async () => {
    const mockServer = createMockServer();
    expect(mockServer).toBeInstanceOf(MockServer);
    expect(mockServer.servers.length).toBeGreaterThanOrEqual(2);
    expect(mockServer.getRooms().map((r) => r.id)).toEqual([1, 2, 3]);
    expect(mockServer.getMembers().length).toBeGreaterThanOrEqual(6);

    // GSI gateway call for methods 50, 109, 107
    const body = `m=${encodeURIComponent(phpSerialize([[50, ['fishing']], [109, []], [107, ['gaiafishing_guest']]]))}&v=phpobject`;
    const encoded = await mockServer.fetchText('http://www.gaiaonline.com/chat/gsi/gateway.php', 'POST', body);
    expect(encoded).toBeTruthy();
    const decoded = phpUnserialize(decodeURIComponent(encoded!)) as any[];
    expect(decoded).toHaveLength(3);
    expect(decoded[0][1]).toBe(true);
    expect(decoded[0][2][0].ip).toBe('127.0.0.1');
    expect(decoded[1][2]).toEqual(['gaiafishing_guest']);
    expect(decoded[2][2].username).toBe('GaiaPlayer');

    // Non-Gaia URLs are blocked offline
    const external = await mockServer.fetchText('https://example.com/api', 'GET', null);
    expect(external).toBeNull();
  });
});
