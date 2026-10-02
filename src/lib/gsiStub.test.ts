// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GUEST_BAITS, GUEST_RODS, gsiInventoryResponse, gsiStubFetchText, isGsiUrl } from './gsiStub';

describe('gsiStub', () => {
  it('recognises Gaia GSI endpoints', () => {
    expect(isGsiUrl('http://www.gaiaonline.com/gsi/?m=1')).toBe(true);
    expect(isGsiUrl('https://www.gsi.gaiaonline.com/inventory')).toBe(true);
    expect(isGsiUrl('http://example.com/other')).toBe(false);
  });

  it('grants 25 of every bait and every rod', () => {
    const reply = gsiInventoryResponse();
    for (const bait of GUEST_BAITS) {
      expect(reply).toContain(`bait_${bait}=25`);
    }
    for (const rod of GUEST_RODS) {
      expect(reply).toContain(`rod_${rod}=1`);
    }
    expect(reply).toContain('success=1');
    // LoadVars format: key=value pairs joined by &
    for (const part of reply.split('&')) expect(part).toMatch(/^[^=]+=[^=]*$/);
  });

  it('answers inventory requests and logs everything', async () => {
    const log: string[] = [];
    const inventory = await gsiStubFetchText(
      'http://www.gaiaonline.com/gsi', 'POST', 'method=inventory&kind=rods',
      (level, message) => log.push(`${level}:${message}`),
    );
    expect(inventory).toContain('bait_gradeF=25');
    expect(log.some((l) => l.startsWith('info:') && l.includes('inventory reply'))).toBe(true);

    const other = await gsiStubFetchText(
      'http://www.gaiaonline.com/gsi', 'GET', null,
      (level, message) => log.push(`${level}:${message}`),
    );
    expect(other).toContain('success=1');
    expect(log.some((l) => l.includes('GET'))).toBe(true);

    // non-Gaia hosts stay offline
    const offline = await gsiStubFetchText('https://api.example.com/data', 'GET', null);
    expect(offline).toBeNull();
  });
});
