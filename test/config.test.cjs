const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeConfig, selectVisibleMonitors, overallNeedsAttention } = require('../dist/config.js');
const { log, monitor, snapshot } = require('./helpers.cjs');

test('config normalizes endpoint, bounded polling and filter IDs', () => {
  const config = normalizeConfig({ endpoint: ' http://localhost:9645/// ', pollIntervalSeconds: 1,
    requestTimeoutMs: 999999, includeMonitors: [' a ', '', 'a'], excludeMonitors: [' b '] }, log);
  assert.equal(config.endpoint, 'http://localhost:9645');
  assert.equal(config.pollIntervalSeconds, 5);
  assert.equal(config.requestTimeoutMs, 30000);
  assert.deepEqual([...config.includeMonitors], ['a']);
  assert.deepEqual([...config.excludeMonitors], ['b']);
});

test('healthy monitors stay visible once exposed with legacy hide flag', () => {
  const config = normalizeConfig({ hideHealthyMonitors: true }, log);
  assert.equal(selectVisibleMonitors(snapshot(), config).length, 0);
  assert.equal(selectVisibleMonitors(snapshot(), config, new Set(['service-a'])).length, 1);
});

test('disabled monitors are hidden by default and exposed only by opt-in', () => {
  const payload = snapshot([monitor({ enabled: false, status: 'disabled' })]);
  assert.equal(selectVisibleMonitors(payload, normalizeConfig({}, log)).length, 0);
  assert.equal(selectVisibleMonitors(payload, normalizeConfig({ exposeDisabledMonitors: true }, log)).length, 1);
});

test('overall recovering needs attention', () => {
  assert.equal(overallNeedsAttention('recovering'), true);
  assert.equal(overallNeedsAttention('healthy'), false);
});
