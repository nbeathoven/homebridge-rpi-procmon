const assert = require('node:assert/strict');
const { ProcmonPlatform } = require('../dist/platform.js');

const log = Object.fromEntries(['debug', 'info', 'warn', 'error', 'success'].map(key => [key, () => {}]));
const Characteristic = Object.fromEntries([
  'Name', 'Manufacturer', 'Model', 'SerialNumber', 'StatusActive',
].map(key => [key, key]));
Characteristic.ContactSensorState = { CONTACT_DETECTED: 0, CONTACT_NOT_DETECTED: 1 };
Characteristic.StatusFault = { NO_FAULT: 0, GENERAL_FAULT: 1 };
Characteristic.StatusTampered = { NOT_TAMPERED: 0 };

class Service {
  constructor() { this.values = new Map(); this.history = []; }
  setCharacteristic(key, value) {
    this.values.set(key, value);
    this.history.push([key, value]);
    return this;
  }
  updateCharacteristic(key, value) { return this.setCharacteristic(key, value); }
  getCharacteristic(key) {
    return { value: this.values.get(key), updateValue: value => this.setCharacteristic(key, value) };
  }
}

class Accessory {
  constructor(displayName, UUID) {
    this.displayName = displayName;
    this.UUID = UUID;
    this.context = {};
    this.services = new Map();
  }
  getService(type) { return this.services.get(type); }
  addService(type) { const service = new Service(); this.services.set(type, service); return service; }
}

function monitor(overrides = {}) {
  return { id: 'service-a', name: 'Service A', type: 'systemd-service', enabled: true,
    status: 'healthy', interval: '30s', last_check_finished_at: new Date().toISOString(), ...overrides };
}

function snapshot(monitors = [monitor()], overrides = {}) {
  const count = status => monitors.filter(m => m.status === status).length;
  return { app_version: '1.0.0', overall_status: 'healthy', monitor_count: monitors.length,
    healthy_count: count('healthy'), degraded_count: count('degraded'),
    recovering_count: count('recovering') + count('checking'), failed_count: count('failed'),
    disabled_count: count('disabled'), last_updated_at: new Date().toISOString(), monitors, ...overrides };
}

function harness(t, config = {}) {
  const registered = [], removed = [], updated = [];
  const api = {
    hap: { Characteristic, Service: { AccessoryInformation: 'information', ContactSensor: 'contact' },
      uuid: { generate: key => `uuid:${key}` } },
    platformAccessory: Accessory, on() {},
    registerPlatformAccessories: (_plugin, _platform, items) => registered.push(...items),
    unregisterPlatformAccessories: (_plugin, _platform, items) => removed.push(...items),
    updatePlatformAccessories: items => updated.push(...items),
  };
  const platform = new ProcmonPlatform(log, { platform: 'RpiProcmon', ...config }, api);
  let response = snapshot();
  t.mock.method(globalThis, 'fetch', async () => {
    if (response instanceof Error) throw response;
    return { ok: true, json: async () => structuredClone(response) };
  });
  return { platform, api, registered, removed, updated,
    async refresh(value) { response = value; await platform.refresh(); },
    accessory(kind, id = 'service-a') {
      const found = registered.find(a => a.context.kind === kind && (kind !== 'monitor' || a.context.monitorId === id));
      assert.ok(found, `expected ${kind} accessory ${id}`);
      return found;
    },
  };
}

function state(accessory) {
  const values = accessory.getService('contact').values;
  return { contact: values.get(Characteristic.ContactSensorState),
    active: values.get(Characteristic.StatusActive), fault: values.get(Characteristic.StatusFault) };
}

module.exports = { log, Characteristic, Accessory, monitor, snapshot, harness, state };
