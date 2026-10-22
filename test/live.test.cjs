const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ProcmonClient } = require('../dist/procmon-client.js');
const { monitorHealth } = require('../dist/monitor-health.js');
const { log } = require('./helpers.cjs');

const endpoint = process.env.PROCMON_LIVE_ENDPOINT;

// Opt-in only: this issues one read-only GET and assumes a healthy live fixture.
test('live procmon snapshot validates and healthy enabled monitors are active',
  { skip: !endpoint, timeout: 10000 }, async t => {
    const snapshot = await new ProcmonClient(endpoint.replace(/\/+$/, ''), 5000, log).fetchStatus();
    assert.equal(snapshot.monitor_count, snapshot.monitors.length);
    const enabled = snapshot.monitors.filter(monitor => monitor.enabled && monitor.status !== 'disabled');
    assert.ok(enabled.length > 0, 'live fixture must include enabled monitors');
    for (const monitor of enabled) {
      assert.equal(monitor.status, 'healthy', `${monitor.id} should be healthy in the live fixture`);
      const health = monitorHealth(monitor);
      assert.equal(health.active, true, `${monitor.id} should have fresh health`);
      assert.equal(health.needsAttention, false, `${monitor.id} should have no fault`);
    }
    t.diagnostic(`procmon ${snapshot.app_version}: ${enabled.length} healthy active monitors`);
  });
