const assert = require('node:assert/strict');
const { test } = require('node:test');
const { monitorHealth } = require('../dist/monitor-health.js');
const { ProcmonPlatform } = require('../dist/platform.js');
const { log, monitor, snapshot, harness, state } = require('./helpers.cjs');

const now = Date.parse('2026-10-22T04:00:00.000Z');

function healthAt(status, finishedAt, interval = '30s') {
  return monitorHealth(monitor({ status, interval, last_check_finished_at: finishedAt }),
    { needsAttention: false, finishedAt }, now);
}

function assertFreshness(health, fresh) {
  assert.equal(health.active, fresh);
  assert.equal(health.needsAttention, !fresh);
}

for (const status of ['healthy', 'checking']) {
  test(`${status}: future timestamp allows exactly 30 seconds but not 30 seconds plus 1ms`, () => {
    assertFreshness(healthAt(status, new Date(now + 30000).toISOString()), true);
    assertFreshness(healthAt(status, new Date(now + 30001).toISOString()), false);
  });

  for (const [label, finishedAt] of [['missing', undefined], ['empty', ''], ['invalid', 'not-a-timestamp']]) {
    test(`${status}: ${label} completion timestamp faults and inactivates`, () => {
      assertFreshness(healthAt(status, finishedAt), false);
    });
  }

  for (const [interval, deadlineMs] of [['5m', 900000], ['2h', 14700000]]) {
    test(`${status}: ${interval} freshness is exactly twice interval plus five-minute grace, uncapped`, () => {
      assertFreshness(healthAt(status, new Date(now - deadlineMs).toISOString(), interval), true);
      assertFreshness(healthAt(status, new Date(now - deadlineMs - 1).toISOString(), interval), false);
    });
  }
}

test('second platform with same API is rejected without disturbing the original', async t => {
  const h = harness(t);
  assert.throws(() => new ProcmonPlatform(log,
    { platform: 'RpiProcmon', endpoint: 'http://different-endpoint.test' }, h.api),
  /only one platform instance per Homebridge API/);
  await h.refresh(snapshot());
  assert.equal(h.registered.length, 2);
  assert.deepEqual(state(h.accessory('monitor')), { contact: 0, active: true, fault: 0 });
  assert.doesNotThrow(() => harness(t));
});
