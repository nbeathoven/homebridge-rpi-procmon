const assert = require('node:assert/strict');
const { test } = require('node:test');
const { monitor, snapshot, harness, state, Accessory, Characteristic } = require('./helpers.cjs');

for (const status of ['healthy', 'failed']) {
  test(`offline preserves ${status} contact, faults/inactivates, reconnects without replacement`, async t => {
    const h = harness(t);
    const payload = snapshot([monitor({ status })], { overall_status: status });
    await h.refresh(payload);
    const accessories = [h.accessory('monitor'), h.accessory('overall')];
    const previous = accessories.map(state);
    await h.refresh(new TypeError('fetch failed: offline'));
    accessories.forEach((a, i) => assert.deepEqual(state(a), { contact: previous[i].contact, active: false, fault: 1 }));
    assert.equal(h.removed.length, 0);
    await h.refresh(payload);
    accessories.forEach((a, i) => assert.deepEqual(state(a), previous[i]));
    assert.equal(h.registered.length, 2);
    assert.equal(h.removed.length, 0);
  });
}

test('invalid response never removes cached accessories; valid empty snapshot does', async t => {
  const h = harness(t);
  await h.refresh(snapshot());
  const accessory = h.accessory('monitor');
  for (const invalid of [{}, null, snapshot([], { monitors: null }), snapshot([monitor(), monitor()]),
    snapshot([], { monitor_count: 1 })]) {
    await h.refresh(invalid);
    assert.equal(h.removed.length, 0);
    assert.deepEqual(state(accessory), { contact: 0, active: false, fault: 1 });
  }
  await h.refresh(snapshot([]));
  assert.deepEqual(h.removed, [accessory]);
});

test('recovering remains an overall fault until healthy', async t => {
  const h = harness(t);
  await h.refresh(snapshot([monitor({ status: 'recovering' })], { overall_status: 'recovering' }));
  assert.deepEqual(state(h.accessory('overall')), { contact: 1, active: true, fault: 1 });
  assert.deepEqual(state(h.accessory('monitor')), { contact: 1, active: true, fault: 1 });
  await h.refresh(snapshot());
  assert.deepEqual(state(h.accessory('overall')), { contact: 0, active: true, fault: 0 });
});

test('legacy hideHealthyMonitors never churns accessories across status and name changes', async t => {
  const h = harness(t, { hideHealthyMonitors: true });
  await h.refresh(snapshot());
  assert.equal(h.registered.length, 1);
  await h.refresh(snapshot([monitor({ status: 'failed' })]));
  const accessory = h.accessory('monitor');
  const uuid = accessory.UUID;
  for (const status of ['failed', 'recovering', 'healthy', 'checking', 'healthy']) {
    await h.refresh(snapshot([monitor({ status, name: 'Renamed service' })]));
    assert.equal(h.accessory('monitor'), accessory);
    assert.equal(accessory.UUID, uuid);
    assert.equal(h.removed.length, 0);
    assert.equal(h.registered.length, 2);
  }
});

for (const status of ['healthy', 'failed']) {
  test(`checking preserves last ${status} outcome`, async t => {
    const h = harness(t);
    const finishedAt = new Date().toISOString();
    await h.refresh(snapshot([monitor({ status, last_check_finished_at: finishedAt })]));
    const accessory = h.accessory('monitor');
    const previous = state(accessory);
    await h.refresh(snapshot([monitor({ status: 'checking', last_check_finished_at: finishedAt,
      last_check_started_at: new Date().toISOString() })], { overall_status: 'checking' }));
    assert.deepEqual(state(accessory), previous);
    assert.equal(state(h.accessory('overall')).fault, previous.fault);
  });
}

test('include/exclude filters and disabled visibility still apply', async t => {
  const h = harness(t, { includeMonitors: ['service-a', 'excluded'], excludeMonitors: ['excluded'] });
  await h.refresh(snapshot([monitor(), monitor({ id: 'excluded' }), monitor({ id: 'other' }),
    monitor({ id: 'disabled', enabled: false, status: 'disabled' })]));
  assert.equal(h.registered.filter(a => a.context.kind === 'monitor').length, 1);
  assert.equal(h.accessory('monitor').context.monitorId, 'service-a');
});

test('exposed disabled monitors are inactive', async t => {
  const h = harness(t, { exposeDisabledMonitors: true });
  await h.refresh(snapshot([monitor({ enabled: false, status: 'disabled' })]));
  assert.equal(state(h.accessory('monitor')).active, false);
  assert.deepEqual(state(h.accessory('monitor')), { contact: 0, active: false, fault: 0 });
  assert.deepEqual(state(h.accessory('overall')), { contact: 0, active: false, fault: 0 });
});

test('cached startup marks sensors inactive and faulty without changing contact', t => {
  const h = harness(t);
  for (const kind of ['monitor', 'overall']) {
    const accessory = new Accessory('Cached', `cached-${kind}`);
    accessory.context = kind === 'monitor' ? { kind, monitorId: 'service-a' } : { kind };
    accessory.addService('contact').setCharacteristic(Characteristic.ContactSensorState, 0)
      .setCharacteristic(Characteristic.StatusActive, true).setCharacteristic(Characteristic.StatusFault, 0);
    h.platform.configureAccessory(accessory);
    assert.deepEqual(state(accessory), { contact: 0, active: false, fault: 1 });
  }
});

