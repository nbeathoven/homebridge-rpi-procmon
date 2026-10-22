const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ProcmonClient } = require('../dist/procmon-client.js');
const { log, monitor, snapshot } = require('./helpers.cjs');

test('client requests /status and accepts a complete snapshot', async t => {
  const payload = snapshot();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'http://procmon.test/status');
    assert.equal(options.headers.Accept, 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => payload };
  });
  assert.deepEqual(await new ProcmonClient('http://procmon.test', 1000, log).fetchStatus(), payload);
});

const invalid = [
  ['null', null], ['array', []], ['missing monitors', { overall_status: 'healthy' }],
  ['null monitors', snapshot([], { monitors: null })],
  ['non-array monitors', snapshot([], { monitors: {} })],
  ['null monitor', snapshot([], { monitors: [null] })],
  ['missing id', snapshot([monitor({ id: undefined })])],
  ['blank id', snapshot([monitor({ id: ' ' })])],
  ['duplicate id', snapshot([monitor(), monitor()])],
  ['non-boolean enabled', snapshot([monitor({ enabled: 'true' })])],
  ['empty monitor status', snapshot([monitor({ status: '' })])],
  ['empty overall status', snapshot([], { overall_status: '' })],
  ['monitor count mismatch', snapshot([], { monitor_count: 1 })],
];
for (const [label, payload] of invalid) {
  test(`client rejects ${label}`, async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => payload }));
    await assert.rejects(new ProcmonClient('http://procmon.test', 1000, log).fetchStatus());
  });
}

test('client accepts an explicitly empty monitor list', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => snapshot([]) }));
  assert.deepEqual((await new ProcmonClient('http://procmon.test', 1000, log).fetchStatus()).monitors, []);
});

test('client rejects HTTP and JSON failures', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503, statusText: 'Unavailable' }));
  const client = new ProcmonClient('http://procmon.test', 1000, log);
  await assert.rejects(client.fetchStatus(), /503/);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } }));
  await assert.rejects(client.fetchStatus(), /bad JSON/);
});

test('timeout aborts an outstanding request and subsequent requests recover', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const client = new ProcmonClient('http://procmon.test', 10, log);
  await assert.rejects(client.fetchStatus(), { name: 'AbortError' });
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => snapshot() }));
  assert.equal((await client.fetchStatus()).monitors.length, 1);
});
