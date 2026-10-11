import { createMockServer } from '../../src/lib/gameServerStub.ts';
import { phpUnserialize, parseGatewayRequest } from '../../src/lib/gsiStub.ts';

const server = createMockServer();

async function main() {
  const url = 'http://www.gaiaonline.com/chat/gsi/gateway.php';
  const body = 'm=' + encodeURIComponent('a:1:{i:0;a:2:{i:0;s:2:"50";i:1;a:1:{i:0;s:1:"1";}}}') + '&v=phpobject&X=1';

  console.log('=== Mock GSI Gateway Diagnostic ===');
  console.log('URL:', url);
  console.log('Body:', body);

  const result = await server.fetchText(
    url,
    'POST',
    body,
    (level, msg) => console.log(`[mock-log ${level}]`, msg),
    (event) => console.log('[network]', event.kind, event.status, event.message ?? ''),
  );

  console.log('Raw response (first 300 chars):', result ? result.slice(0, 300) : '(null)');

  if (!result) {
    console.error('FAIL: fetchText returned null/empty — gateway blocked or error');
    process.exit(1);
  }

  const parsed = parseGatewayRequest(body);
  console.log('Parsed gateway calls:', parsed.map(([id]) => id));

  // The response should be URL-encoded PHP serialized array of rows
  // Each row is [0, true, <payload>]
  const decoded = decodeURIComponent(result);
  console.log('URL-decoded (first 300 chars):', decoded.slice(0, 300));

  let payload = null;
  try {
    payload = phpUnserialize(decoded);
  } catch (e) {
    console.error('FAIL: phpUnserialize threw:', e);
    process.exit(1);
  }

  console.log('PHP-unserialized payload type:', typeof payload, Array.isArray(payload) ? 'array' : 'object');
  console.log('Payload length (if array):', Array.isArray(payload) ? payload.length : 'N/A');

  if (Array.isArray(payload) && payload.length > 0) {
    const firstRow = payload[0];
    console.log('First row:', JSON.stringify(firstRow));

    // The payload from fetchText is the full rows array
    // We need to extract the method 50 result from it
    // Row format: [0, true, <result>]
    const methodResult = firstRow?.[2] ?? payload?.[0]?.[2];
    console.log('Method 50 result (extracted):', JSON.stringify(methodResult)?.slice(0, 300));

    if (Array.isArray(methodResult) && methodResult.length === 2) {
      const names = methodResult.map((s: any) => s?.name ?? s?.[3] ?? s);
      console.log('PASS: Server list has', methodResult.length, 'entries —', names.join(', '));
    } else if (Array.isArray(methodResult) && methodResult.length === 0) {
      console.error('FAIL: Server list is empty array (0 servers returned)');
      process.exit(1);
    } else {
      console.error('FAIL: Unexpected method result format:', methodResult);
      process.exit(1);
    }
  } else {
    console.error('FAIL: Payload not in expected array format');
    process.exit(1);
  }

  console.log('=== All checks passed ===');
}

main().catch((e) => {
  console.error('Diagnostic crashed:', e);
  process.exit(1);
});