test('overall includes faults excluded from per-monitor accessories', async t => {
  const h = harness(t, { excludeMonitors: ['hidden'] });
  await h.refresh(snapshot([monitor(), monitor({ id: 'hidden', status: 'failed' })]));
  assert.deepEqual(state(h.accessory('monitor')), { contact: 0, active: true, fault: 0 });
  assert.deepEqual(state(h.accessory('overall')), { contact: 1, active: true, fault: 1 });
  assert.equal(h.registered.length, 2);
});

test('excluded healthy monitor checking does not create a false overall alert', async t => {
  const h = harness(t, { excludeMonitors: ['hidden'] });
  const finishedAt = new Date().toISOString();
  await h.refresh(snapshot([monitor({ id: 'hidden', last_check_finished_at: finishedAt })]));
  await h.refresh(snapshot([monitor({ id: 'hidden', status: 'checking', last_check_finished_at: finishedAt })],
    { overall_status: 'checking' }));
  assert.deepEqual(state(h.accessory('overall')), { contact: 0, active: true, fault: 0 });
});

for (const status of ['healthy', 'checking']) {
  test(`stale ${status} faults and inactivates despite successful HTTP`, async t => {
    const h = harness(t);
    const now = Date.now();
    const finishedAt = new Date(now).toISOString();
    t.mock.method(Date, 'now', () => now);
    await h.refresh(snapshot([monitor({ last_check_finished_at: finishedAt })]));
    Date.now.mock.mockImplementation(() => now + 24 * 60 * 60 * 1000);
    await h.refresh(snapshot([monitor({ status, last_check_finished_at: finishedAt })]));
    assert.equal(state(h.accessory('monitor')).active, false);
    assert.equal(state(h.accessory('monitor')).fault, 1);
    assert.equal(state(h.accessory('overall')).active, false);
    assert.equal(state(h.accessory('overall')).fault, 1);
  });
}

test('checking with no known completed outcome is not healthy', async t => {
  const h = harness(t);
  await h.refresh(snapshot([monitor({ status: 'checking', last_check_finished_at: undefined })]));
  assert.deepEqual(state(h.accessory('monitor')), { contact: 1, active: false, fault: 1 });
});

test('checking grace expires at the stale deadline and fresh completion recovers', async t => {
  const h = harness(t);
  const now = Date.now();
  const finishedAt = new Date(now).toISOString();
  const clock = t.mock.method(Date, 'now', () => now);
  await h.refresh(snapshot([monitor({ last_check_finished_at: finishedAt })]));
  clock.mock.mockImplementation(() => now + 360000);
  const checking = snapshot([monitor({ status: 'checking', interval: '30s', last_check_finished_at: finishedAt })],
    { overall_status: 'checking' });
  await h.refresh(checking);
  assert.deepEqual(state(h.accessory('monitor')), { contact: 0, active: true, fault: 0 });
  clock.mock.mockImplementation(() => now + 360001);
  await h.refresh(checking);
  assert.equal(state(h.accessory('monitor')).active, false);
  assert.equal(state(h.accessory('monitor')).fault, 1);
  await h.refresh(snapshot([monitor({ last_check_finished_at: new Date(now + 360001).toISOString() })]));
  assert.deepEqual(state(h.accessory('monitor')), { contact: 0, active: true, fault: 0 });
  assert.equal(h.registered.length, 2);
  assert.equal(h.removed.length, 0);
});

test('restored cached accessories retain UUID and completed checking outcome', async t => {
  const first = harness(t);
  const finishedAt = new Date().toISOString();
  await first.refresh(snapshot([monitor({ last_check_finished_at: finishedAt })]));
  const restored = harness(t);
  for (const accessory of first.registered) restored.platform.configureAccessory(accessory);
  await restored.refresh(snapshot([monitor({ status: 'checking', last_check_finished_at: finishedAt })],
    { overall_status: 'checking' }));
  assert.equal(restored.registered.length, 0);
  assert.equal(restored.removed.length, 0);
  assert.ok(restored.updated.includes(first.accessory('monitor')));
  assert.deepEqual(state(first.accessory('monitor')), { contact: 0, active: true, fault: 0 });
});

test('overlapping polls do not issue concurrent requests', async t => {
  const h = harness(t);
  let resolve;
  const fetch = t.mock.method(globalThis, 'fetch', () => new Promise(done => { resolve = done; }));
  const first = h.platform.refresh();
  await h.platform.refresh();
  assert.equal(fetch.mock.callCount(), 1);
  resolve({ ok: true, json: async () => snapshot() });
  await first;
  assert.equal(h.registered.length, 2);
});

test('monitor named overall has distinct stable identity from supervisor', async t => {
  const h = harness(t);
  await h.refresh(snapshot([monitor({ id: 'overall' })]));
  const monitorAccessory = h.accessory('monitor', 'overall');
  const supervisor = h.accessory('overall');
  assert.notEqual(monitorAccessory.UUID, supervisor.UUID);
  await h.refresh(snapshot([monitor({ id: 'overall', status: 'failed' })]));
  assert.equal(h.registered.length, 2);
  assert.equal(h.removed.length, 0);
  assert.equal(state(monitorAccessory).fault, 1);
  assert.equal(supervisor.context.kind, 'overall');
});
