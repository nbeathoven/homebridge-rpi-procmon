# homebridge-rpi-procmon

`homebridge-rpi-procmon` is a Homebridge dynamic platform plugin that reads the `rpi-procmon` HTTP API and exposes monitor health into Apple Home.

## Current Scope

- Polls `GET /status` from `rpi-procmon`
- Exposes one optional overall Contact Sensor for the procmon supervisor
- Exposes one Contact Sensor per selected procmon monitor, with labels that distinguish services, containers, and plugin-level monitors
- Updates cached accessories dynamically as monitor inventory changes

This plugin is intentionally read-only. Procmon now supports authenticated control endpoints, but this plugin does not call them or require an admin token. It remains compatible with procmon v0.3.0 and its legacy `/status` endpoint.

## Accessory Mapping

- Overall procmon status: `ContactSensor`
  - `Closed` = healthy
  - `Open` = degraded, failed, recovering, unknown
- Per-monitor health: `ContactSensor`
  - `Closed` = healthy
  - `Open` = degraded, failed, recovering, unknown

Naming model:

- `Rpi Procmon Supervisor`
- `Service: Homebridge`
- `Container: Scrypted`
- `Plugin: Scrypted Arlo`

That keeps procmon itself visually distinct from the items it monitors, while still using a simple binary health model in Apple Home. Text-heavy issue history belongs in a Homebridge UI, not in HomeKit characteristics.

Transport failures mark cached sensors inactive/faulted without replacing their last service-health contact reading. A closed sensor alone therefore does not establish current health: also consider availability/fault status. A successful valid poll restores availability. Malformed snapshots are rejected without deleting accessories.

During a normal `checking` state, retain the last completed reading rather than generating a false service alert. Stale checks are faulted instead of remaining healthy indefinitely. Disabled monitors, when explicitly exposed, are inactive rather than service failures.

Freshness uses each monitor's `last_check_finished_at`, with an allowance of twice its configured interval plus five minutes for execution, and 30 seconds of clock skew. Missing/invalid intervals use one minute. Keep the Homebridge and procmon clocks synchronized. Freshness is reevaluated on polls; transport failures are reported when the request fails or times out. The overall sensor evaluates all enabled monitors, including those excluded from individual accessory display; an empty/all-disabled inventory is inactive.

`hideHealthyMonitors` hides healthy monitors only until first exposure. Once registered, a monitor remains present after recovery to preserve HomeKit identity and automations. Explicit filtering, disabling with the default hide-disabled policy, or actual inventory removal can still remove accessories.

Configure one procmon platform per Homebridge process. Existing accessory UUIDs are retained; the special monitor ID `overall` uses a separate namespace so it cannot collide with the supervisor sensor. Remote hostnames or addresses do not change accessory identity.

## Installation

```bash
npm install -g homebridge-rpi-procmon
```

## Example Config

```json
{
  "platform": "RpiProcmon",
  "name": "Rpi Procmon",
  "endpoint": "http://192.168.0.1:9645",
  "pollIntervalSeconds": 15,
  "requestTimeoutMs": 4000,
  "exposeOverallSensor": true,
  "exposeDisabledMonitors": false,
  "hideHealthyMonitors": false,
  "includeMonitors": [],
  "excludeMonitors": []
}
```

## Development

```bash
npm install
npm run check
```

## Publishing Notes

- Package name: `homebridge-rpi-procmon`
- Plugin alias: `RpiProcmon`
- Requires `homebridge` `^1.11.2 || ^2.0.0-alpha.0`
- Requires Node `^18.15.0 || ^20.7.0 || ^22 || ^24`

## Roadmap

- Add a Homebridge custom UI for recent issues and recovery history
- Consider separately authorized service-recovery controls; never expose arbitrary command execution
